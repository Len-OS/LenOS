import { useCallback, useEffect, useState } from "react";
import { Copy, Check, RefreshCw, Webhook, X } from "lucide-react";
import { Button } from "@/shared/ui/button";

const LENGROWTH_API = "https://growth-api.lenquant.com";
const SECRET_KEY_PREFIX = "lenos_wh_secret_";

function getOrCreateSecret(workflowId: string): string {
  const key = `${SECRET_KEY_PREFIX}${workflowId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  localStorage.setItem(key, hex);
  return hex;
}

function regenerateSecret(workflowId: string): string {
  const key = `${SECRET_KEY_PREFIX}${workflowId}`;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  localStorage.setItem(key, hex);
  return hex;
}

interface Props {
  workflowId: string;
  workflowName: string;
  onClose: () => void;
}

export function WebhookSecretDialog({
  workflowId,
  workflowName,
  onClose,
}: Props) {
  const [secret, setSecret] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    setSecret(getOrCreateSecret(workflowId));
  }, [workflowId]);

  const webhookUrl = `${LENGROWTH_API}/api/webhooks/workflow/${workflowId}`;

  const copySecret = useCallback(() => {
    void navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 1500);
  }, [secret]);

  const copyUrl = useCallback(() => {
    void navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
  }, [webhookUrl]);

  const handleRegenerate = useCallback(() => {
    setSecret(regenerateSecret(workflowId));
  }, [workflowId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Webhook settings"
        className="relative z-10 w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-black/40 dark:text-white/40" />
            <h2 className="text-base font-semibold text-black dark:text-white">
              Webhook settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-black/60 dark:text-white/60">
          Send a POST request to this URL to trigger{" "}
          <span className="font-medium text-black dark:text-white">
            {workflowName}
          </span>
          . Include the secret in the{" "}
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/5">
            X-Webhook-Secret
          </code>{" "}
          header.
        </p>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-black/60 dark:text-white/60">
              Endpoint URL
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
              <code className="flex-1 truncate font-mono text-xs text-black/70 dark:text-white/70">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={copyUrl}
                className="shrink-0 rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
                aria-label="Copy URL"
              >
                {copiedUrl ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-medium text-black/60 dark:text-white/60">
                Secret token
              </p>
              <button
                type="button"
                onClick={handleRegenerate}
                className="flex items-center gap-1 text-[11px] text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
              <code className="flex-1 truncate font-mono text-xs text-black/70 dark:text-white/70">
                {secret}
              </code>
              <button
                type="button"
                onClick={copySecret}
                className="shrink-0 rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
                aria-label="Copy secret"
              >
                {copiedSecret ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-black/30 dark:text-white/30">
              Stored locally. Regenerating creates a new secret — update any
              integrations using the old one.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
