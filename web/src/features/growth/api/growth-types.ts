export type GrowthCorrelationEnvelope = {
  correlationId: string;
  idempotencyKey: string;
  workspaceSlug: string;
  relayCommunityId: string;
  originEventId?: string | null;
  originChannelId?: string | null;
  originThreadId?: string | null;
  actorPubkey?: string | null;
  companyId?: string | null;
};

export type GrowthApiErrorCode =
  | "unauthenticated"
  | "unlinked"
  | "forbidden"
  | "stale_version"
  | "validation"
  | "rate_limited"
  | "dependency_unavailable"
  | "growth_flag_disabled"
  | "internal"
  | "unknown";

export type GrowthRequestOptions = {
  token?: string | null;
  envelope: GrowthCorrelationEnvelope;
  signal?: AbortSignal;
};

export type GrowthTelemetryEventType =
  | "growth_onboarding_started"
  | "growth_onboarding_step_completed"
  | "growth_onboarding_completed"
  | "growth_first_recommendation_seen"
  | "growth_task_created"
  | "growth_approval_requested"
  | "growth_task_completed"
  | "growth_report_viewed"
  | "growth_integration_connected";

export type GrowthTaskCreate = {
  companyId: string;
  taskType: string;
  title: string;
  description: string;
  objective?: string | null;
  priority?: string;
  creationMode?: string;
  requiredApprovals?: number;
};
export type GrowthTaskUpdate = {
  title?: string;
  description?: string;
  objective?: string | null;
  status?: string;
  dependencies?: string[];
  checklistItems?: unknown[];
};
export type GrowthOnboardingExtractInput = {
  name?: string | null;
  text: string;
  companyType: string;
  stageIntent?: string | null;
  shortTermGoal?: string | null;
  outcomeText?: string | null;
  planFeedback?: string | null;
};
export type GrowthCompany = Record<string, unknown> & {
  _id?: string;
  name?: string | null;
  description?: string | null;
  onboardingCompleteness?: Record<string, unknown> | null;
  assessmentStatus?: string | null;
  onboardingState?: string | null;
};
export type GrowthCompanyCreateResponse = {
  status: string;
  message?: string;
  company_id?: string | null;
  assessment_status?: string | null;
};
export type GrowthOnboardingExtract = Record<string, unknown> & {
  confidence?: number;
  missingInfo?: string[];
  followUpQuestions?: string[];
  firstTaskPreview?: Array<Record<string, unknown>>;
  practicalPlan?: Array<Record<string, unknown>>;
};
export type GrowthAssessmentTask = Record<string, unknown> & {
  _id?: string;
  title?: string;
  creation_reasoning?: string;
  evidenceSummary?: string;
  additional_data?: { whyNow?: string; evidenceSummary?: string };
};
export type GrowthAssessmentResponse = {
  status: string;
  message?: string;
  companyId?: string;
  assessmentStatus?: string;
  generatedTasks?: GrowthAssessmentTask[];
  nextRecommendedAction?: Record<string, unknown> | null;
};

export type GrowthReadinessSummary = Record<string, unknown>;
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

export type GrowthWorkspaceIntegration = Record<string, unknown> & {
  platform: string;
  connected: boolean;
  connected_at?: string | null;
  scopes?: string[];
  scope_status?: "ok" | "reduced" | "not_applicable" | "not_connected";
  token_expiry?: string | null;
  last_sync_at?: string | null;
  sync_status?: string;
  last_error?: string | null;
  supported_metrics?: string[];
};
export type GrowthCron = {
  cron_id: string;
  prompt: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
};
export type GrowthTaskFeedbackType =
  | "useful"
  | "not_useful"
  | "done_already"
  | "wrong_timing"
  | "asset_stale"
  | "asset_incorrect"
  | "recommendation_incorrect"
  | "needs_changes";
export type GrowthCompanyMember = Record<string, unknown> & {
  _id?: string;
  user_id?: string;
  email?: string;
  name?: string;
  role?: string;
  status?: string;
};
