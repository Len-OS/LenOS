interface NotFoundProps {
  slug: string;
}
interface ErrorProps {
  message: string;
}

export function WorkspaceNotFound({ slug }: NotFoundProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-white dark:bg-[#1a1a1a]">
      <div className="max-w-sm px-6 text-center">
        <h1 className="text-xl font-semibold text-black dark:text-white">
          Workspace not found
        </h1>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          No workspace at <strong>{slug}.lengrowth.com</strong>.
        </p>
        <a
          href="https://lengrowth.com"
          className="mt-4 inline-block text-sm text-black underline dark:text-white"
        >
          Go to LenGrowth
        </a>
      </div>
    </div>
  );
}

export function WorkspaceLoadError({ message }: ErrorProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-white dark:bg-[#1a1a1a]">
      <div className="max-w-sm px-6 text-center">
        <h1 className="text-xl font-semibold text-black dark:text-white">
          Could not load workspace
        </h1>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          {message}
        </p>
      </div>
    </div>
  );
}

export function WorkspaceLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-white dark:bg-[#1a1a1a]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-black/20 border-t-black dark:border-white/20 dark:border-t-white" />
    </div>
  );
}
