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

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "identity", label: "Identity" },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "relay", label: "Relay" },
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
        <aside className="flex w-52 shrink-0 flex-col border-r border-black/10 p-3 dark:border-white/10">
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
            </Suspense>
          </div>
        </main>
        </div>
      </div>
    </>
  );
}
