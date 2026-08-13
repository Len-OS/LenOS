import { useCallback, useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Avatar } from "@/shared/ui/Avatar";
import { WebAnimatedAvatarCapture } from "@/features/profile/ui/WebAnimatedAvatarCapture";
import { useProfile } from "@/features/profiles/use-profile";
import { getCurrentPubkey, signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

interface Props {
  pubkey: string;
  onClose: () => void;
}

export function AvatarEditor({ pubkey, onClose }: Props) {
  const profile = useProfile(pubkey);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pictureUrl, setPictureUrl] = useState(profile?.picture ?? "");
  const [showCamera, setShowCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const displayName = profile?.name || pubkey.slice(0, 8);
  const currentPicture = previewUrl ?? pictureUrl;

  const handleFile = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
      setPictureUrl(reader.result as string);
      setError("");
    };
    reader.readAsDataURL(file);
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const pk = await getCurrentPubkey();
      if (!pk) throw new Error("No identity.");
      const content = JSON.stringify({
        name: profile?.name ?? "",
        picture: pictureUrl.trim(),
        about: profile?.about ?? "",
      });
      const signed = await signNostrEvent(
        { kind: 0, content, tags: [] },
        { requireNip07: false },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit avatar"
        className="relative z-10 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-black dark:text-white">
            Edit avatar
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar
              src={currentPicture || undefined}
              name={displayName}
              size={80}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Upload image"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          </div>

          <input
            type="file"
            accept="image/*"
            className="sr-only"
            ref={fileRef}
            onChange={(e) => handleFile(e.currentTarget.files)}
          />

          {!showCamera ? (
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="flex items-center gap-1.5 text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
            >
              <Camera className="h-3.5 w-3.5" />
              Capture animated avatar
            </button>
          ) : (
            <div className="w-full">
              <WebAnimatedAvatarCapture
                onApply={(dataUrl) => {
                  setPreviewUrl(dataUrl);
                  setPictureUrl(dataUrl);
                  setError("");
                  setShowCamera(false);
                }}
                onCancel={() => setShowCamera(false)}
              />
            </div>
          )}

          <div className="w-full">
            <label
              htmlFor="avatar-url"
              className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60"
            >
              Or paste an image URL
            </label>
            <input
              id="avatar-url"
              type="url"
              value={previewUrl ? "" : pictureUrl}
              onChange={(e) => {
                setPictureUrl(e.target.value);
                setPreviewUrl(null);
              }}
              disabled={!!previewUrl}
              placeholder="https://…"
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
            />
            {previewUrl && (
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null);
                  setPictureUrl("");
                }}
                className="mt-1 text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
              >
                Remove uploaded image
              </button>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              type="button"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => void save()}
              disabled={saving}
              type="button"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
