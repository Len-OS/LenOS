/** Typed LenGrowth boundary for LenOS Growth OS UI operations. */

import type {
  GrowthApiErrorCode,
  GrowthAssessmentResponse,
  GrowthCompany,
  GrowthCompanyCreateResponse,
  GrowthCompanyMember,
  GrowthCron,
  GrowthCorrelationEnvelope,
  GrowthOnboardingExtract,
  GrowthOnboardingExtractInput,
  GrowthReadinessSummary,
  GrowthRequestOptions,
  GrowthTaskCreate,
  GrowthTaskFeedbackType,
  GrowthTaskUpdate,
  GrowthTelemetryEventType,
  GrowthWorkspaceIntegration,
} from "./growth-types";
export type {
  GrowthApiErrorCode,
  GrowthAssessmentResponse,
  GrowthAssessmentTask,
  GrowthCompany,
  GrowthCompanyCreateResponse,
  GrowthCompanyMember,
  GrowthCron,
  GrowthCorrelationEnvelope,
  GrowthOnboardingExtract,
  GrowthOnboardingExtractInput,
  GrowthReadinessSummary,
  GrowthRequestOptions,
  GrowthTaskCreate,
  GrowthTaskFeedbackType,
  GrowthTaskUpdate,
  GrowthTelemetryEventType,
  GrowthWorkspaceIntegration,
} from "./growth-types";

const DEFAULT_API_BASE = "https://growth-api.lenquant.com";

export function growthCompanyStorageKey(workspaceSlug: string): string {
  return `lengrowth-company-id:${workspaceSlug}`;
}

export class GrowthApiError extends Error {
  constructor(
    message: string,
    public readonly code: GrowthApiErrorCode,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "GrowthApiError";
  }
}

type GrowthRequest = {
  token?: string | null;
  envelope?: GrowthCorrelationEnvelope;
  signal?: AbortSignal;
  body?: unknown;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

function apiBase(): string {
  return (
    (import.meta.env.VITE_LENGROWTH_API_URL as string | undefined) ??
    DEFAULT_API_BASE
  );
}

function bearerToken(token?: string | null): string | null {
  return token ?? localStorage.getItem("lenos_managed_signer_token");
}

function errorCode(status: number, detail?: unknown): GrowthApiErrorCode {
  if (typeof detail === "object" && detail !== null && "code" in detail) {
    const code = String((detail as { code?: unknown }).code);
    if (code === "unlinked") return "unlinked";
    if (code === "internal") return "internal";
    if (code === "growth_flag_disabled") return "growth_flag_disabled";
  }
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 409) return "stale_version";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "dependency_unavailable";
  return "unknown";
}

function errorMessage(
  detail: unknown,
  bodyMessage: unknown,
  fallback: string,
): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof detail === "object" && detail !== null && "message" in detail) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof bodyMessage === "string" && bodyMessage.trim()) return bodyMessage;
  return fallback;
}

function requestHeaders(options?: GrowthRequest): Headers {
  const headers = new Headers({ Accept: "application/json" });
  const token = bearerToken(options?.token);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!options) return headers;
  const envelope = options.envelope;
  if (!envelope) return headers;
  headers.set("X-Correlation-ID", envelope.correlationId);
  headers.set("Idempotency-Key", envelope.idempotencyKey);
  headers.set("X-LenOS-Workspace", envelope.workspaceSlug);
  headers.set("X-LenOS-Relay-Community", envelope.relayCommunityId);
  if (envelope.originEventId)
    headers.set("X-LenOS-Origin-Event", envelope.originEventId);
  if (envelope.originChannelId)
    headers.set("X-LenOS-Origin-Channel", envelope.originChannelId);
  if (envelope.originThreadId)
    headers.set("X-LenOS-Origin-Thread", envelope.originThreadId);
  if (envelope.actorPubkey)
    headers.set("X-LenOS-Actor-Pubkey", envelope.actorPubkey);
  if (envelope.companyId) headers.set("X-LenOS-Company", envelope.companyId);
  return headers;
}

async function request<T>(path: string, options?: GrowthRequest): Promise<T> {
  const headers = requestHeaders(options);
  if (options?.body !== undefined)
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: options?.method ?? "GET",
      headers,
      body:
        options?.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options?.signal ?? AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    const message =
      cause instanceof DOMException && cause.name === "TimeoutError"
        ? "LenGrowth took too long to respond. Retry when the connection is available."
        : "LenGrowth is unavailable. Check the connection and retry.";
    throw new GrowthApiError(message, "dependency_unavailable", 503);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown;
      message?: string;
    } | null;
    const detail = body?.detail;
    const message = errorMessage(detail, body?.message, response.statusText);
    throw new GrowthApiError(
      message,
      errorCode(response.status, detail),
      response.status,
      response.headers.get("X-Request-ID") ?? undefined,
    );
  }
  return (await response.json()) as T;
}

export const growthQueryKeys = {
  readiness: (workspaceSlug: string) =>
    ["growth", "readiness", workspaceSlug] as const,
  tasks: (workspaceSlug: string, status?: string) =>
    ["growth", "tasks", workspaceSlug, status ?? "all"] as const,
  specialists: (workspaceSlug: string) =>
    ["growth", "specialists", workspaceSlug] as const,
  companies: (workspaceSlug: string) =>
    ["growth", "companies", workspaceSlug] as const,
  company: (workspaceSlug: string, companyId: string) =>
    ["growth", "company", workspaceSlug, companyId] as const,
  report: (workspaceSlug: string, companyId: string) =>
    ["growth", "report", workspaceSlug, companyId] as const,
};

export type GrowthNorthStar = {
  _id?: string;
  title: string;
  description?: string | null;
  horizon?: string | null;
  targetMetric?: string | null;
  baselineValue?: number | null;
  targetValue?: number | null;
  targetDate?: string | null;
  status?: string;
  alignmentState?: string;
  updatedAt?: string | null;
};
export type GrowthStrategy = {
  companyId: string;
  northStar?: GrowthNorthStar | null;
  alignmentSummary?: Record<string, number>;
  updatedAt?: string | null;
};
export type GrowthStrategyHistory = {
  items: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  skip: number;
};
export type GrowthTask = Record<string, unknown>;
export type GrowthTaskDetail = GrowthTask & {
  executionResult?: Record<string, unknown> | null;
  executionMetadata?: Record<string, unknown> | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  resultSubmissions?: Array<Record<string, unknown>>;
};
export type GrowthTaskApproval = Record<string, unknown> & {
  _id?: string;
  outcome?: "approved" | "rejected" | string;
  note?: string | null;
  userId?: string;
  createdAt?: string;
};
export type GrowthTaskApprovalsResponse = {
  status: string;
  approvals: GrowthTaskApproval[];
};
export type GrowthTaskMessage = Record<string, unknown> & {
  _id?: string;
  content?: string;
  userId?: string;
  createdAt?: string;
};
export type GrowthTaskAssignmentsResponse = {
  taskId: string;
  total: number;
  items?: Array<Record<string, unknown>>;
  assignments?: Array<Record<string, unknown>>;
};
export type GrowthExperiment = Record<string, unknown> & {
  _id?: string;
  title?: string;
  hypothesis?: string;
  metric?: string;
  taskIds?: string[];
  objective?: string;
  expectedImpact?: string;
  confidence?: number;
  cost?: string;
  status?: "backlog" | "active" | "concluded" | string;
  observedResult?: string;
  decision?: string;
  learning?: string;
  learningApprovalStatus?: "pending" | "approved" | "rejected" | string;
};
export type GrowthAsset = Record<string, unknown> & {
  _id?: string;
  asset_name?: string;
  asset_type?: string;
  status?: string;
  content_current?: string;
  generated_by_task_id?: string;
  referenced_in_tasks?: string[];
  created_at?: string;
  updated_at?: string;
  version?: number;
  versions?: Array<Record<string, unknown>>;
  export_formats?: Record<string, unknown>;
  review_status?: string;
  source_document_ids?: string[];
  verification?: Record<string, unknown>;
};
export type GrowthAssetsResponse = {
  assets: GrowthAsset[];
  storage_quota?: Record<string, unknown>;
};
export type GrowthAgencyWorkspace = Record<string, unknown> & {
  _id?: string;
  name?: string;
  linked_client_count?: number;
  active_client_count?: number;
};
export type GrowthAgencyClient = Record<string, unknown> & {
  _id?: string;
  client_company_name?: string;
  status?: string;
  scopes?: string[];
};
export type GrowthSpecialist = Record<string, unknown>;
export type GrowthTaskListResponse = {
  data: GrowthTask[];
  total: number;
  limit: number;
  skip: number;
};

export function getGrowthReadiness(options: GrowthRequestOptions) {
  return request<GrowthReadinessSummary>(
    "/api/growth/readiness/summary",
    options,
  );
}

export function getGrowthHealth(options?: GrowthRequestOptions) {
  return request<Record<string, unknown>>("/api/health", options);
}

export function recordGrowthTelemetry(
  eventType: GrowthTelemetryEventType,
  options: GrowthRequestOptions,
  metadata: Record<string, unknown> = {},
) {
  return request<{ status: string }>("/api/telemetry/events", {
    ...options,
    method: "POST",
    body: {
      eventType,
      eventSource: "ui",
      ...(options.envelope.companyId
        ? { companyId: options.envelope.companyId }
        : {}),
      metadata: {
        ...metadata,
        workspaceSlug: options.envelope.workspaceSlug,
        relayCommunityId: options.envelope.relayCommunityId,
      },
    },
  });
}

export function getGrowthStrategy(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthStrategy>(
    `/api/companies/${encodeURIComponent(companyId)}/strategy`,
    options,
  );
}

export function upsertGrowthNorthStar(
  companyId: string,
  input: {
    title: string;
    description?: string;
    horizon?: string;
    targetMetric?: string;
    baselineValue?: number;
    targetValue?: number;
    targetDate?: string;
  },
  options: GrowthRequestOptions,
) {
  return request<GrowthNorthStar>(
    `/api/companies/${encodeURIComponent(companyId)}/strategy/north-star`,
    { ...options, method: "PUT", body: input },
  );
}

export function closeGrowthNorthStar(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthNorthStar>(
    `/api/companies/${encodeURIComponent(companyId)}/strategy/north-star/close`,
    { ...options, method: "POST" },
  );
}

export function getGrowthStrategyHistory(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthStrategyHistory>(
    `/api/companies/${encodeURIComponent(companyId)}/strategy/history`,
    options,
  );
}

export function getGrowthTasks(
  status: string | undefined,
  options: GrowthRequestOptions,
  pagination?: { limit?: number; skip?: number },
) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (pagination?.limit !== undefined)
    params.set("limit", String(pagination.limit));
  if (pagination?.skip !== undefined)
    params.set("skip", String(pagination.skip));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<GrowthTaskListResponse>(`/api/growth/tasks${query}`, options);
}

/** Refetch a task after reconnect to recover a missed completion/failure callback. */
export async function getGrowthTask(
  taskId: string,
  options: GrowthRequestOptions,
): Promise<GrowthTaskDetail> {
  const response = await request<
    GrowthTaskDetail | { status: string; data: GrowthTaskDetail }
  >(`/api/tasks/${encodeURIComponent(taskId)}`, options);
  if (
    "data" in response &&
    response.data !== null &&
    typeof response.data === "object"
  ) {
    return response.data as GrowthTaskDetail;
  }
  return response;
}

export function getGrowthTaskApprovals(
  taskId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthTaskApprovalsResponse>(
    `/api/tasks/${encodeURIComponent(taskId)}/approvals`,
    options,
  );
}

export function submitGrowthTaskApproval(
  taskId: string,
  input: { outcome: "approved" | "rejected"; note?: string },
  options: GrowthRequestOptions,
) {
  return request<{
    status: string;
    approval: GrowthTaskApproval;
    task?: GrowthTaskDetail | null;
  }>(`/api/tasks/${encodeURIComponent(taskId)}/approvals`, {
    ...options,
    method: "POST",
    body: input,
  });
}

export function getGrowthTaskMessages(
  taskId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthTaskMessage[]>(
    `/api/tasks/${encodeURIComponent(taskId)}/messages`,
    options,
  );
}

export function createGrowthTaskMessage(
  taskId: string,
  input: { content: string },
  options: GrowthRequestOptions,
) {
  return request<GrowthTaskMessage>(
    `/api/tasks/${encodeURIComponent(taskId)}/messages`,
    { ...options, method: "POST", body: input },
  );
}

export function getGrowthTaskAssignments(
  taskId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthTaskAssignmentsResponse>(
    `/api/tasks/${encodeURIComponent(taskId)}/assignments`,
    options,
  );
}

export function assignGrowthTask(
  taskId: string,
  input: { userId: string; note?: string; notify?: boolean },
  options: GrowthRequestOptions,
) {
  return request<GrowthTaskDetail>(
    `/api/tasks/${encodeURIComponent(taskId)}/assignments`,
    { ...options, method: "POST", body: input },
  );
}

export function getGrowthExperiments(
  companyId: string,
  status: string | undefined,
  options: GrowthRequestOptions,
) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<{ items: GrowthExperiment[]; total: number }>(
    `/api/companies/${encodeURIComponent(companyId)}/experiments${query}`,
    options,
  );
}

export function createGrowthExperiment(
  companyId: string,
  input: {
    title: string;
    hypothesis: string;
    metric: string;
    objective?: string;
    expectedImpact?: string;
    confidence?: number;
    cost?: string;
    taskIds?: string[];
  },
  options: GrowthRequestOptions,
) {
  return request<{ item: GrowthExperiment; idempotentReplay?: boolean }>(
    `/api/companies/${encodeURIComponent(companyId)}/experiments`,
    { ...options, method: "POST", body: input },
  );
}

export function updateGrowthExperiment(
  companyId: string,
  experimentId: string,
  input: Record<string, unknown>,
  options: GrowthRequestOptions,
) {
  return request<{ item: GrowthExperiment }>(
    `/api/companies/${encodeURIComponent(companyId)}/experiments/${encodeURIComponent(experimentId)}`,
    { ...options, method: "PATCH", body: input },
  );
}

export function approveGrowthExperimentLearning(
  companyId: string,
  experimentId: string,
  options: GrowthRequestOptions,
) {
  return request<{ item: GrowthExperiment }>(
    `/api/companies/${encodeURIComponent(companyId)}/experiments/${encodeURIComponent(experimentId)}/approve-learning`,
    { ...options, method: "POST" },
  );
}

export function getGrowthAutomations(
  companyId: string,
  options?: GrowthRequestOptions,
) {
  return request<GrowthCron[]>(
    `/api/agent/crons?company_id=${encodeURIComponent(companyId)}`,
    options,
  );
}

export function deleteGrowthAutomation(
  companyId: string,
  cronId: string,
  options?: GrowthRequestOptions,
) {
  return request<{ status: string }>(
    `/api/agent/crons/${encodeURIComponent(cronId)}?company_id=${encodeURIComponent(companyId)}`,
    options ? { ...options, method: "DELETE" } : { method: "DELETE" },
  );
}

export function getGrowthWorkspaceIntegrations(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthWorkspaceIntegration[]>(
    `/api/workspace/integrations/status?company_id=${encodeURIComponent(companyId)}`,
    options,
  );
}

export function disconnectGrowthWorkspaceIntegration(
  companyId: string,
  platform: string,
  options: GrowthRequestOptions,
) {
  return request<{ message: string }>(
    `/api/workspace/integrations/${encodeURIComponent(platform)}?company_id=${encodeURIComponent(companyId)}`,
    { ...options, method: "DELETE" },
  );
}

export function growthWorkspaceIntegrationConnectUrl(
  companyId: string,
  platform: string,
  options: GrowthRequestOptions,
): string {
  const envelope = options.envelope;
  const params = new URLSearchParams({
    company_id: companyId,
    correlation_id: envelope.correlationId,
    idempotency_key: envelope.idempotencyKey,
    lenos_workspace: envelope.workspaceSlug,
    lenos_relay_community: envelope.relayCommunityId,
  });
  if (envelope.actorPubkey)
    params.set("lenos_actor_pubkey", envelope.actorPubkey);
  return `${apiBase()}/api/workspace/integrations/${encodeURIComponent(platform)}/connect?${params.toString()}`;
}

export function getGrowthCompanyMembers(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<{
    items?: GrowthCompanyMember[];
    members?: GrowthCompanyMember[];
    total?: number;
  }>(`/api/companies/${encodeURIComponent(companyId)}/members`, options);
}

export function inviteGrowthCompanyMember(
  companyId: string,
  input: { email: string; role?: string; message?: string },
  options: GrowthRequestOptions,
) {
  return request<Record<string, unknown>>(
    `/api/companies/${encodeURIComponent(companyId)}/members`,
    { ...options, method: "POST", body: input },
  );
}

export function updateGrowthCompanyMember(
  companyId: string,
  membershipId: string,
  input: { role?: string; position?: string; teams?: string[] },
  options: GrowthRequestOptions,
) {
  return request<Record<string, unknown>>(
    `/api/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(membershipId)}`,
    { ...options, method: "PATCH", body: input },
  );
}

export function requestGrowthSpecialist(
  taskId: string,
  options: GrowthRequestOptions,
  input: Record<string, unknown> = {},
) {
  return request<GrowthTaskDetail>(
    `/api/tasks/${encodeURIComponent(taskId)}/request-specialist`,
    { ...options, method: "POST", body: input },
  );
}

export function getGrowthSpecialistPipeline(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<Record<string, unknown>>(
    `/api/companies/${encodeURIComponent(companyId)}/specialist-pipeline`,
    options,
  );
}

export function getGrowthSpecialists(options: GrowthRequestOptions) {
  return request<GrowthSpecialist[]>("/api/growth/specialists", options);
}

export function extractGrowthOnboarding(
  input: GrowthOnboardingExtractInput,
  options: GrowthRequestOptions,
) {
  return request<GrowthOnboardingExtract>("/api/companies/extract", {
    ...options,
    method: "POST",
    body: input,
  });
}

export function getGrowthCompanies(options: GrowthRequestOptions) {
  return request<GrowthCompany[]>("/api/companies", options);
}

export function createGrowthCompany(
  input: Record<string, unknown>,
  options: GrowthRequestOptions,
) {
  return request<GrowthCompanyCreateResponse>("/api/companies", {
    ...options,
    method: "POST",
    body: input,
  });
}

export function getGrowthCompany(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthCompany>(
    `/api/companies/${encodeURIComponent(companyId)}`,
    options,
  );
}

export function getGrowthCompanyReport(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<Record<string, unknown>>(
    `/api/companies/${encodeURIComponent(companyId)}/reporting`,
    options,
  );
}

export function createGrowthManualMetric(
  companyId: string,
  input: Record<string, unknown>,
  options: GrowthRequestOptions,
) {
  return request<Record<string, unknown>>(
    `/api/companies/${encodeURIComponent(companyId)}/reporting/manual-metrics`,
    { ...options, method: "POST", body: input },
  );
}

export function updateGrowthManualMetric(
  companyId: string,
  metricId: string,
  input: Record<string, unknown>,
  options: GrowthRequestOptions,
) {
  return request<Record<string, unknown>>(
    `/api/companies/${encodeURIComponent(companyId)}/reporting/manual-metrics/${encodeURIComponent(metricId)}`,
    { ...options, method: "PUT", body: input },
  );
}

export function updateGrowthCompany(
  companyId: string,
  input: Record<string, unknown>,
  options: GrowthRequestOptions,
) {
  return request<{ company: GrowthCompany }>(
    `/api/companies/${encodeURIComponent(companyId)}`,
    {
      ...options,
      method: "PUT",
      body: input,
    },
  );
}

export function assessGrowthCompany(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthAssessmentResponse>(
    `/api/companies/${encodeURIComponent(companyId)}/assess`,
    {
      ...options,
      method: "POST",
    },
  );
}

export function createGrowthTask(
  input: GrowthTaskCreate,
  options: GrowthRequestOptions,
) {
  return request<GrowthTask>("/api/tasks", {
    ...options,
    method: "POST",
    body: input,
  });
}

export function updateGrowthTask(
  taskId: string,
  input: GrowthTaskUpdate,
  options: GrowthRequestOptions,
) {
  return request<GrowthTaskDetail>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    ...options,
    method: "PUT",
    body: input,
  });
}

export function submitGrowthTaskResult(
  taskId: string,
  input: {
    summary: string;
    details?: string;
    completeTask?: boolean;
    saveToAssets?: boolean;
    assetName?: string;
    assetType?: string;
    visibilityScope?: string;
  },
  options: GrowthRequestOptions,
) {
  return request<GrowthTaskDetail>(
    `/api/tasks/${encodeURIComponent(taskId)}/submit-result`,
    { ...options, method: "POST", body: input },
  );
}

export function submitGrowthTaskFeedback(
  taskId: string,
  input: { feedbackType: GrowthTaskFeedbackType; note?: string },
  options: GrowthRequestOptions,
) {
  return request<{
    status: string;
    task: GrowthTaskDetail;
    feedback: Record<string, unknown>;
    idempotent_replay?: boolean;
  }>(`/api/tasks/${encodeURIComponent(taskId)}/feedback`, {
    ...options,
    method: "POST",
    body: input,
  });
}

export function requestGrowthTaskRevision(
  taskId: string,
  input: { feedback_text: string; previous_result_submission_id?: string },
  options: GrowthRequestOptions,
) {
  return request<{
    status: string;
    message: string;
    revision_number: number;
    routed_to_agent?: string;
    is_rerouted?: boolean;
    idempotent_replay?: boolean;
    task: GrowthTaskDetail;
  }>(`/api/tasks/${encodeURIComponent(taskId)}/request-revision`, {
    ...options,
    method: "POST",
    body: input,
  });
}

export function reviewGrowthTaskResult(
  taskId: string,
  resultId: string,
  input: { status: "accepted" | "rejected"; reviewNote?: string },
  options: GrowthRequestOptions,
) {
  return request<{
    status: string;
    data: GrowthTaskDetail;
    idempotent_replay?: boolean;
  }>(
    `/api/tasks/${encodeURIComponent(taskId)}/results/${encodeURIComponent(resultId)}/review`,
    { ...options, method: "PATCH", body: input },
  );
}

export function completeGrowthTask(
  companyId: string,
  taskId: string,
  input: {
    summary: string;
    details?: string;
    create_asset?: boolean;
    asset_name?: string;
    asset_type?: string;
  },
  options: GrowthRequestOptions,
) {
  return request<{
    task_id: string;
    status: string;
    asset_id?: string | null;
    asset_link?: Record<string, unknown> | null;
    message: string;
  }>(
    `/companies/${encodeURIComponent(companyId)}/tasks/${encodeURIComponent(taskId)}/complete`,
    { ...options, method: "POST", body: input },
  );
}

export function getGrowthAssets(
  companyId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthAssetsResponse>(
    `/api/companies/${encodeURIComponent(companyId)}/assets`,
    options,
  );
}

export function getGrowthAsset(
  companyId: string,
  assetId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthAsset>(
    `/api/companies/${encodeURIComponent(companyId)}/assets/${encodeURIComponent(assetId)}`,
    options,
  );
}

export function requestGrowthAssetReview(
  companyId: string,
  assetId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthAsset>(
    `/api/companies/${encodeURIComponent(companyId)}/assets/${encodeURIComponent(assetId)}/request-review`,
    { ...options, method: "POST" },
  );
}

export function verifyGrowthAsset(
  companyId: string,
  assetId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthAsset>(
    `/api/companies/${encodeURIComponent(companyId)}/assets/${encodeURIComponent(assetId)}/verify`,
    { ...options, method: "POST" },
  );
}

export async function downloadGrowthAsset(
  companyId: string,
  assetId: string,
  format: "docx" | "markdown",
  options: GrowthRequestOptions,
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBase()}/api/companies/${encodeURIComponent(companyId)}/assets/${encodeURIComponent(assetId)}/download?format=${format}`,
      {
        headers: requestHeaders(options),
        signal: options.signal ?? AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new GrowthApiError(
      "LenGrowth is unavailable. Check the connection and retry.",
      "dependency_unavailable",
      503,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    const detail = body?.detail;
    throw new GrowthApiError(
      typeof detail === "string" ? detail : response.statusText,
      errorCode(response.status, detail),
      response.status,
    );
  }
  return response.blob();
}

export function getGrowthAgencyWorkspaces(options: GrowthRequestOptions) {
  return request<GrowthAgencyWorkspace[]>("/api/agency/workspaces", options);
}

export function getGrowthAgencyClients(
  workspaceId: string,
  options: GrowthRequestOptions,
) {
  return request<GrowthAgencyClient[]>(
    `/api/agency/workspaces/${encodeURIComponent(workspaceId)}/clients`,
    options,
  );
}

export function getGrowthAgencyMetrics(
  workspaceId: string,
  options: GrowthRequestOptions,
) {
  return request<Record<string, unknown>>(
    `/api/agency/workspaces/${encodeURIComponent(workspaceId)}/metrics`,
    options,
  );
}

export function exportGrowthAgencyMetrics(
  workspaceId: string,
  options: GrowthRequestOptions,
) {
  return request<Record<string, unknown>>(
    `/api/agency/workspaces/${encodeURIComponent(workspaceId)}/metrics/export`,
    { ...options, method: "POST" },
  );
}
