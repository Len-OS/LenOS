import { useState } from "react";
import { X, Zap } from "lucide-react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Select } from "@/shared/ui/select";
import { KIND_WORKFLOW } from "../useWorkflows";

type TriggerType = "manual" | "scheduled" | "webhook";

const TRIGGER_OPTIONS: { value: TriggerType; label: string; hint: string }[] = [
  { value: "manual", label: "Manual", hint: "Triggered by clicking Run" },
  {
    value: "scheduled",
    label: "Scheduled",
    hint: "Cron expression, e.g. 0 9 * * 1",
  },
  {
    value: "webhook",
    label: "Webhook",
    hint: "HTTP POST to the workflow webhook URL",
  },
];

interface Props {
  communityId: string;
  onClose: () => void;
}

export function WorkflowFormBuilder({ communityId, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("manual");
  const [triggerValue, setTriggerValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const trigger =
        triggerType === "manual"
          ? "manual"
          : triggerValue.trim() || triggerType;

      const tags: string[][] = [
        ["d", crypto.randomUUID()],
        ["h", communityId],
        ["name", name.trim()],
      ];
      if (description.trim()) tags.push(["description", description.trim()]);
      if (trigger) tags.push(["trigger", trigger]);

      const signed = await signNostrEvent(
        { kind: KIND_WORKFLOW, content: "", tags },
        { requireNip07: true },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create workflow.");
    } finally {
      setSaving(false);
    }
  };

  const hint = TRIGGER_OPTIONS.find((o) => o.value === triggerType)?.hint ?? "";

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
        aria-label="Create workflow"
        className="relative z-10 w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-black/40 dark:text-white/40" />
            <h2 className="text-base font-semibold text-black dark:text-white">
              New Workflow
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

        <div className="space-y-4">
          <div>
            <label
              htmlFor="wf-name"
              className="mb-1.5 block text-xs font-medium text-black/60 dark:text-white/60"
            >
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nightly digest"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) void handleSave();
              }}
            />
          </div>

          <div>
            <label
              htmlFor="wf-description"
              className="mb-1.5 block text-xs font-medium text-black/60 dark:text-white/60"
            >
              Description
            </label>
            <Textarea
              id="wf-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workflow do?"
              rows={2}
            />
          </div>

          <div>
            <label
              htmlFor="wf-trigger"
              className="mb-1.5 block text-xs font-medium text-black/60 dark:text-white/60"
            >
              Trigger
            </label>
            <Select
              id="wf-trigger"
              value={triggerType}
              onChange={(e) => {
                setTriggerType(e.target.value as TriggerType);
                setTriggerValue("");
              }}
            >
              {TRIGGER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-black/40 dark:text-white/40">
              {hint}
            </p>
          </div>

          {triggerType !== "manual" && (
            <div>
              <label
                htmlFor="wf-trigger-value"
                className="mb-1.5 block text-xs font-medium text-black/60 dark:text-white/60"
              >
                {triggerType === "scheduled"
                  ? "Cron expression"
                  : "Webhook path"}
              </label>
              <Input
                id="wf-trigger-value"
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.target.value)}
                placeholder={
                  triggerType === "scheduled"
                    ? "0 9 * * 1"
                    : "/hook/my-workflow"
                }
                className="font-mono"
              />
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
          >
            {saving ? "Creating…" : "Create Workflow"}
          </Button>
        </div>
      </div>
    </div>
  );
}
