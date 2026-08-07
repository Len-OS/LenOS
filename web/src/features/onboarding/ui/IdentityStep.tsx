export function IdentityStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Connect your identity
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-black/50 dark:text-white/50">
          LenOS uses a durable Nostr identity for workspace membership and
          signed writes. Connect this workspace from your LenGrowth account; no
          extension or private-key entry is required. The signing key stays
          encrypted on the LenGrowth backend.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={onComplete}
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          Connect with LenGrowth
        </button>
      </div>
    </div>
  );
}
