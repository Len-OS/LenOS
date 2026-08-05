import { useEffect } from "react";
import { showNotification } from "@/features/notifications/lib/browser";
import type { Reminder } from "./useReminders";

const FIRED_KEY = "lenos_reminder_fired";

function getFiredIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markFired(id: string) {
  const ids = getFiredIds();
  ids.add(id);
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // storage full — ignore
  }
}

export function useReminderNotifications(reminders: Reminder[]) {
  useEffect(() => {
    if (reminders.length === 0) return;

    function check() {
      const now = Math.floor(Date.now() / 1000);
      const fired = getFiredIds();
      for (const reminder of reminders) {
        if (fired.has(reminder.id)) continue;
        if (reminder.expiry <= now) {
          markFired(reminder.id);
          const preview =
            reminder.content.slice(0, 80) +
            (reminder.content.length > 80 ? "…" : "");
          showNotification("Reminder", preview || "You have a reminder.");
        }
      }
    }

    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [reminders]);
}
