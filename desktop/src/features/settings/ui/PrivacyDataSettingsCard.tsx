import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { useMyRelayMembershipQuery } from "@/features/community-members/hooks";
import { getRelayHttpUrl } from "@/shared/api/tauri";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { SettingsSectionHeader } from "./SettingsSectionHeader";

const EXPORT_HISTORY_KEY = "lenos_export_history";

interface ExportRecord {
  iso: string;
  pubkey: string;
}

function loadHistory(): ExportRecord[] {
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ExportRecord[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(records: ExportRecord[]) {
  localStorage.setItem(
    EXPORT_HISTORY_KEY,
    JSON.stringify(records.slice(0, 20)),
  );
}

async function triggerExport(pubkeyParam?: string): Promise<ExportRecord> {
  const base = await getRelayHttpUrl();
  const path = pubkeyParam
    ? `/api/export?pubkey=${encodeURIComponent(pubkeyParam)}`
    : "/api/export";
  const url = `${base}${path}`;
  const auth = await makeNip98AuthHeader(url, "GET");
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  const blob = await res.blob();
  const filename =
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
    `export.json`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return {
    iso: new Date().toISOString(),
    pubkey: (pubkeyParam ?? "self").slice(0, 16),
  };
}

export function PrivacyDataSettingsCard() {
  const membershipQuery = useMyRelayMembershipQuery();
  const role = membershipQuery.data?.role;
  const isAdmin = role === "owner" || role === "admin";

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExportRecord[]>(loadHistory);

  const [adminPubkey, setAdminPubkey] = useState("");
  const [adminExporting, setAdminExporting] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const handleExportSelf = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const record = await triggerExport();
      const updated = [record, ...history];
      setHistory(updated);
      saveHistory(updated);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const handleAdminExport = async () => {
    const pk = adminPubkey.trim();
    if (!pk) return;
    setAdminExporting(true);
    setAdminError(null);
    try {
      const record = await triggerExport(pk);
      const updated = [record, ...history];
      setHistory(updated);
      saveHistory(updated);
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdminExporting(false);
    }
  };

  return (
    <section className="space-y-12">
      {/* My data */}
      <div>
        <SettingsSectionHeader
          description="Download all your Nostr events from this relay as a JSON file."
          title="Export My Data"
        />

        <Button
          disabled={exporting}
          onClick={() => void handleExportSelf()}
          type="button"
        >
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {exporting ? "Exporting…" : "Export my data"}
        </Button>

        {exportError && (
          <p className="mt-2 text-xs text-destructive">{exportError}</p>
        )}

        {history.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Previous exports (this device)
            </p>
            <div className="space-y-1">
              {history.slice(0, 5).map((r) => (
                <p key={r.iso} className="text-xs text-muted-foreground">
                  {new Date(r.iso).toLocaleString()} — pubkey{" "}
                  <span className="font-mono">{r.pubkey}…</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Admin export by pubkey */}
      {isAdmin && (
        <div>
          <SettingsSectionHeader
            description="Export any community member's Nostr events. Admin only."
            title="Export by Pubkey"
          />

          <div className="flex gap-2">
            <Input
              className="flex-1 font-mono text-xs"
              onChange={(e) => setAdminPubkey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdminExport();
              }}
              placeholder="hex pubkey (64 chars)"
              type="text"
              value={adminPubkey}
            />
            <Button
              disabled={adminExporting || !adminPubkey.trim()}
              onClick={() => void handleAdminExport()}
              type="button"
            >
              {adminExporting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1 h-4 w-4" />
              )}
              Export
            </Button>
          </div>

          {adminError && (
            <p className="mt-1.5 text-xs text-destructive">{adminError}</p>
          )}
        </div>
      )}
    </section>
  );
}
