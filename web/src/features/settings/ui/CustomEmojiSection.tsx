/**
 * Admin-managed workspace emoji settings panel (kind:30078, d:"custom-emoji").
 *
 * All members see a read-only grid of workspace emoji. Admins also see an
 * upload form and delete buttons.
 */

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ChangeEvent,
} from "react";
import { Trash2, ImagePlus, Loader2 } from "lucide-react";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useMembers } from "@/features/channels/useMembers";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { queryEvents } from "@/shared/lib/nostr-client";
import {
  uploadEmojiFile,
  validateEmojiFile,
} from "@/features/emoji/uploadEmoji";

const KIND_WORKSPACE_EMOJI = 30078;
const WORKSPACE_EMOJI_D_TAG = "custom-emoji";
const SHORTCODE_RE = /^[a-z0-9_-]+$/;

interface EmojiEntry {
  shortcode: string;
  url: string;
}

function normalizeShortcode(raw: string): string | null {
  const stripped = raw.trim().replace(/^:+/, "").replace(/:+$/, "");
  const lower = stripped.toLowerCase();
  return SHORTCODE_RE.test(lower) ? lower : null;
}

function parseWorkspaceContent(content: string): EmojiEntry[] {
  try {
    const parsed = JSON.parse(content) as { emojis?: unknown };
    if (!Array.isArray(parsed.emojis)) return [];
    return (parsed.emojis as unknown[]).filter(
      (e): e is EmojiEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as EmojiEntry).shortcode === "string" &&
        typeof (e as EmojiEntry).url === "string" &&
        SHORTCODE_RE.test((e as EmojiEntry).shortcode),
    );
  } catch {
    return [];
  }
}

/** Fetch the current workspace emoji from the relay (kind:30078 d:"custom-emoji"). */
async function fetchWorkspaceEmoji(): Promise<EmojiEntry[]> {
  const events = await queryEvents(relayWsUrl(), {
    kinds: [KIND_WORKSPACE_EMOJI],
    "#d": [WORKSPACE_EMOJI_D_TAG],
    limit: 10,
  });
  if (events.length === 0) return [];
  const latest = events.reduce((best, ev) =>
    ev.created_at > best.created_at ? ev : best,
  );
  return parseWorkspaceContent(latest.content);
}

/** Publish an updated workspace emoji list as kind:30078. */
async function publishWorkspaceEmoji(emojis: EmojiEntry[]): Promise<void> {
  const content = JSON.stringify({ emojis });
  const signed = await signNostrEvent(
    {
      kind: KIND_WORKSPACE_EMOJI,
      content,
      tags: [["d", WORKSPACE_EMOJI_D_TAG]],
    },
    { requireNip07: false },
  );
  await getRelayClient(relayWsUrl()).publishAndWait(signed);
}

export function CustomEmojiSection() {
  const communityId = useCommunityId();
  const members = useMembers(communityId);
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);

  // Admin check
  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  const isAdmin =
    currentPubkey != null &&
    members.some((m) => m.pubkey === currentPubkey && m.role === "admin");

  // Workspace emoji state — subscribe via live client for real-time updates.
  const [emojiList, setEmojiList] = useState<EmojiEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    setLoadingList(true);
    // Initial load via one-shot query.
    fetchWorkspaceEmoji()
      .then(setEmojiList)
      .catch(() => setEmojiList([]))
      .finally(() => setLoadingList(false));

    // Live updates: reparse whenever a new kind:30078 d:"custom-emoji" event arrives.
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: "workspace-emoji-settings",
      filter: {
        kinds: [KIND_WORKSPACE_EMOJI],
        "#d": [WORKSPACE_EMOJI_D_TAG],
        limit: 10,
      },
      onEvent: (raw) => {
        const content = typeof raw.content === "string" ? raw.content : "";
        setEmojiList(parseWorkspaceContent(content));
        setLoadingList(false);
      },
    });

    return () => {
      unsub();
      setEmojiList([]);
      setLoadingList(true);
    };
  }, []);

  // Add emoji state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shortcode, setShortcode] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedShortcode = normalizeShortcode(shortcode);
  const shortcodeInvalid =
    shortcode.trim().length > 0 && normalizedShortcode === null;
  const canAdd =
    selectedFile !== null && normalizedShortcode !== null && !uploading;

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const validationError = validateEmojiFile(file);
      if (validationError) {
        setError(validationError);
        e.target.value = "";
        return;
      }
      setError(null);
      setSelectedFile(file);
      // Local preview URL.
      const prev = previewUrl;
      if (prev) URL.revokeObjectURL(prev);
      setPreviewUrl(URL.createObjectURL(file));
      // Suggest a shortcode from the filename if the field is empty.
      if (shortcode.trim().length === 0) {
        const basename = file.name.replace(/\.[^.]*$/, "");
        const suggested = basename
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^[_-]+|[_-]+$/g, "");
        if (SHORTCODE_RE.test(suggested)) {
          setShortcode(suggested);
        }
      }
    },
    [previewUrl, shortcode],
  );

  const handleAdd = useCallback(async () => {
    if (!selectedFile || !normalizedShortcode) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadEmojiFile(selectedFile);
      const current = await fetchWorkspaceEmoji();
      const filtered = current.filter(
        (e) => e.shortcode !== normalizedShortcode,
      );
      filtered.push({ shortcode: normalizedShortcode, url });
      await publishWorkspaceEmoji(filtered);
      // Optimistic update.
      setEmojiList(filtered);
      setShortcode("");
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add emoji.");
    } finally {
      setUploading(false);
    }
  }, [selectedFile, normalizedShortcode]);

  const handleRemove = useCallback(async (sc: string) => {
    setError(null);
    try {
      const current = await fetchWorkspaceEmoji();
      const filtered = current.filter((e) => e.shortcode !== sc);
      await publishWorkspaceEmoji(filtered);
      setEmojiList(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove emoji.");
    }
  }, []);

  const handleClear = useCallback(() => {
    setShortcode("");
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
  }, [previewUrl]);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-black dark:text-white">
          Custom Emoji
        </h2>
        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
          Workspace emoji are available to all members. Type{" "}
          <code className="rounded bg-black/5 px-1 dark:bg-white/10">
            :shortcode:
          </code>{" "}
          to insert them in messages.
        </p>
      </div>

      {/* Emoji grid — visible to all members */}
      {loadingList ? (
        <p className="text-xs text-black/40 dark:text-white/40">Loading…</p>
      ) : emojiList.length === 0 ? (
        <p className="text-xs text-black/40 dark:text-white/40">
          No workspace emoji yet.
          {isAdmin ? " Add some using the form below." : ""}
        </p>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10">
          {emojiList.map((e) => (
            <div
              key={e.shortcode}
              className="flex items-center gap-3 border-b border-black/5 px-4 py-2 last:border-b-0 dark:border-white/5"
            >
              <img
                alt={`:${e.shortcode}:`}
                src={e.url}
                className="h-6 w-6 shrink-0 object-contain"
                draggable={false}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-black dark:text-white">
                :{e.shortcode}:
              </span>
              {isAdmin ? (
                <button
                  type="button"
                  aria-label={`Remove workspace emoji :${e.shortcode}:`}
                  className="rounded p-1 text-black/30 hover:bg-black/5 hover:text-black/60 dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white/60"
                  onClick={() => void handleRemove(e.shortcode)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Upload form — admin only */}
      {isAdmin ? (
        <div className="space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h3 className="text-sm font-medium text-black dark:text-white">
            Add workspace emoji
          </h3>

          {/* File pick */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-black/60 dark:text-white/60">
              Image
            </label>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                {previewUrl ? (
                  <img
                    alt="Emoji preview"
                    src={previewUrl}
                    className="h-12 w-12 object-contain"
                    draggable={false}
                  />
                ) : (
                  <ImagePlus className="h-5 w-5 text-black/30 dark:text-white/30" />
                )}
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-black/5 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {selectedFile ? "Change image" : "Choose image"}
                </button>
                <p className="text-xs text-black/40 dark:text-white/40">
                  PNG, GIF, WebP · max 1 MB
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/gif,image/webp"
                className="sr-only"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Shortcode input */}
          <div className="space-y-1">
            <label
              htmlFor="workspace-emoji-shortcode"
              className="block text-xs font-medium text-black/60 dark:text-white/60"
            >
              Shortcode
            </label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/40">
                :
              </span>
              <input
                id="workspace-emoji-shortcode"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="emoji-name"
                value={shortcode}
                onChange={(e) => setShortcode(e.target.value)}
                className="w-full rounded-md border border-black/15 bg-white py-1.5 pl-6 pr-6 text-sm text-black placeholder-black/30 focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/15 dark:bg-white/10 dark:text-white dark:placeholder-white/30 dark:focus:ring-white/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-black/40 dark:text-white/40">
                :
              </span>
            </div>
            {shortcodeInvalid ? (
              <p className="text-xs text-red-600 dark:text-red-400">
                Use only letters, numbers, hyphen, or underscore.
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              onClick={handleClear}
              disabled={uploading || (!selectedFile && shortcode.length === 0)}
            >
              Clear
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/80"
              onClick={() => void handleAdd()}
              disabled={!canAdd}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading…
                </>
              ) : (
                "Add emoji"
              )}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
