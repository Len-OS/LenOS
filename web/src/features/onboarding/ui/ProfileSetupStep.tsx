import { useState, useRef, useCallback } from "react";
import { Camera, User } from "lucide-react";
import { WebAnimatedAvatarCapture } from "@/features/profile/ui/WebAnimatedAvatarCapture";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { getCurrentPubkey, signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

interface Props {
  onComplete: () => void;
}

export function ProfileSetupStep({ onComplete }: Props) {
  const [name, setName] = useState("");
  const [picture, setPicture] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setPicture(dataUrl);
      setError("");
    };
    reader.readAsDataURL(file);
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const pubkey = await getCurrentPubkey();
      if (!pubkey) throw new Error("No identity available.");
      const content = JSON.stringify({
        name: name.trim(),
        picture: picture.trim(),
      });
      const signed = await signNostrEvent(
        { kind: 0, content, tags: [] },
        { requireNip07: false },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile.");
    }
    setSaving(false);
  };

  const avatarDisplay = previewUrl || picture;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Set up your profile
        </h2>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          You can change this at any time in settings.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-black/15 bg-black/[0.03] transition-colors hover:border-black/30 dark:border-white/15 dark:bg-white/[0.03] dark:hover:border-white/30"
        >
          {avatarDisplay ? (
            <img
              src={avatarDisplay}
              alt="Avatar preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-8 w-8 text-black/30 dark:text-white/30" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </div>
        </button>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          ref={fileInputRef}
          onChange={(e) => handleFileSelect(e.currentTarget.files)}
        />
        <p className="text-xs text-black/40 dark:text-white/40">
          Click to upload a photo
        </p>
        {showCamera ? (
          <div className="mt-4 w-full">
            <WebAnimatedAvatarCapture
              onApply={(dataUrl) => {
                setPreviewUrl(dataUrl);
                setPicture(dataUrl);
                setError("");
                setShowCamera(false);
              }}
              onCancel={() => setShowCamera(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="text-xs text-black/40 transition-colors hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
          >
            Or capture an animated avatar
          </button>
        )}
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <label
            htmlFor="setup-name"
            className="mb-1.5 block text-sm font-medium text-black/70 dark:text-white/70"
          >
            Display name
          </label>
          <Input
            id="setup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="h-10"
          />
        </div>

        <div>
          <label
            htmlFor="setup-picture-url"
            className="mb-1.5 block text-sm font-medium text-black/70 dark:text-white/70"
          >
            Or paste a picture URL
          </label>
          <Input
            id="setup-picture-url"
            type="url"
            value={previewUrl ? "" : picture}
            onChange={(e) => {
              setPicture(e.target.value);
              setPreviewUrl(null);
            }}
            placeholder="https://…"
            disabled={!!previewUrl}
            className="h-10"
          />
          {previewUrl && (
            <button
              type="button"
              className="mt-1 text-xs text-primary hover:underline"
              onClick={() => {
                setPreviewUrl(null);
                setPicture("");
              }}
            >
              Remove uploaded image
            </button>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onComplete}
            type="button"
          >
            Skip
          </Button>
          <Button
            className="flex-1"
            onClick={() => void save()}
            disabled={saving || !name.trim()}
            type="button"
          >
            {saving ? "Saving…" : "Save & continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
