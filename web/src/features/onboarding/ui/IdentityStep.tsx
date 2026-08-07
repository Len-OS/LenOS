export function IdentityStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Connect your identity
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-black/50 dark:text-white/50">
          LenOS uses a durable Nostr identity for workspace membership and
          signed writes. Install or unlock a NIP-07 browser signer, or connect
          this workspace from the LenOS desktop app. Secret keys are never
          stored in browser storage.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <a
          href="https://getalby.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center rounded-lg border border-black/15 px-4 py-3 text-sm font-medium text-black hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/5"
        >
          Install Alby
        </a>
        <a
          href="https://github.com/fiatjaf/nos2x"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center rounded-lg border border-black/15 px-4 py-3 text-sm font-medium text-black hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/5"
        >
          Install nos2x
        </a>
        <button
          type="button"
          onClick={onComplete}
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          I have connected my signer
        </button>
      </div>
    </div>
  );
}
