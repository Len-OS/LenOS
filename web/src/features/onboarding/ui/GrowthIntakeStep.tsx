import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import {
  assessGrowthCompany,
  createGrowthCompany,
  extractGrowthOnboarding,
  getGrowthCompany,
  updateGrowthCompany,
  growthCompanyStorageKey,
  GrowthApiError,
  recordGrowthTelemetry,
  type GrowthAssessmentResponse,
  type GrowthAssessmentTask,
  type GrowthOnboardingExtract,
} from "@/features/growth/api/growth-api";

type AnswerKey =
  | "business"
  | "audience"
  | "presence"
  | "goal"
  | "stage"
  | "constraints";

type Answers = Record<AnswerKey, string>;

const EMPTY_ANSWERS: Answers = {
  business: "",
  audience: "",
  presence: "",
  goal: "",
  stage: "",
  constraints: "",
};

const PROMPTS: Array<{
  key: AnswerKey;
  title: string;
  prompt: string;
  placeholder: string;
}> = [
  {
    key: "business",
    title: "What are you building?",
    prompt: "Tell us what you sell or provide, in your own words.",
    placeholder: "We help…",
  },
  {
    key: "audience",
    title: "Who is it for?",
    prompt:
      "Who do you most want to reach, and what problem are they trying to solve?",
    placeholder: "Our best customers are…",
  },
  {
    key: "presence",
    title: "What exists today?",
    prompt:
      "Share your website, channels, or current way customers find you. It is okay if you are starting from zero.",
    placeholder: "We currently have…",
  },
  {
    key: "goal",
    title: "What would make the next few months a win?",
    prompt:
      "Choose the outcome that matters most right now, then add any useful detail.",
    placeholder: "The most important outcome is…",
  },
  {
    key: "stage",
    title: "Where are you in the journey?",
    prompt:
      "Describe your stage: idea, validating demand, preparing to launch, or already operating.",
    placeholder: "We are currently…",
  },
  {
    key: "constraints",
    title: "What should Len work around?",
    prompt:
      "Add budget, timing, team, compliance, or other constraints. You can skip this.",
    placeholder: "A useful constraint or context is…",
  },
];

function draftStorageKey(workspaceSlug: string) {
  return `lenos-growth-intake:${workspaceSlug}`;
}

export function growthIntakeCompletionKey(workspaceSlug: string) {
  return `${draftStorageKey(workspaceSlug)}:reviewed`;
}

function resultText(result: GrowthOnboardingExtract, key: string): string {
  const value = result[key];
  return typeof value === "string" ? value : "";
}

function websiteFromPresence(value: string): string {
  const candidate = value.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? "";
  return candidate.replace(/[),.;!?]+$/, "");
}

function enumValue(
  result: GrowthOnboardingExtract,
  key: string,
  allowed: readonly string[],
): string | undefined {
  const value = resultText(result, key).trim().toLowerCase();
  return allowed.includes(value) ? value : undefined;
}

function firstPreview(result: GrowthOnboardingExtract | null) {
  const preview = result?.firstTaskPreview?.[0];
  if (!preview) return null;
  const title = typeof preview.title === "string" ? preview.title : "";
  const why = typeof preview.why === "string" ? preview.why : "";
  return title ? { title, why } : null;
}

function firstAssessmentTask(result: GrowthAssessmentResponse | null) {
  const task = result?.generatedTasks?.[0];
  return task?.title ? task : null;
}

function taskEvidence(task: GrowthAssessmentTask) {
  return (
    task.evidenceSummary ??
    task.additional_data?.evidenceSummary ??
    task.creation_reasoning ??
    task.additional_data?.whyNow ??
    "Based on the business context you reviewed in this Growth Brief."
  );
}

interface Props {
  workspaceSlug: string;
  communityId: string;
  actorPubkey: string;
  onComplete?: (result: GrowthOnboardingExtract) => void;
}

export function GrowthIntakeStep({
  workspaceSlug,
  communityId,
  actorPubkey,
  onComplete,
}: Props) {
  const storageKey = useMemo(
    () => draftStorageKey(workspaceSlug),
    [workspaceSlug],
  );
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [step, setStep] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GrowthOnboardingExtract | null>(null);
  const [savedCompanyId, setSavedCompanyId] = useState<string | null>(null);
  const [assessmentStatus, setAssessmentStatus] = useState<
    "idle" | "running" | "completed" | "failed"
  >("idle");
  const [assessmentResult, setAssessmentResult] =
    useState<GrowthAssessmentResponse | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
        answers?: Partial<Answers>;
        step?: number;
        result?: GrowthOnboardingExtract | null;
        savedCompanyId?: string | null;
        assessmentStatus?: "idle" | "running" | "completed" | "failed";
        assessmentResult?: GrowthAssessmentResponse | null;
      } | null;
      if (saved?.answers) setAnswers({ ...EMPTY_ANSWERS, ...saved.answers });
      if (typeof saved?.step === "number")
        setStep(Math.min(saved.step, PROMPTS.length - 1));
      if (saved?.result) setResult(saved.result);
      if (saved?.savedCompanyId) setSavedCompanyId(saved.savedCompanyId);
      if (saved?.assessmentStatus) setAssessmentStatus(saved.assessmentStatus);
      if (saved?.assessmentResult) setAssessmentResult(saved.assessmentResult);
    } catch {
      // Ignore a malformed local draft and start fresh.
    } finally {
      setHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        answers,
        step,
        result,
        savedCompanyId,
        assessmentStatus,
        assessmentResult,
      }),
    );
  }, [
    answers,
    assessmentResult,
    assessmentStatus,
    hydrated,
    result,
    savedCompanyId,
    step,
    storageKey,
  ]);

  useEffect(() => {
    if (!hydrated || !savedCompanyId) return;
    let cancelled = false;
    void getGrowthCompany(savedCompanyId, {
      envelope: {
        correlationId: `onboarding-resume:${workspaceSlug}`,
        idempotencyKey: `onboarding-resume:${workspaceSlug}`,
        workspaceSlug,
        relayCommunityId: communityId,
        actorPubkey,
        companyId: savedCompanyId,
      },
    })
      .then((company) => {
        if (cancelled) return;
        const status = String(company.assessmentStatus ?? "");
        if (status === "completed" || status === "success")
          setAssessmentStatus("completed");
        else if (status === "failed" || status === "error")
          setAssessmentStatus("failed");
        if (!result) {
          setResult({
            name: company.name,
            website: company.website,
            description: company.description,
            industry: company.industry,
            target_audience: company.target_audience,
            market: company.market,
            business_idea: company.business_idea,
          });
        }
      })
      .catch(() => {
        // Keep the local reviewed brief available when resume reads are offline.
      });
    return () => {
      cancelled = true;
    };
  }, [
    actorPubkey,
    communityId,
    hydrated,
    result,
    savedCompanyId,
    workspaceSlug,
  ]);

  useEffect(() => {
    if (!hydrated || !actorPubkey) return;
    void recordGrowthTelemetry(
      "growth_onboarding_started",
      {
        envelope: {
          correlationId: `onboarding:${workspaceSlug}`,
          idempotencyKey: `onboarding-started:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId,
          actorPubkey,
        },
      },
      { promptCount: PROMPTS.length },
    ).catch(() => {});
  }, [actorPubkey, communityId, hydrated, workspaceSlug]);

  const current = PROMPTS[step];
  const currentValue = answers[current.key];
  const isLast = step === PROMPTS.length - 1;

  const updateAnswer = (value: string) => {
    setAnswers((previous) => ({ ...previous, [current.key]: value }));
  };

  const extract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const text = PROMPTS.map(
        ({ key, title }) => `${title}: ${answers[key]}`,
      ).join("\n");
      const extracted = await extractGrowthOnboarding(
        {
          text,
          companyType: answers.stage.toLowerCase().includes("idea")
            ? "new"
            : "existing",
          stageIntent: answers.stage,
          shortTermGoal: answers.goal,
          outcomeText: answers.goal,
        },
        {
          envelope: {
            correlationId: `onboarding:${workspaceSlug}`,
            idempotencyKey: `onboarding-extract:${workspaceSlug}`,
            workspaceSlug,
            relayCommunityId: communityId,
            actorPubkey,
          },
        },
      );
      setResult({
        ...extracted,
        website: websiteFromPresence(answers.presence),
      });
    } catch (cause) {
      setError(
        cause instanceof GrowthApiError && cause.code === "growth_flag_disabled"
          ? "Growth onboarding is not enabled for this workspace yet. Your existing LenGrowth dashboard is still available."
          : cause instanceof Error
            ? cause.message
            : "We could not prepare your Growth Brief.",
      );
    } finally {
      setExtracting(false);
    }
  };

  const persistBrief = async () => {
    if (!result) return;
    setPersisting(true);
    setError(null);
    try {
      const companyKey = growthCompanyStorageKey(workspaceSlug);
      const companyId = localStorage.getItem(companyKey);
      const companyType = answers.stage.toLowerCase().includes("idea")
        ? "new"
        : "existing";
      const businessIdea =
        resultText(result, "business_idea") || answers.business;
      const description = resultText(result, "description") || answers.business;
      const website = websiteFromPresence(resultText(result, "website"));
      const input: Record<string, unknown> = {
        description,
        industry: resultText(result, "industry") || undefined,
        target_audience:
          resultText(result, "target_audience") || answers.audience,
        market: resultText(result, "market") || undefined,
        business_idea: businessIdea,
        companyType,
        needsInitialAssessment: true,
        stageIntent: enumValue(result, "stageIntent", [
          "idea",
          "validation",
          "launch_ready",
          "operating",
        ]),
        shortTermGoal: enumValue(result, "shortTermGoal", [
          "validate_demand",
          "launch_online",
          "get_more_leads",
          "improve_conversion",
          "retain_customers",
          "streamline_operations",
        ]),
        businessPresence: enumValue(result, "businessPresence", [
          "online_only",
          "hybrid",
          "offline_first",
          "unspecified",
        ]),
        ...(website ? { website } : {}),
      };
      if (companyType === "existing")
        input.name =
          resultText(result, "name") ||
          businessIdea.slice(0, 255) ||
          "My business";

      const options = {
        envelope: {
          correlationId: `onboarding:${workspaceSlug}`,
          idempotencyKey: `onboarding-company:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId,
          actorPubkey,
          companyId,
        },
      };
      if (companyId) {
        await updateGrowthCompany(companyId, input, options);
        setSavedCompanyId(companyId);
      } else {
        const created = await createGrowthCompany(input, options);
        if (!created.company_id)
          throw new Error("LenGrowth did not return the new company id.");
        localStorage.setItem(companyKey, created.company_id);
        setSavedCompanyId(created.company_id);
      }
    } catch (cause) {
      setError(
        cause instanceof GrowthApiError && cause.code === "growth_flag_disabled"
          ? "Growth onboarding is not enabled for this workspace yet. Your existing LenGrowth dashboard is still available."
          : cause instanceof Error
            ? cause.message
            : "We could not save your Growth Brief.",
      );
    } finally {
      setPersisting(false);
    }
  };

  const runAssessment = async () => {
    const companyId =
      savedCompanyId ??
      localStorage.getItem(growthCompanyStorageKey(workspaceSlug));
    if (!companyId) return;
    setAssessmentStatus("running");
    setError(null);
    try {
      const assessment = await assessGrowthCompany(companyId, {
        envelope: {
          correlationId: `onboarding-assessment:${workspaceSlug}`,
          idempotencyKey: `onboarding-assessment:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId,
          actorPubkey,
          companyId,
        },
      });
      setAssessmentResult(assessment);
      setAssessmentStatus("completed");
      void recordGrowthTelemetry(
        "growth_onboarding_completed",
        {
          envelope: {
            correlationId: `onboarding:${workspaceSlug}`,
            idempotencyKey: `onboarding-completed:${workspaceSlug}`,
            workspaceSlug,
            relayCommunityId: communityId,
            actorPubkey,
            companyId,
          },
        },
        { assessmentStatus: "completed" },
      ).catch(() => {});
    } catch (cause) {
      setAssessmentStatus("failed");
      setError(
        cause instanceof GrowthApiError && cause.code === "growth_flag_disabled"
          ? "Growth onboarding is not enabled for this workspace yet. Your existing LenGrowth dashboard is still available."
          : cause instanceof Error
            ? cause.message
            : "The initial assessment could not be completed.",
      );
    }
  };

  if (result) {
    const assessedTask = firstAssessmentTask(assessmentResult);
    const preview = firstPreview(result);
    return (
      <section className="mx-auto w-full max-w-3xl">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h2 className="text-lg font-semibold text-black dark:text-white">
                Review your Growth Brief
              </h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Len extracted these working assumptions. Review them before they
                are used for recommendations.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Website (optional)", "website"],
              ["Industry", "industry"],
              ["Target audience", "target_audience"],
              ["Market", "market"],
              ["Business idea", "business_idea"],
            ].map(([label, key]) => (
              <label
                key={key}
                htmlFor={`growth-brief-${key}`}
                className="text-xs font-medium text-black/60 dark:text-white/60"
              >
                {label}
                <Input
                  className="mt-1 bg-white/70 dark:bg-black/20"
                  id={`growth-brief-${key}`}
                  value={resultText(result, key)}
                  onChange={(event) =>
                    setResult({ ...result, [key]: event.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-black/10 bg-white/40 p-3 text-xs dark:border-white/10 dark:bg-black/10">
            <p className="font-semibold text-black/70 dark:text-white/70">
              What Len knows so far
            </p>
            <p className="mt-1 text-black/60 dark:text-white/60">
              Source: your reviewed answers and LenGrowth extraction ·
              Freshness: prepared just now · Overall confidence:{" "}
              {Math.round((result.confidence ?? 0) * 100)}%
            </p>
            {result.missingInfo && result.missingInfo.length > 0 && (
              <p className="mt-1 text-amber-800 dark:text-amber-300">
                Still needed: {result.missingInfo.join(", ")}.
              </p>
            )}
            {result.followUpQuestions &&
              result.followUpQuestions.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-black/70 dark:text-white/70">
                    Questions to revisit later
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {result.followUpQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
          <label
            htmlFor="growth-brief-description"
            className="mt-3 block text-xs font-medium text-black/60 dark:text-white/60"
          >
            Description
            <Textarea
              className="mt-1 bg-white/70 dark:bg-black/20"
              id="growth-brief-description"
              value={resultText(result, "description")}
              onChange={(event) =>
                setResult({ ...result, description: event.target.value })
              }
            />
          </label>
          {(assessedTask || preview) && (
            <div
              className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20"
              aria-live="polite"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                {assessedTask
                  ? "Your first recommended move"
                  : "Recommendation preview"}
              </p>
              <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                {assessedTask?.title ?? preview?.title}
              </p>
              <p className="mt-1 text-xs text-black/65 dark:text-white/65">
                <span className="font-semibold">Evidence:</span>{" "}
                {assessedTask
                  ? taskEvidence(assessedTask)
                  : preview?.why ||
                    "Based on the answers in your reviewed Growth Brief."}
              </p>
              {!assessedTask && (
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  This preview is confirmed after the initial assessment.
                </p>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {error && (
              <p
                role="alert"
                className="basis-full rounded-md bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
              >
                {error}
              </p>
            )}
            {!savedCompanyId ? (
              <Button
                type="button"
                onClick={() => void persistBrief()}
                disabled={persisting}
              >
                {persisting ? "Saving brief…" : "Use this brief"} <ArrowRight />
              </Button>
            ) : (
              <>
                {assessmentStatus !== "completed" && (
                  <Button
                    type="button"
                    onClick={() => void runAssessment()}
                    disabled={assessmentStatus === "running"}
                  >
                    {assessmentStatus === "running"
                      ? "Assessing…"
                      : assessmentStatus === "failed"
                        ? "Retry assessment"
                        : "Run initial assessment"}
                  </Button>
                )}
                {assessmentStatus === "completed" && (
                  <>
                    <span className="text-xs text-emerald-700 dark:text-emerald-300">
                      Assessment complete.
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onComplete?.(result)}
                    >
                      Continue to workspace <ArrowRight />
                    </Button>
                  </>
                )}
                {assessmentStatus !== "completed" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onComplete?.(result)}
                    disabled={assessmentStatus === "running"}
                  >
                    Continue for now
                  </Button>
                )}
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setResult(null)}
            >
              Edit answers
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-5 dark:border-indigo-900/60 dark:bg-indigo-950/20">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-600 p-2 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Growth intake · {step + 1} of {PROMPTS.length}
              </p>
              <span className="text-xs text-black/40 dark:text-white/40">
                Saved on this device
              </span>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-black dark:text-white">
              {current.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-black/60 dark:text-white/60">
              {current.prompt}
            </p>
          </div>
        </div>
        <Textarea
          aria-label={current.title}
          autoFocus
          className="mt-5 min-h-28 bg-white/70 dark:bg-black/20"
          value={currentValue}
          onChange={(event) => updateAnswer(event.target.value)}
          placeholder={current.placeholder}
        />
        {error && (
          <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            disabled={step === 0 || extracting}
          >
            <ArrowLeft /> Back
          </Button>
          {isLast ? (
            <Button
              type="button"
              onClick={() => void extract()}
              disabled={extracting || !currentValue.trim()}
            >
              {extracting ? "Preparing brief…" : "Review Growth Brief"}{" "}
              <ArrowRight />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                void recordGrowthTelemetry(
                  "growth_onboarding_step_completed",
                  {
                    envelope: {
                      correlationId: `onboarding:${workspaceSlug}`,
                      idempotencyKey: `onboarding-step:${workspaceSlug}:${step}`,
                      workspaceSlug,
                      relayCommunityId: communityId,
                      actorPubkey,
                    },
                  },
                  { step, promptKey: current.key },
                ).catch(() => {});
                setStep((value) => Math.min(PROMPTS.length - 1, value + 1));
              }}
              disabled={extracting}
            >
              Next <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
