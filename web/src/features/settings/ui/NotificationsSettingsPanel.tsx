import { useState } from "react";

export function NotificationsSettingsPanel() {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );

  const request = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const label: Record<NotificationPermission, string> = {
    granted: "Enabled",
    denied: "Blocked by browser",
    default: "Not yet requested",
  };

  const statusColor: Record<NotificationPermission, string> = {
    granted: "text-green-600 dark:text-green-400",
    denied: "text-red-500",
    default: "text-black/50 dark:text-white/50",
  };

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center justify-between rounded-lg border border-black/15 px-4 py-3 dark:border-white/15">
        <div>
          <p className="text-sm font-medium text-black dark:text-white">
            Desktop notifications
          </p>
          <p className={`text-xs ${statusColor[permission]}`}>
            {label[permission]}
          </p>
        </div>
        {permission !== "granted" && permission !== "denied" && (
          <button
            type="button"
            onClick={() => void request()}
            className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
          >
            Enable
          </button>
        )}
        {permission === "granted" && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            ✓
          </span>
        )}
      </div>
      {permission === "denied" && (
        <p className="text-xs text-black/50 dark:text-white/50">
          To enable notifications, update your browser site settings for this
          page.
        </p>
      )}
    </div>
  );
}
