import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  PROVIDER_CREDENTIAL_CONFIG,
  type ProviderCredentialConfig,
} from "../lib/providerCredentialConfig";
import {
  getEncryptionKey,
  loadCredentialKeys,
  saveCredentials,
  deleteCredentials,
} from "../lib/credentialApi";

type Props = {
  agentDTag: string;
  currentProvider: string | null;
};

export function AgentCredentialEditor({ agentDTag, currentProvider }: Props) {
  const [savedKeys, setSavedKeys] = useState<Record<string, string> | null>(
    null,
  );
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const config: ProviderCredentialConfig | null =
    currentProvider ? (PROVIDER_CREDENTIAL_CONFIG[currentProvider] ?? null) : null;

  const hasEncryptionKey = getEncryptionKey() !== null;

  useEffect(() => {
    setSavedKeys(null);
    setFormValues({});
    setError(null);
    setSuccess(false);

    if (!currentProvider || !config || !hasEncryptionKey) return;

    setLoading(true);
    loadCredentialKeys(agentDTag)
      .then((keys) => {
        setSavedKeys(keys);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load credentials");
      })
      .finally(() => setLoading(false));
  }, [agentDTag, currentProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentProvider || !config) {
    return (
      <p className="text-xs text-black/30 dark:text-white/30">
        Select a provider above to configure credentials.
      </p>
    );
  }

  if (!hasEncryptionKey) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        Credential encryption requires a local Nostr key. Set one up in
        Settings.
      </p>
    );
  }

  const handleSave = async () => {
    const missing = config.requiredEnvKeys.filter(
      (key) => !formValues[key]?.trim(),
    );
    if (missing.length > 0) {
      setError(`Fill in all required fields: ${missing.join(", ")}`);
      return;
    }

    const envVars: Record<string, string> = {};
    for (const key of config.requiredEnvKeys) {
      envVars[key] = formValues[key].trim();
    }
    // Include LENOS_AGENT_PROVIDER so the agent knows which provider to use
    envVars["LENOS_AGENT_PROVIDER"] = currentProvider;

    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await saveCredentials(agentDTag, envVars);
      setSavedKeys(envVars);
      setFormValues({});
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      await deleteCredentials(agentDTag);
      setSavedKeys(null);
      setFormValues({});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {loading && (
        <p className="text-xs text-black/40 dark:text-white/40">
          Loading credential status…
        </p>
      )}

      {!loading && (
        <div className="space-y-2">
          {config.requiredEnvKeys.map((key) => {
            const isSaved = savedKeys !== null && key in savedKeys;
            return (
              <div key={key}>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="text-[11px] font-medium font-mono text-black/60 dark:text-white/60">
                    {key}
                  </span>
                  {isSaved && (
                    <span className="flex items-center gap-0.5 rounded bg-green-100 px-1 py-0.5 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <Check className="h-2.5 w-2.5" />
                      saved
                    </span>
                  )}
                </div>
                <Input
                  type="password"
                  placeholder={isSaved ? "••••••••" : "Enter value…"}
                  value={formValues[key] ?? ""}
                  onChange={(e) =>
                    setFormValues((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  className="h-7 text-xs font-mono"
                  autoComplete="off"
                />
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {success && (
        <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <Check className="h-3 w-3" />
          Credentials saved
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="h-7 text-xs"
        >
          {saving ? "Saving…" : "Save credentials"}
        </Button>
        {savedKeys !== null && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleDelete()}
            disabled={saving || loading}
            className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
