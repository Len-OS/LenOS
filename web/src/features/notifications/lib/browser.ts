export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showNotification(
  title: string,
  body: string,
  icon?: string,
): void {
  if (
    Notification.permission !== "granted" ||
    document.visibilityState === "visible"
  )
    return;
  new Notification(title, { body, icon });
}
