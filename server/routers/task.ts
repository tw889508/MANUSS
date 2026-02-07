import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { decrypt } from "../crypto";
import {
  getAccountById,
  createTask,
  getTaskById,
  getTaskByManusId,
  listTasksByUser,
  updateTask,
  deleteTask,
} from "../db";
import {
  createManusTask,
  continueManusTask,
  getManusTask,
} from "../manusProxy";
import { TRPCError } from "@trpc/server";
import type { ConversationMessage } from "../../drizzle/schema";

/**
 * Helper: resolve account credentials from accountId + userId.
 */
async function resolveAccount(accountId: number, userId: number) {
  const account = await getAccountById(accountId, userId);
  if (!account) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  }
  const apiKey = decrypt(account.apiKeyEncrypted);
  return { account, apiKey, baseUrl: account.apiBaseUrl };
}

/**
 * Helper: parse MANUS response output into ConversationMessage[].
 */
function parseManusOutput(output: any[]): ConversationMessage[] {
  if (!output || !Array.isArray(output)) return [];

  return output.map((msg) => ({
    id: msg.id,
    role: msg.role as "user" | "assistant",
    content: (msg.content || []).map((c: any) => {
      if (c.type === "output_file" || c.fileUrl) {
        return {
          type: "file" as const,
          text: c.text,
          fileUrl: c.fileUrl,
          fileName: c.fileName,
          mimeType: c.mimeType,
        };
      }
      return {
        type: "text" as const,
        text: c.text || "",
      };
    }),
    timestamp: Date.now(),
  }));
}

export const taskRouter = router({
  /**
   * Create a new MANUS task.
   */
  create: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        prompt: z.string().min(1, "Prompt is required"),
        agentProfile: z.enum(["manus-1.6", "manus-1.6-lite", "manus-1.6-max"]).optional(),
        taskMode: z.enum(["chat", "adaptive", "agent"]).optional(),
        projectId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { apiKey, baseUrl } = await resolveAccount(input.accountId, ctx.user.id);

      // Call MANUS API
      const manusResponse = await createManusTask(
        { apiKey, baseUrl },
        {
          prompt: input.prompt,
          agentProfile: input.agentProfile || "manus-1.6",
          taskMode: input.taskMode || "agent",
          projectId: input.projectId,
        }
      );

      // Build initial conversation history
      const userMessage: ConversationMessage = {
        role: "user",
        content: [{ type: "text", text: input.prompt }],
        timestamp: Date.now(),
      };

      const conversationHistory: ConversationMessage[] = [userMessage];

      // If MANUS already returned output, append it
      if (manusResponse.output) {
        const parsed = parseManusOutput(manusResponse.output);
        // Filter out the user message echo from MANUS
        const assistantMessages = parsed.filter((m) => m.role === "assistant");
        conversationHistory.push(...assistantMessages);
      }

      // Save to local DB
      const task = await createTask({
        manusTaskId: manusResponse.id,
        userId: ctx.user.id,
        accountId: input.accountId,
        title: manusResponse.metadata?.task_title || input.prompt.slice(0, 100),
        status: manusResponse.status as any || "unknown",
        agentProfile: input.agentProfile || "manus-1.6",
        taskMode: input.taskMode || "agent",
        projectId: input.projectId || null,
        taskUrl: manusResponse.metadata?.task_url || null,
        shareUrl: manusResponse.metadata?.share_url || null,
        creditUsage: manusResponse.metadata?.credit_usage
          ? parseInt(manusResponse.metadata.credit_usage, 10)
          : 0,
        conversationHistory,
      });

      return {
        id: task.id,
        manusTaskId: manusResponse.id,
        status: manusResponse.status,
        taskUrl: manusResponse.metadata?.task_url,
        conversationHistory,
      };
    }),

  /**
   * Continue an existing task (multi-turn conversation).
   */
  continue: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        prompt: z.string().min(1, "Prompt is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId, ctx.user.id);
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      const { apiKey, baseUrl } = await resolveAccount(task.accountId, ctx.user.id);

      // Call MANUS API with previous_response_id
      const manusResponse = await continueManusTask(
        { apiKey, baseUrl },
        {
          previousResponseId: task.manusTaskId,
          prompt: input.prompt,
          agentProfile: task.agentProfile || "manus-1.6",
          taskMode: task.taskMode || "agent",
        }
      );

      // Update conversation history
      const history: ConversationMessage[] = Array.isArray(task.conversationHistory)
        ? [...task.conversationHistory]
        : [];

      // Add user message
      history.push({
        role: "user",
        content: [{ type: "text", text: input.prompt }],
        timestamp: Date.now(),
      });

      // Add assistant response if available
      if (manusResponse.output) {
        const parsed = parseManusOutput(manusResponse.output);
        const assistantMessages = parsed.filter((m) => m.role === "assistant");
        history.push(...assistantMessages);
      }

      // Update the task's manusTaskId to the new response ID for next continuation
      await updateTask(task.id, ctx.user.id, {
        status: manusResponse.status as any || task.status,
        taskUrl: manusResponse.metadata?.task_url || task.taskUrl,
        creditUsage: manusResponse.metadata?.credit_usage
          ? (task.creditUsage || 0) + parseInt(manusResponse.metadata.credit_usage, 10)
          : task.creditUsage,
        conversationHistory: history,
      });

      return {
        id: task.id,
        manusTaskId: manusResponse.id,
        status: manusResponse.status,
        taskUrl: manusResponse.metadata?.task_url,
        conversationHistory: history,
      };
    }),

  /**
   * Get task details. Also fetches latest status from MANUS and syncs.
   */
  get: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId, ctx.user.id);
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      // If task is still running, fetch latest from MANUS
      if (task.status === "running" || task.status === "pending" || task.status === "unknown") {
        try {
          const { apiKey, baseUrl } = await resolveAccount(task.accountId, ctx.user.id);
          const manusResponse = await getManusTask({ apiKey, baseUrl }, task.manusTaskId);

          const updates: Record<string, any> = {
            status: manusResponse.status as any,
          };

          if (manusResponse.metadata?.task_title && task.title === "Untitled Task") {
            updates.title = manusResponse.metadata.task_title;
          }
          if (manusResponse.metadata?.credit_usage) {
            updates.creditUsage = parseInt(manusResponse.metadata.credit_usage, 10);
          }
          if (manusResponse.metadata?.task_url) {
            updates.taskUrl = manusResponse.metadata.task_url;
          }

          // Sync full conversation from MANUS output
          if (manusResponse.output && manusResponse.output.length > 0) {
            updates.conversationHistory = parseManusOutput(manusResponse.output);
          }

          await updateTask(task.id, ctx.user.id, updates);

          return {
            ...task,
            ...updates,
          };
        } catch (error) {
          // If MANUS fetch fails, return cached data
          console.warn("[Task.get] Failed to fetch from MANUS:", error);
        }
      }

      return task;
    }),

  /**
   * Lightweight status poll — only returns status, no full sync.
   */
  poll: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId, ctx.user.id);
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      if (task.status === "running" || task.status === "pending") {
        try {
          const { apiKey, baseUrl } = await resolveAccount(task.accountId, ctx.user.id);
          const manusResponse = await getManusTask({ apiKey, baseUrl }, task.manusTaskId);

          if (manusResponse.status !== task.status) {
            await updateTask(task.id, ctx.user.id, {
              status: manusResponse.status as any,
            });
          }

          return {
            id: task.id,
            manusTaskId: task.manusTaskId,
            status: manusResponse.status,
          };
        } catch {
          // Return cached status on error
        }
      }

      return {
        id: task.id,
        manusTaskId: task.manusTaskId,
        status: task.status,
      };
    }),

  /**
   * List tasks for the current user, optionally filtered by account.
   */
  list: protectedProcedure
    .input(
      z.object({
        accountId: z.number().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const result = await listTasksByUser(ctx.user.id, input?.accountId);
      return result;
    }),

  /**
   * Delete a local task record.
   */
  delete: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId, ctx.user.id);
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      await deleteTask(input.taskId, ctx.user.id);
      return { success: true };
    }),
});
