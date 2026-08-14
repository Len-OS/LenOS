import { useState, useEffect, Suspense, lazy } from "react";
import { X } from "lucide-react";

const ProfilePanel = lazy(() =>
  import("@/features/settings/ui/ProfileSettingsPanel").then((m) => ({
    default: m.ProfileSettingsPanel,
  })),
);
const IdentityPanel = lazy(() =>
  import("@/features/settings/ui/IdentitySettingsPanel").then((m) => ({
    default: m.IdentitySettingsPanel,
  })),
);
const AppearancePanel = lazy(() =>
  import("@/features/settings/ui/AppearanceSettingsPanel").then((m) => ({
    default: m.AppearanceSettingsPanel,
  })),
);
const NotificationsPanel = lazy(() =>
  import("@/features/settings/ui/NotificationsSettingsPanel").then((m) => ({
    default: m.NotificationsSettingsPanel,
  })),
);
const RelayPanel = lazy(() =>
  import("@/features/settings/ui/RelaySettingsPanel").then((m) => ({
    default: m.RelaySettingsPanel,
  })),
);
const IntegrationsPanel = lazy(() =>
  import("@/features/settings/ui/IntegrationsSettingsPanel").then((m) => ({
    default: m.IntegrationsSettingsPanel,
  })),
);
const AutomationsPanel = lazy(() =>
  import("@/features/settings/ui/AutomationsSettingsPanel").then((m) => ({
    default: m.AutomationsSettingsPanel,
  })),
);
const AgentDefaultsPanel = lazy(() =>
  import("@/features/settings/ui/AgentDefaultsSettingsPanel").then((m) => ({
    default: m.AgentDefaultsSettingsPanel,
  })),
);
const KeyboardShortcutsPanel = lazy(() =>
  import("@/features/settings/ui/KeyboardShortcutsPanel").then((m) => ({
    default: m.KeyboardShortcutsPanel,
  })),
);
const BackupPanel = lazy(() =>
  import("@/features/settings/ui/BackupSettingsPanel").then((m) => ({
    default: m.BackupSettingsPanel,
  })),
);
const HarnessPanel = lazy(() =>
  import("@/features/settings/ui/HarnessSettingsPanel").then((m) => ({
    default: m.HarnessSettingsPanel,
  })),
);
const MobilePairingPanel = lazy(() =>
  import("@/features/settings/ui/MobilePairingPanel").then((m) => ({
    default: m.MobilePairingPanel,
  })),
);
const ModerationPanel = lazy(() =>
  import("@/features/settings/ui/ModerationQueuePanel").then((m) => ({
    default: m.ModerationQueuePanel,
  })),
);
const CustomEmojiPanel = lazy(() =>
  import("@/features/settings/ui/CustomEmojiSection").then((m) => ({
    default: m.CustomEmojiSection,
  })),
);
const PrivacyPanel = lazy(() =>
  import("@/features/settings/ui/PrivacySettingsPanel").then((m) => ({
    default: m.PrivacySettingsPanel,
  })),
);
const ChannelTemplatesPanel = lazy(() =>
  import("@/features/settings/ui/ChannelTemplatesSettingsCard").then((m) => ({
    default: m.ChannelTemplatesSettingsCard,
  })),
);

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "identity", label: "Workspace" },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "relay", label: "Connection" },
  { id: "integrations", label: "Integrations" },
  { id: "automations", label: "Automations" },
  { id: "agents", label: "Agents" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "backup", label: "Backup" },
  { id: "harness", label: "Harness" },
  { id: "mobile", label: "Mobile" },
  { id: "moderation", label: "Moderation" },
  { id: "custom-emoji", label: "Custom Emoji" },
  { id: "privacy", label: "Privacy & Data" },
  { id: "channel-templates", label: "Channel Templates" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: Props) {
  const [active, setActive] = useState<SectionId>("profile");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const openIdentity = () => setActive("identity");
    window.addEventListener("open-settings-identity", openIdentity);
    return () =>
      window.removeEventListener("open-settings-identity", openIdentity);
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss, onKeyDown present */}
      <div
        role="presentation"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={onClose}
        onKeyDown={() => {}}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          className="flex h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-[#1e1e1e]"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-black/10 p-3 dark:border-white/10">
            <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-widest text-black/40 dark:text-white/40">
              Settings
            </p>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                className={`rounded-md px-3 py-1.5 text-left text-sm ${
                  active === s.id
                    ? "bg-black/[0.08] font-medium text-black dark:bg-white/10 dark:text-white"
                    : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
                }`}
              >
                {s.label}
              </button>
            ))}
          </aside>

          <main className="flex flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
              <h2 className="text-base font-semibold text-black dark:text-white">
                {SECTIONS.find((s) => s.id === active)?.label}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
                aria-label="Close settings"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <Suspense
                fallback={
                  <p className="text-sm text-black/40 dark:text-white/40">
                    Loading…
                  </p>
                }
              >
                {active === "profile" && <ProfilePanel />}
                {active === "identity" && <IdentityPanel />}
                {active === "appearance" && <AppearancePanel />}
                {active === "notifications" && <NotificationsPanel />}
                {active === "relay" && <RelayPanel />}
                {active === "integrations" && <IntegrationsPanel />}
                {active === "automations" && <AutomationsPanel />}
                {active === "agents" && <AgentDefaultsPanel />}
                {active === "shortcuts" && <KeyboardShortcutsPanel />}
                {active === "backup" && <BackupPanel />}
                {active === "harness" && <HarnessPanel />}
                {active === "mobile" && <MobilePairingPanel />}
                {active === "moderation" && <ModerationPanel />}
                {active === "custom-emoji" && <CustomEmojiPanel />}
                {active === "privacy" && <PrivacyPanel />}
                {active === "channel-templates" && <ChannelTemplatesPanel />}
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
