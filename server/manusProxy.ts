import axios, { type AxiosRequestConfig } from "axios";

const DEFAULT_BASE_URL = "https://api.manus.im";
const TIMEOUT_MS = 120_000; // MANUS tasks can take a while

export interface ManusProxyOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface CreateTaskParams {
  prompt: string;
  agentProfile?: string; // manus-1.6 | manus-1.6-lite | manus-1.6-max
  taskMode?: string; // chat | adaptive | agent
  projectId?: string;
  previousResponseId?: string;
  taskId?: string;
  attachments?: Array<{
    type: string;
    [key: string]: unknown;
  }>;
  hideInTaskList?: boolean;
  createShareableLink?: boolean;
}

export interface ManusTaskResponse {
  id: string;
  status: string;
  model?: string;
  metadata?: {
    task_url?: string;
    share_url?: string;
    task_title?: string;
    credit_usage?: string;
  };
  output?: Array<{
    id?: string;
    role: string;
    content: Array<{
      type: string;
      text?: string;
      fileUrl?: string;
      fileName?: string;
      mimeType?: string;
    }>;
  }>;
}

/**
 * Create a MANUS API client with the given credentials.
 */
function createClient(options: ManusProxyOptions) {
  const baseURL = options.baseUrl || DEFAULT_BASE_URL;

  return axios.create({
    baseURL,
    timeout: TIMEOUT_MS,
    headers: {
      "Content-Type": "application/json",
      API_KEY: options.apiKey,
    },
  });
}

/**
 * Create a new task on MANUS.
 * Uses the OpenAI-compatible responses endpoint.
 */
export async function createManusTask(
  options: ManusProxyOptions,
  params: CreateTaskParams
): Promise<ManusTaskResponse> {
  const client = createClient(options);

  const input: Array<Record<string, unknown>> = [
    {
      role: "user",
      content: buildContentArray(params),
    },
  ];

  const body: Record<string, unknown> = {
    input,
    model: params.agentProfile || "manus-1.6",
    extra_body: {
      task_mode: params.taskMode || "agent",
      agent_profile: params.agentProfile || "manus-1.6",
    },
  };

  if (params.projectId) {
    (body.extra_body as Record<string, unknown>).project_id = params.projectId;
  }

  if (params.previousResponseId) {
    body.previous_response_id = params.previousResponseId;
  }

  if (params.hideInTaskList) {
    (body.extra_body as Record<string, unknown>).hide_in_task_list = true;
  }

  if (params.createShareableLink) {
    (body.extra_body as Record<string, unknown>).create_shareable_link = true;
  }

  const response = await client.post("/v1/responses", body);
  return response.data;
}

/**
 * Continue an existing MANUS task (multi-turn conversation).
 */
export async function continueManusTask(
  options: ManusProxyOptions,
  params: {
    previousResponseId: string;
    prompt: string;
    agentProfile?: string;
    taskMode?: string;
    attachments?: CreateTaskParams["attachments"];
  }
): Promise<ManusTaskResponse> {
  const client = createClient(options);

  const input: Array<Record<string, unknown>> = [
    {
      role: "user",
      content: buildContentArray({
        prompt: params.prompt,
        attachments: params.attachments,
      }),
    },
  ];

  const body: Record<string, unknown> = {
    input,
    model: params.agentProfile || "manus-1.6",
    previous_response_id: params.previousResponseId,
    extra_body: {
      task_mode: params.taskMode || "agent",
      agent_profile: params.agentProfile || "manus-1.6",
    },
  };

  const response = await client.post("/v1/responses", body);
  return response.data;
}

/**
 * Get task details/status from MANUS.
 */
export async function getManusTask(
  options: ManusProxyOptions,
  taskId: string
): Promise<ManusTaskResponse> {
  const client = createClient(options);
  const response = await client.get(`/v1/responses/${taskId}`);
  return response.data;
}

/**
 * List tasks from MANUS API.
 */
export async function listManusTasks(
  options: ManusProxyOptions,
  params?: {
    limit?: number;
    status?: string[];
    order?: "asc" | "desc";
  }
): Promise<{ data: ManusTaskResponse[]; has_more: boolean; last_id?: string }> {
  const client = createClient(options);

  let url = "/v1/tasks?";
  const queryParts: string[] = [];

  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.order) queryParts.push(`order=${params.order}`);
  if (params?.status) {
    params.status.forEach((s) => queryParts.push(`status=${s}`));
  }

  url += queryParts.join("&");

  const response = await client.get(url);
  return response.data;
}

/**
 * Delete a task on MANUS.
 */
export async function deleteManusTask(
  options: ManusProxyOptions,
  taskId: string
): Promise<void> {
  const client = createClient(options);
  await client.delete(`/v1/responses/${taskId}`);
}

// ─── Helpers ────────────────────────────────────────────────────

function buildContentArray(params: Pick<CreateTaskParams, "prompt" | "attachments">) {
  const content: Array<Record<string, unknown>> = [
    { type: "input_text", text: params.prompt },
  ];

  if (params.attachments) {
    for (const attachment of params.attachments) {
      content.push(attachment);
    }
  }

  return content;
}
