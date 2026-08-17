export type ProviderCredentialConfig = {
  requiredEnvKeys: readonly string[];
  secretEnvVar?: string;
  label: string;
};

// Keep in sync with desktop/src/features/agents/ui/agentConfigOptions.tsx
export const PROVIDER_CREDENTIAL_CONFIG: Record<string, ProviderCredentialConfig> = {
  anthropic: {
    label: "Anthropic",
    requiredEnvKeys: ["ANTHROPIC_API_KEY"],
    secretEnvVar: "ANTHROPIC_API_KEY",
  },
  openai: {
    label: "OpenAI",
    requiredEnvKeys: ["OPENAI_COMPAT_API_KEY"],
    secretEnvVar: "OPENAI_COMPAT_API_KEY",
  },
  "openai-compat": {
    label: "OpenAI-compatible",
    requiredEnvKeys: ["OPENAI_COMPAT_API_KEY", "OPENAI_COMPAT_BASE_URL"],
    secretEnvVar: "OPENAI_COMPAT_API_KEY",
  },
  openrouter: {
    label: "OpenRouter",
    requiredEnvKeys: ["OPENROUTER_API_KEY"],
    secretEnvVar: "OPENROUTER_API_KEY",
  },
  bedrock: {
    label: "AWS Bedrock",
    requiredEnvKeys: [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_REGION",
      "BEDROCK_MODEL",
    ],
    secretEnvVar: "AWS_SECRET_ACCESS_KEY",
  },
  mantle: {
    label: "Mantle",
    requiredEnvKeys: ["MANTLE_API_KEY", "MANTLE_MODEL"],
    secretEnvVar: "MANTLE_API_KEY",
  },
  databricks: {
    label: "Databricks",
    requiredEnvKeys: ["DATABRICKS_HOST", "DATABRICKS_TOKEN"],
    secretEnvVar: "DATABRICKS_TOKEN",
  },
};

export const PROVIDER_OPTIONS = Object.entries(PROVIDER_CREDENTIAL_CONFIG).map(
  ([id, cfg]) => ({ id, label: cfg.label }),
);
