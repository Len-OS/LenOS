function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

type Props = {
  taskCount: number;
  warningItems: unknown[];
  sourceCount: number;
  objectiveStatus?: string | null;
};

export function GrowthHomeInsights({
  taskCount,
  warningItems,
  sourceCount,
  objectiveStatus,
}: Props) {
  return (
    <>
      <section className="mt-3 grid gap-3 md:grid-cols-2">
        <details className="rounded-xl border border-black/10 bg-white/70 p-4 text-sm dark:border-white/10 dark:bg-white/[0.03]">
          <summary className="cursor-pointer font-medium text-black dark:text-white">
            Quick read
          </summary>
          <p className="mt-2 text-black/60 dark:text-white/60">
            Start with the objective, then check the bottleneck and recommended
            action. The scorecard shows progress, while warnings explain where
            the evidence is incomplete or stale.
          </p>
        </details>
        <details className="rounded-xl border border-black/10 bg-white/70 p-4 text-sm dark:border-white/10 dark:bg-white/[0.03]">
          <summary className="cursor-pointer font-medium text-black dark:text-white">
            Expert detail
          </summary>
          <dl className="mt-2 grid gap-2 text-black/60 dark:text-white/60 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-black dark:text-white">Tasks</dt>
              <dd>{taskCount} visible</dd>
            </div>
            <div>
              <dt className="font-medium text-black dark:text-white">
                Warnings
              </dt>
              <dd>{warningItems.length}</dd>
            </div>
            <div>
              <dt className="font-medium text-black dark:text-white">
                Sources
              </dt>
              <dd>{sourceCount} connected</dd>
            </div>
            <div>
              <dt className="font-medium text-black dark:text-white">
                Objective status
              </dt>
              <dd>{objectiveStatus ?? "not set"}</dd>
            </div>
          </dl>
        </details>
      </section>
      <section className="mt-3 rounded-xl border border-amber-500/30 bg-amber-50/60 p-4 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-medium text-black dark:text-white">
              Data gaps and confidence
            </h2>
            <p className="text-xs text-black/60 dark:text-white/60">
              Reporting calls out missing or stale inputs instead of treating
              them as zero.
            </p>
          </div>
          <span className="text-xs text-amber-700 dark:text-amber-300">
            {warningItems.length} warning{warningItems.length === 1 ? "" : "s"}
          </span>
        </div>
        {warningItems.length === 0 ? (
          <p className="mt-3 text-sm text-black/70 dark:text-white/70">
            No reporting warnings were returned for this period.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-black/70 dark:text-white/70">
            {warningItems.slice(0, 8).map((warning, index) => {
              const item = (warning ?? {}) as Record<string, unknown>;
              return (
                <li key={String(item.id ?? item.source ?? index)}>
                  <span className="font-medium text-black dark:text-white">
                    {textValue(
                      item.title ?? item.sourceLabel ?? item.source,
                      "Reporting input",
                    )}
                  </span>
                  {" — "}
                  {textValue(
                    item.summary ?? item.message ?? item.trustReason,
                    "Data may be incomplete.",
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
