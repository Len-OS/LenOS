import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getGrowthTask,
  getGrowthTaskAssignments,
  getGrowthTaskApprovals,
  getGrowthTaskMessages,
  getGrowthTasks,
  growthCompanyStorageKey,
  growthQueryKeys,
  submitGrowthTaskResult,
  submitGrowthTaskFeedback,
  requestGrowthTaskRevision,
  reviewGrowthTaskResult,
  completeGrowthTask,
  requestGrowthSpecialist,
  submitGrowthTaskApproval,
  assignGrowthTask,
  createGrowthTaskMessage,
  type GrowthTaskUpdate,
  updateGrowthTask,
} from "@/features/growth/api/growth-api";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { Button } from "@/shared/ui/button";
import { GrowthWorkTaskList } from "./GrowthWorkTaskList";
import {
  ACTIVE,
  ATTENTION,
  listField,
  listItemKey,
  taskStatus,
  taskTitle,
  textField,
  WORK_PAGE_SIZE,
  type WorkFilter,
  type WorkView,
} from "./growth-work-utils";
import { GrowthWorkToolbar } from "./GrowthWorkToolbar";
import { GrowthWorkStatus } from "./GrowthWorkStatus";
import { GrowthTaskEditableDescription } from "./GrowthTaskEditableDescription";
import { GrowthTaskHeader } from "./GrowthTaskHeader";

export function GrowthWorkSection({
  initialTaskId,
}: {
  initialTaskId?: string | null;
}) {
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const [actorPubkey, setActorPubkey] = useState<string | null>(null);
  const [filter, setFilter] = useState<WorkFilter>("all");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<WorkView>("list");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    initialTaskId ?? null,
  );
  const [resultSummary, setResultSummary] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [createAsset, setCreateAsset] = useState(false);
  const [editingTask, setEditingTask] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editObjective, setEditObjective] = useState("");
  const queryClient = useQueryClient();
  const workspaceSlug =
    workspace.status === "found" ? workspace.workspace.slug : "";
  const companyId = workspaceSlug
    ? localStorage.getItem(growthCompanyStorageKey(workspaceSlug))
    : null;
  useEffect(() => {
    getCurrentPubkey()
      .then(setActorPubkey)
      .catch(() => {});
  }, []);
  const envelope = {
    correlationId: `growth-work:${workspaceSlug}`,
    idempotencyKey: `growth-work-read:${workspaceSlug}`,
    workspaceSlug,
    relayCommunityId: communityId ?? "",
    actorPubkey: actorPubkey ?? "",
    companyId,
  };
  const tasks = useQuery({
    queryKey: [...growthQueryKeys.tasks(workspaceSlug), page],
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () =>
      getGrowthTasks(
        undefined,
        {
          envelope,
        },
        { limit: WORK_PAGE_SIZE, skip: page * WORK_PAGE_SIZE },
      ),
    staleTime: 15_000,
  });
  const selectedTask = useQuery({
    queryKey: ["growth", "task", workspaceSlug, selectedTaskId],
    enabled: Boolean(
      selectedTaskId &&
        workspaceSlug &&
        communityId &&
        actorPubkey &&
        companyId,
    ),
    queryFn: () =>
      getGrowthTask(selectedTaskId as string, {
        envelope: {
          ...envelope,
          correlationId: `growth-work:${selectedTaskId}`,
          idempotencyKey: `growth-work-detail:${selectedTaskId}`,
        },
      }),
    staleTime: 15_000,
  });
  const approvals = useQuery({
    queryKey: ["growth", "task-approvals", workspaceSlug, selectedTaskId],
    enabled: Boolean(
      selectedTaskId &&
        workspaceSlug &&
        communityId &&
        actorPubkey &&
        companyId,
    ),
    queryFn: () =>
      getGrowthTaskApprovals(selectedTaskId as string, {
        envelope: {
          ...envelope,
          correlationId: `growth-work-approvals:${selectedTaskId}`,
          idempotencyKey: `growth-work-approvals-read:${selectedTaskId}`,
        },
      }),
    staleTime: 15_000,
  });
  const messages = useQuery({
    queryKey: ["growth", "task-messages", workspaceSlug, selectedTaskId],
    enabled: Boolean(
      selectedTaskId &&
        workspaceSlug &&
        communityId &&
        actorPubkey &&
        companyId,
    ),
    queryFn: () =>
      getGrowthTaskMessages(selectedTaskId as string, { envelope }),
    staleTime: 15_000,
  });
  const assignments = useQuery({
    queryKey: ["growth", "task-assignments", workspaceSlug, selectedTaskId],
    enabled: Boolean(
      selectedTaskId &&
        workspaceSlug &&
        communityId &&
        actorPubkey &&
        companyId,
    ),
    queryFn: () =>
      getGrowthTaskAssignments(selectedTaskId as string, { envelope }),
    staleTime: 15_000,
  });
  const mutateTask = async (input: GrowthTaskUpdate) => {
    if (!selectedTaskId) return;
    setMutationError(null);
    try {
      await updateGrowthTask(selectedTaskId, input, {
        envelope: {
          ...envelope,
          correlationId: `growth-work-update:${selectedTaskId}`,
          idempotencyKey: `growth-work-update:${selectedTaskId}:${String(input.status ?? "update")}`,
        },
      });
      await selectedTask.refetch();
      await tasks.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Task update failed.",
      );
    }
  };
  const saveTaskEdits = async () => {
    if (!selectedTaskId || !editTitle.trim() || !editDescription.trim()) return;
    await mutateTask({
      title: editTitle.trim(),
      description: editDescription.trim(),
      objective: editObjective.trim() || null,
    });
    setEditingTask(false);
  };
  const submitResult = async (completeTask: boolean) => {
    if (!selectedTaskId || !resultSummary.trim()) return;
    setMutationError(null);
    try {
      await submitGrowthTaskResult(
        selectedTaskId,
        {
          summary: resultSummary.trim(),
          completeTask,
          saveToAssets: createAsset,
          assetName:
            typeof selectedTask.data?.title === "string"
              ? selectedTask.data.title
              : undefined,
          assetType: "CUSTOM",
          visibilityScope: "company",
        },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-work-result:${selectedTaskId}`,
            idempotencyKey: `growth-work-result:${selectedTaskId}:${resultSummary.trim().slice(0, 32)}`,
          },
        },
      );
      setResultSummary("");
      await selectedTask.refetch();
      await tasks.refetch();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: growthQueryKeys.readiness(workspaceSlug),
        }),
        queryClient.invalidateQueries({
          queryKey: growthQueryKeys.report(workspaceSlug, companyId ?? ""),
        }),
        queryClient.invalidateQueries({
          queryKey: ["growth", "reports", workspaceSlug, companyId],
        }),
      ]);
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Result submission failed.",
      );
    }
  };
  const submitFeedback = async (feedbackType: "useful" | "needs_changes") => {
    if (!selectedTaskId) return;
    setMutationError(null);
    try {
      await submitGrowthTaskFeedback(
        selectedTaskId,
        { feedbackType, note: feedbackNote.trim() || undefined },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-work-feedback:${selectedTaskId}`,
            idempotencyKey: `growth-work-feedback:${selectedTaskId}:${feedbackType}:${feedbackNote.trim().slice(0, 32)}`,
          },
        },
      );
      setFeedbackNote("");
      await selectedTask.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Feedback submission failed.",
      );
    }
  };
  const requestRevision = async () => {
    if (!selectedTaskId || !feedbackNote.trim()) return;
    setMutationError(null);
    try {
      await requestGrowthTaskRevision(
        selectedTaskId,
        { feedback_text: feedbackNote.trim() },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-work-revision:${selectedTaskId}`,
            idempotencyKey: `growth-work-revision:${selectedTaskId}:${feedbackNote.trim().slice(0, 32)}`,
          },
        },
      );
      setFeedbackNote("");
      await selectedTask.refetch();
      await tasks.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Revision request failed.",
      );
    }
  };
  const reviewResult = async (
    resultId: string,
    status: "accepted" | "rejected",
  ) => {
    if (!selectedTaskId) return;
    setMutationError(null);
    try {
      await reviewGrowthTaskResult(
        selectedTaskId,
        resultId,
        { status },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-work-review:${selectedTaskId}:${resultId}`,
            idempotencyKey: `growth-work-review:${selectedTaskId}:${resultId}:${status}`,
          },
        },
      );
      await selectedTask.refetch();
      await tasks.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Result review failed.",
      );
    }
  };
  const completeWithAsset = async () => {
    if (!selectedTaskId || !resultSummary.trim() || !companyId) return;
    setMutationError(null);
    try {
      await completeGrowthTask(
        companyId,
        selectedTaskId,
        {
          summary: resultSummary.trim(),
          create_asset: createAsset,
        },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-work-complete:${selectedTaskId}`,
            idempotencyKey: `growth-work-complete:${selectedTaskId}:${resultSummary.trim().slice(0, 32)}`,
          },
        },
      );
      setResultSummary("");
      await selectedTask.refetch();
      await tasks.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Task completion failed.",
      );
    }
  };
  const requestSpecialist = async () => {
    if (!selectedTaskId) return;
    setMutationError(null);
    try {
      await requestGrowthSpecialist(selectedTaskId, {
        envelope: {
          ...envelope,
          correlationId: `growth-work-specialist:${selectedTaskId}`,
          idempotencyKey: `growth-work-specialist:${selectedTaskId}`,
        },
      });
      await selectedTask.refetch();
      await tasks.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Specialist request failed.",
      );
    }
  };
  const submitApproval = async (outcome: "approved" | "rejected") => {
    if (!selectedTaskId) return;
    setMutationError(null);
    try {
      await submitGrowthTaskApproval(
        selectedTaskId,
        { outcome, note: approvalNote.trim() || undefined },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-work-approval:${selectedTaskId}`,
            idempotencyKey: `growth-work-approval:${selectedTaskId}:${outcome}:${approvalNote.trim().slice(0, 32)}`,
          },
        },
      );
      setApprovalNote("");
      await approvals.refetch();
      await selectedTask.refetch();
      await tasks.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Approval submission failed.",
      );
    }
  };
  const assignTask = async () => {
    if (!selectedTaskId || !assigneeId.trim()) return;
    setMutationError(null);
    try {
      await assignGrowthTask(
        selectedTaskId,
        { userId: assigneeId.trim() },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-work-assignment:${selectedTaskId}`,
            idempotencyKey: `growth-work-assignment:${selectedTaskId}:${assigneeId.trim()}`,
          },
        },
      );
      setAssigneeId("");
      await assignments.refetch();
      await selectedTask.refetch();
      await tasks.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Assignment failed.",
      );
    }
  };
  const addMessage = async () => {
    if (!selectedTaskId || !messageText.trim()) return;
    setMutationError(null);
    try {
      await createGrowthTaskMessage(
        selectedTaskId,
        { content: messageText.trim() },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-work-message:${selectedTaskId}`,
            idempotencyKey: `growth-work-message:${selectedTaskId}:${messageText.trim().slice(0, 32)}`,
          },
        },
      );
      setMessageText("");
      await messages.refetch();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Comment failed.",
      );
    }
  };

  if (!companyId) return <GrowthWorkStatus kind="intake" />;
  if (tasks.isPending) return <GrowthWorkStatus kind="loading" />;
  if (tasks.isError)
    return (
      <GrowthWorkStatus kind="error" onRetry={() => void tasks.refetch()} />
    );
  if (selectedTaskId) {
    const task = selectedTask.data;
    return (
      <section className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <Button
          type="button"
          variant="ghost"
          className="mb-4 px-0"
          onClick={() => setSelectedTaskId(null)}
        >
          <ArrowLeft /> Back to Work
        </Button>
        {selectedTask.isPending ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            Loading task detail…
          </p>
        ) : selectedTask.isError || !task ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Task detail is
            unavailable.
          </div>
        ) : (
          <article className="rounded-xl border border-black/10 bg-white/70 p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <GrowthTaskHeader
              task={task}
              editing={editingTask}
              onEdit={() => {
                setEditTitle(taskTitle(task));
                setEditDescription(
                  typeof task.description === "string" ? task.description : "",
                );
                setEditObjective(
                  typeof task.objective === "string" ? task.objective : "",
                );
                setEditingTask(true);
              }}
            />
            <GrowthTaskEditableDescription
              editing={editingTask}
              title={editTitle}
              description={editDescription}
              objective={editObjective}
              onTitle={setEditTitle}
              onDescription={setEditDescription}
              onObjective={setEditObjective}
              onSave={() => void saveTaskEdits()}
              onCancel={() => setEditingTask(false)}
              taskDescription={
                typeof task.description === "string" ? task.description : null
              }
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Rationale
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-black dark:text-white">
                  {textField(
                    task,
                    "rationale",
                    "whyThis",
                    "whyNow",
                    "reason",
                  ) ?? "No rationale recorded."}
                </p>
              </div>
              <div>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Expected result
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-black dark:text-white">
                  {textField(
                    task,
                    "expectedResult",
                    "expected_result",
                    "expectedImpact",
                  ) ?? "No expected result recorded."}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Objective
                </p>
                <p className="mt-1 text-sm text-black dark:text-white">
                  {typeof task.objective === "string"
                    ? task.objective
                    : "Not specified"}
                </p>
              </div>
              <div>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Execution mode
                </p>
                <p className="mt-1 text-sm text-black dark:text-white">
                  {String(task.executionMode ?? "Not specified")}
                </p>
              </div>
            </div>
            {(() => {
              const checklist = listField(task, "checklist", "checklistItems");
              const dependencies = listField(
                task,
                "dependencies",
                "dependencyIds",
              );
              const blockers = listField(
                task,
                "blockers",
                "blockerDetails",
                "awaitingDependencies",
                "dependencyBlockers",
              );
              const history = listField(
                task,
                "history",
                "activityHistory",
                "mutationHistory",
                "events",
              );
              return (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-black/50 dark:text-white/50">
                      Checklist
                    </p>
                    {checklist.length > 0 ? (
                      <ul className="mt-1 space-y-1 text-sm text-black dark:text-white">
                        {checklist.map((item, index) => (
                          <li key={listItemKey(item, index)}>
                            {typeof item === "object" && item !== null
                              ? String(
                                  (item as Record<string, unknown>).title ??
                                    (item as Record<string, unknown>).label ??
                                    JSON.stringify(item),
                                )
                              : String(item)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                        No checklist recorded.
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-black/50 dark:text-white/50">
                      Dependencies and blockers
                    </p>
                    <div className="mt-1 space-y-1 text-sm text-black dark:text-white">
                      <p>
                        Dependencies:{" "}
                        {dependencies.length > 0
                          ? dependencies.map(String).join(", ")
                          : "None recorded"}
                      </p>
                      <p>
                        Blockers:{" "}
                        {blockers.length > 0
                          ? blockers.map(String).join(", ")
                          : "None recorded"}
                      </p>
                    </div>
                  </div>
                  <details className="sm:col-span-2">
                    <summary className="cursor-pointer text-xs text-black/50 dark:text-white/50">
                      Task history ({history.length})
                    </summary>
                    {history.length > 0 ? (
                      <ul className="mt-1 space-y-1 text-sm text-black dark:text-white">
                        {history.map((item, index) => (
                          <li key={listItemKey(item, index)}>
                            {typeof item === "object" && item !== null
                              ? String(
                                  (item as Record<string, unknown>).label ??
                                    (item as Record<string, unknown>).action ??
                                    JSON.stringify(item),
                                )
                              : String(item)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                        No history returned.
                      </p>
                    )}
                  </details>
                </div>
              );
            })()}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void mutateTask({ status: "active" })}
              >
                Start
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void mutateTask({ status: "blocked" })}
              >
                Block
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void mutateTask({ status: "pending" })}
              >
                Reopen
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void requestSpecialist()}
              >
                Request specialist
              </Button>
            </div>
            <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
              <p className="text-sm font-medium text-black dark:text-white">
                Submit result
              </p>
              <textarea
                aria-label="Task result summary"
                value={resultSummary}
                onChange={(event) => setResultSummary(event.target.value)}
                placeholder="What was observed or delivered?"
                className="mt-2 min-h-24 w-full rounded-md border border-black/10 bg-white/70 p-2 text-sm dark:border-white/10 dark:bg-black/20"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void submitResult(false)}
                  disabled={!resultSummary.trim()}
                >
                  Save result
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void submitResult(true)}
                  disabled={!resultSummary.trim()}
                >
                  Submit and complete
                </Button>
                <label className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
                  <input
                    type="checkbox"
                    checked={createAsset}
                    onChange={(event) => setCreateAsset(event.target.checked)}
                  />
                  Save as reusable asset
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void completeWithAsset()}
                  disabled={!resultSummary.trim()}
                >
                  Complete with asset option
                </Button>
              </div>
            </div>
            <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
              <p className="text-sm font-medium text-black dark:text-white">
                Was this useful?
              </p>
              <textarea
                aria-label="Task feedback note"
                value={feedbackNote}
                onChange={(event) => setFeedbackNote(event.target.value)}
                placeholder="Optional context for the next recommendation"
                className="mt-2 min-h-16 w-full rounded-md border border-black/10 bg-white/70 p-2 text-sm dark:border-white/10 dark:bg-black/20"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void submitFeedback("useful")}
                >
                  Useful
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void submitFeedback("needs_changes")}
                >
                  Needs changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void requestRevision()}
                  disabled={!feedbackNote.trim()}
                >
                  Request AI revision
                </Button>
              </div>
            </div>
            {Array.isArray(task.resultSubmissions) &&
              task.resultSubmissions.length > 0 && (
                <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
                  <p className="text-sm font-medium text-black dark:text-white">
                    Result review
                  </p>
                  {task.resultSubmissions.slice(-1).map((submission, index) => {
                    const resultId = String(submission.id ?? "");
                    return (
                      <div
                        key={resultId || index}
                        className="mt-2 rounded-md bg-black/[0.04] p-3 text-sm dark:bg-white/[0.05]"
                      >
                        <p className="text-black dark:text-white">
                          {String(submission.summary ?? "Result")}
                        </p>
                        <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                          Status: {String(submission.status ?? "pending")}
                        </p>
                        {resultId &&
                          String(submission.status ?? "pending") ===
                            "pending" && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  void reviewResult(resultId, "accepted")
                                }
                              >
                                Accept result
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  void reviewResult(resultId, "rejected")
                                }
                              >
                                Reject result
                              </Button>
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
              <p className="text-sm font-medium text-black dark:text-white">
                Assignment
              </p>
              <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                Current owner:{" "}
                {String(task.assignedTo ?? task.assigneeId ?? "Unassigned")}
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  aria-label="Assignee user ID"
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                  placeholder="User ID"
                  className="min-w-0 flex-1 rounded-md border border-black/10 bg-white/70 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void assignTask()}
                  disabled={!assigneeId.trim()}
                >
                  Assign
                </Button>
              </div>
              {assignments.data?.items?.slice(0, 3).map((item, index) => (
                <p
                  key={String(item._id ?? item.id ?? item.userId ?? index)}
                  className="mt-2 text-xs text-black/60 dark:text-white/60"
                >
                  {String(item.userId ?? item.assigneeId ?? "Assignment")}{" "}
                  {String(item.note ?? "")}
                </p>
              ))}
            </div>
            <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
              <p className="text-sm font-medium text-black dark:text-white">
                Discussion
              </p>
              <div className="mt-2 space-y-2">
                {(messages.data ?? []).map((message, index) => (
                  <div
                    key={String(message._id ?? index)}
                    className="rounded-md bg-black/[0.04] p-2 text-sm dark:bg-white/[0.05]"
                  >
                    {String(message.content ?? "")}
                  </div>
                ))}
              </div>
              <textarea
                aria-label="Task comment"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Add a task comment"
                className="mt-3 min-h-16 w-full rounded-md border border-black/10 bg-white/70 p-2 text-sm dark:border-white/10 dark:bg-black/20"
              />
              <Button
                type="button"
                className="mt-2"
                onClick={() => void addMessage()}
                disabled={!messageText.trim()}
              >
                Add comment
              </Button>
            </div>
            {(Array.isArray(task.referenced_assets) ||
              Boolean(task.generated_asset_id)) && (
              <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
                <p className="text-sm font-medium text-black dark:text-white">
                  Linked assets
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-black/60 dark:text-white/60">
                  {Boolean(task.generated_asset_id) && (
                    <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
                      Generated: {String(task.generated_asset_id)}
                    </span>
                  )}
                  {Array.isArray(task.referenced_assets) &&
                    task.referenced_assets.map((asset, index) => (
                      <span
                        key={String(asset ?? index)}
                        className="rounded-full bg-black/[0.06] px-2 py-1 dark:bg-white/10"
                      >
                        Referenced: {String(asset)}
                      </span>
                    ))}
                </div>
              </div>
            )}
            <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
              <p className="text-sm font-medium text-black dark:text-white">
                Approvals
              </p>
              <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                {approvals.isPending
                  ? "Loading approval history…"
                  : `${approvals.data?.approvals.length ?? 0} decision(s) recorded`}
              </p>
              {approvals.isError ? (
                <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                  Approval history is unavailable.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {(approvals.data?.approvals ?? []).map((approval, index) => (
                    <div
                      key={String(approval._id ?? index)}
                      className="rounded-md bg-black/[0.04] p-2 text-xs dark:bg-white/[0.05]"
                    >
                      <span className="font-medium capitalize">
                        {approval.outcome ?? "unknown"}
                      </span>
                      {approval.note ? ` — ${approval.note}` : ""}
                    </div>
                  ))}
                </div>
              )}
              <textarea
                aria-label="Approval note"
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
                placeholder="Optional approval note"
                className="mt-3 min-h-16 w-full rounded-md border border-black/10 bg-white/70 p-2 text-sm dark:border-white/10 dark:bg-black/20"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void submitApproval("approved")}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void submitApproval("rejected")}
                >
                  Reject
                </Button>
              </div>
            </div>
            {mutationError && (
              <p className="mt-3 text-xs text-red-700 dark:text-red-300">
                {mutationError}
              </p>
            )}
            {task.executionMetadata && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-black dark:text-white">
                  Execution metadata
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-black/[0.04] p-3 text-xs dark:bg-white/[0.05]">
                  {JSON.stringify(task.executionMetadata, null, 2)}
                </pre>
              </details>
            )}
            {task.executionResult && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-black dark:text-white">
                  Observed result
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-black/[0.04] p-3 text-xs dark:bg-white/[0.05]">
                  {JSON.stringify(task.executionResult, null, 2)}
                </pre>
              </details>
            )}
          </article>
        )}
      </section>
    );
  }
  const items = (tasks.data?.data ?? []).filter((task) => {
    const status = taskStatus(task);
    if (filter === "active") return ACTIVE.includes(status);
    if (filter === "attention") return ATTENTION.includes(status);
    if (filter === "completed")
      return ["completed", "complete", "done"].includes(status);
    return true;
  });
  return (
    <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <GrowthWorkToolbar
        filter={filter}
        view={view}
        onFilter={(value) => {
          setFilter(value);
          setPage(0);
        }}
        onView={setView}
        onRefresh={() => void tasks.refetch()}
      />
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 p-8 text-center text-sm text-black/50 dark:border-white/15 dark:text-white/50">
          No work in this view.
        </div>
      ) : (
        <GrowthWorkTaskList
          items={items}
          view={view}
          onSelect={(id) => setSelectedTaskId(id)}
          total={tasks.data?.total ?? 0}
          limit={tasks.data?.limit || WORK_PAGE_SIZE}
          skip={tasks.data?.skip ?? page * WORK_PAGE_SIZE}
          onPrevious={() => setPage((current) => Math.max(0, current - 1))}
          onNext={() => setPage((current) => current + 1)}
        />
      )}
    </section>
  );
}
