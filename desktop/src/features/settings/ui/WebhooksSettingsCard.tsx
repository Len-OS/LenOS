import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { useMyRelayMembershipQuery } from "@/features/community-members/hooks";
import { getRelayHttpUrl } from "@/shared/api/tauri";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { SettingsSectionHeader } from "./SettingsSectionHeader";

interface OutgoingWebhook {
  id: string;
  url: string;
  event_filter: Record<string, unknown>;
  secret: string;
  created_at: string;
}

async function fetchWebhooks(): Promise<OutgoingWebhook[]> {
  const base = await getRelayHttpUrl();
  const url = `${base}/api/webhooks`;
  const auth = await makeNip98AuthHeader(url, "GET");
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<OutgoingWebhook[]>;
}

async function createWebhook(webhookUrl: string): Promise<OutgoingWebhook> {
  const base = await getRelayHttpUrl();
  const url = `${base}/api/webhooks`;
  const auth = await makeNip98AuthHeader(url, "POST");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<OutgoingWebhook>;
}

async function deleteWebhook(id: string): Promise<void> {
  const base = await getRelayHttpUrl();
  const url = `${base}/api/webhooks/${id}`;
  const auth = await makeNip98AuthHeader(url, "DELETE");
  await fetch(url, { method: "DELETE", headers: { Authorization: auth } });
}

export function WebhooksSettingsCard() {
  const membershipQuery = useMyRelayMembershipQuery();
  const role = membershipQuery.data?.role;
  const isAdmin = role === "owner" || role === "admin";

  const [webhooks, setWebhooks] = useState<OutgoingWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const rows = await fetchWebhooks();
      setWebhooks(rows);
    } catch {
      // silently ignore; server returns 403 for non-admins
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isAdmin) return null;

  const handleAdd = async () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      const hook = await createWebhook(trimmed);
      setWebhooks((prev) => [...prev, hook]);
      setNewUrl("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch {
      // ignore
    }
  };

  return (
    <section>
      <SettingsSectionHeader
        description="Register HTTP endpoints that receive a POST for each ingested Nostr event. Admin only."
        title="Outgoing Webhooks"
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No webhooks registered.
            </p>
          )}

          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{wh.url}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  secret: {wh.secret.slice(0, 8)}…
                </p>
              </div>
              <Button
                className="ml-3 shrink-0"
                onClick={() => void handleDelete(wh.id)}
                size="icon"
                title="Remove webhook"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Input
              className="flex-1"
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
              placeholder="https://example.com/webhook"
              type="url"
              value={newUrl}
            />
            <Button
              disabled={adding || !newUrl.trim()}
              onClick={() => void handleAdd()}
              type="button"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </div>

          {addError && <p className="text-xs text-destructive">{addError}</p>}
        </div>
      )}
    </section>
  );
}
