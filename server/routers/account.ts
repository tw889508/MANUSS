import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { encrypt, decrypt } from "../crypto";
import {
  createAccount,
  listAccountsByUser,
  getAccountById,
  deleteAccount,
  setDefaultAccount,
} from "../db";
import { listManusTasks } from "../manusProxy";
import { TRPCError } from "@trpc/server";

export const accountRouter = router({
  /**
   * Create a new MANUS API account.
   * Encrypts the API key before storing.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Account name is required").max(255),
        apiKey: z.string().min(1, "API Key is required"),
        apiBaseUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const apiKeyEncrypted = encrypt(input.apiKey);

      const account = await createAccount({
        userId: ctx.user.id,
        name: input.name,
        apiKeyEncrypted,
        apiBaseUrl: input.apiBaseUrl || "https://api.manus.im",
        isDefault: 0,
      });

      return {
        id: account.id,
        name: account.name,
        apiBaseUrl: account.apiBaseUrl,
        isDefault: 0,
      };
    }),

  /**
   * List all accounts for the current user.
   * Never returns the encrypted API key to the frontend.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const result = await listAccountsByUser(ctx.user.id);
    return result;
  }),

  /**
   * Delete an account by ID.
   */
  delete: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountById(input.accountId, ctx.user.id);
      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      await deleteAccount(input.accountId, ctx.user.id);
      return { success: true };
    }),

  /**
   * Set an account as the default for the current user.
   */
  setDefault: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountById(input.accountId, ctx.user.id);
      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      await setDefaultAccount(input.accountId, ctx.user.id);
      return { success: true };
    }),

  /**
   * Test an account's API key by making a lightweight request to MANUS.
   * Tries to list tasks with limit=1 to verify the key works.
   */
  test: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountById(input.accountId, ctx.user.id);
      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      try {
        const apiKey = decrypt(account.apiKeyEncrypted);
        const result = await listManusTasks(
          { apiKey, baseUrl: account.apiBaseUrl },
          { limit: 1 }
        );

        return {
          success: true,
          message: "API Key is valid. Connection successful.",
        };
      } catch (error: any) {
        const statusCode = error?.response?.status;
        const message =
          statusCode === 401
            ? "Invalid API Key. Please check and try again."
            : statusCode === 403
              ? "API Key does not have sufficient permissions."
              : `Connection failed: ${error?.message || "Unknown error"}`;

        return {
          success: false,
          message,
        };
      }
    }),
});
