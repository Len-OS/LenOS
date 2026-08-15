import { useState } from "react";
import { Copy, Plus, Settings, Trash2, X } from "lucide-react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { useMembers } from "@/features/channels/useMembers";
import { useInvites } from "../useInvites";
import { useCreateInvite } from "../useCreateInvite";
import { uploadEmojiFile, validateEmojiFile } from "@/features/emoji/uploadEmoji";
import { useUpdateSubdomain } from "../hooks/useUpdateSubdomain";

type Tab = "overview" | "members" | "invites" | "danger";

interface Props {
  isOpen: boolean;
  communityId: string;
  isAdmin: boolean;
  isOwner: boolean;
  onClose: () => void;
}

function formatDate(unix: number | null): string {
  if (!unix) return "Never";
  return new Date(unix * 1000).toLocaleDateString();
}

export function CommunitySettingsModal({
  isOpen,
  communityId,
  isAdmin,
  isOwner,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState("#5b4fcf");
  const [subdomainSlug, setSubdomainSlug] = useState("");
  const { updateSubdomain, isUpdating: subdomainUpdating, error: subdomainError } =
    useUpdateSubdomain();

  const members = useMembers(communityId);
  const invites = useInvites(communityId);
  const { createInvite, isCreating } = useCreateInvite(communityId);

  if (!isOpen) return null;

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateEmojiFile(file);
    if (validationError) {
      setAvatarError(validationError);
      return;
    }
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const url = await uploadEmojiFile(file);
      setAvatarUrl(url);
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : "Upload failed.",
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  async function saveOverview() {
    setSaving(true);
    try {
      const event = await signNostrEvent(
        {
          kind: 9002,
          content: "",
          tags: [
            ["h", communityId],
            ["name", name],
            ["about", about],
            ...(avatarUrl ? [["picture", avatarUrl]] : []),
            ["color", accentColor],
          ],
        },
        { requireNip07: true },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        event as Record<string, unknown>,
      );
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateInvite() {
    const url = await createInvite();
    if (url) setNewInviteUrl(url);
  }

  async function handleDeleteWorkspace() {
    try {
      const event = await signNostrEvent(
        {
          kind: 9008,
          content: "Workspace deleted",
          tags: [["h", communityId]],
        },
        { requireNip07: true },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        event as Record<string, unknown>,
      );
      onClose();
    } catch {
      // ignore
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "members", label: "Members" },
    { id: "invites", label: "Invites" },
    ...(isAdmin ? [{ id: "danger" as Tab, label: "Danger" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[600px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1a1a1a]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-black/40 dark:text-white/40" />
            <span className="font-semibold text-black dark:text-white">
              Workspace Settings
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-black/40 hover:bg-black/5 dark:text-white/40 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-black/10 px-4 dark:border-white/10">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm transition-colors ${
                tab === t.id
                  ? "border-b-2 border-black font-medium text-black dark:border-white dark:text-white"
                  : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "overview" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="ws-name"
                  className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60"
                >
                  Workspace Name
                </label>
                <input
                  id="ws-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Workspace"
                  className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/10 dark:text-white dark:focus:border-white/30"
                />
              </div>
              <div>
                <label
                  htmlFor="ws-about"
                  className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60"
                >
                  Description
                </label>
                <textarea
                  id="ws-about"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  rows={3}
                  placeholder="What is this workspace for?"
                  className="w-full resize-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/10 dark:text-white dark:focus:border-white/30"
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                    Workspace Avatar
                  </label>
                  {avatarUrl && (
                    <img
                      src={avatarUrl}
                      alt="Workspace avatar preview"
                      className="mb-2 h-16 w-16 rounded-lg object-cover"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleAvatarFile(e)}
                    disabled={avatarUploading}
                    className="block text-sm text-black/60 dark:text-white/60"
                  />
                  {avatarUploading && (
                    <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                      Uploading…
                    </p>
                  )}
                  {avatarError && (
                    <p className="mt-1 text-xs text-red-500">{avatarError}</p>
                  )}
                </div>
              )}
              {isAdmin && (
                <div>
                  <label
                    htmlFor="ws-accent-color"
                    className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60"
                  >
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="ws-accent-color"
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer rounded border border-black/10 p-0.5 dark:border-white/10"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setAccentColor(v);
                      }}
                      maxLength={7}
                      className="w-24 rounded-lg border border-black/10 bg-transparent px-3 py-1 font-mono text-sm text-black outline-none focus:border-black/30 dark:border-white/10 dark:text-white dark:focus:border-white/30"
                    />
                  </div>
                </div>
              )}
              {isOwner && (
                <div>
                  <label
                    htmlFor="ws-subdomain"
                    className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60"
                  >
                    Subdomain
                  </label>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <input
                        id="ws-subdomain"
                        type="text"
                        value={subdomainSlug}
                        onChange={(e) => setSubdomainSlug(e.target.value.toLowerCase())}
                        placeholder="your-workspace"
                        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/10 dark:text-white dark:focus:border-white/30"
                      />
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Changing your subdomain will break existing links for all members.
                      </p>
                      {subdomainError && (
                        <p className="mt-1 text-xs text-red-500">{subdomainError}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={subdomainUpdating || !subdomainSlug.trim()}
                      onClick={() => void updateSubdomain(subdomainSlug.trim())}
                      className="rounded-lg border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/5 disabled:opacity-40 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                    >
                      {subdomainUpdating ? "Changing…" : "Change"}
                    </button>
                  </div>
                </div>
              )}
              {isAdmin && (
                <button
                  type="button"
                  disabled={saving || !name.trim()}
                  onClick={() => void saveOverview()}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              )}
            </div>
          )}

          {tab === "members" && (
            <div className="space-y-1">
              {members.length === 0 ? (
                <p className="py-8 text-center text-sm text-black/30 dark:text-white/30">
                  No members loaded
                </p>
              ) : (
                members.map((m) => (
                  <div
                    key={m.pubkey}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span className="font-mono text-xs text-black/60 dark:text-white/60">
                      {truncatePubkey(m.pubkey)}
                    </span>
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs capitalize dark:bg-white/10">
                      {m.role ?? "member"}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "invites" && (
            <div className="space-y-3">
              {newInviteUrl && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                  <span className="flex-1 truncate font-mono text-xs text-green-800 dark:text-green-400">
                    {newInviteUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard.writeText(newInviteUrl)
                    }
                    className="shrink-0 rounded p-1 hover:bg-green-200 dark:hover:bg-green-800"
                  >
                    <Copy className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
                  </button>
                </div>
              )}

              {isAdmin && (
                <button
                  type="button"
                  disabled={isCreating}
                  onClick={() => void handleCreateInvite()}
                  className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                >
                  <Plus className="h-4 w-4" />
                  {isCreating ? "Creating…" : "Create Invite Link"}
                </button>
              )}

              {invites.length === 0 ? (
                <p className="py-4 text-sm text-black/30 dark:text-white/30">
                  No invite links yet
                </p>
              ) : (
                <div className="space-y-2">
                  {invites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-black/70 dark:text-white/70">
                          {inv.code}
                        </p>
                        <p className="mt-0.5 text-xs text-black/40 dark:text-white/40">
                          {inv.uses} uses
                          {inv.maxUses ? ` / ${inv.maxUses} max` : ""} · Expires{" "}
                          {formatDate(inv.expiresAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const slug =
                            window.location.hostname.split(".")[0] ?? "";
                          void navigator.clipboard.writeText(
                            `https://${slug}.lengrowth.com/invite/${inv.code}`,
                          );
                        }}
                        className="shrink-0 rounded p-1 text-black/40 hover:bg-black/5 dark:text-white/40 dark:hover:bg-white/5"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "danger" && isAdmin && (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 p-4 dark:border-red-800">
                <h3 className="mb-1 font-semibold text-red-600 dark:text-red-400">
                  Delete Workspace
                </h3>
                <p className="mb-3 text-sm text-black/60 dark:text-white/60">
                  This action is permanent and cannot be undone. All channels
                  and messages will be removed.
                </p>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Workspace
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDeleteWorkspace()}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg border border-black/10 px-4 py-2 text-sm dark:border-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
