import lengrowthIcon from "@/assets/lengrowth-icon.png";

export function WorkspaceNotFoundPage({ slug }: { slug: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F3F3F3] px-4 dark:bg-[#171717]">
      <div className="flex w-full max-w-md flex-col items-center py-16 text-center">
        <div
          className="h-16 w-16 overflow-hidden bg-black"
          style={{ borderRadius: "22.37%" }}
        >
          <img alt="LenGrowth" className="h-full w-full" src={lengrowthIcon} />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-black dark:text-white">
          Workspace not found
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-black/60 dark:text-white/60">
          <span className="font-mono font-medium text-black dark:text-white">
            {slug}
          </span>{" "}
          doesn't match any LenGrowth workspace.
        </p>
        <a
          href="https://app.lengrowth.com"
          className="mt-8 inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-black"
        >
          Go to LenGrowth
        </a>
      </div>
    </div>
  );
}
