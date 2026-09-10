import type { GrowthTask } from "@/features/growth/api/growth-api";

export type WorkFilter = "all" | "active" | "attention" | "completed";
export type WorkView = "list" | "board";
export const WORK_PAGE_SIZE = 25;
export const ACTIVE = ["active", "pending", "queue", "queued"];
export const ATTENTION = [
  "blocked",
  "approval_required",
  "needs_approval",
  "failed",
];

export function taskStatus(task: GrowthTask): string {
  return String(task.status ?? "unknown").toLowerCase();
}
export function taskTitle(task: GrowthTask): string {
  return typeof task.title === "string" && task.title.trim()
    ? task.title
    : "Untitled growth task";
}
export function displayValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "object" && value !== null) {
    for (const key of ["summary", "description", "title", "label", "value"]) {
      const nested = displayValue((value as Record<string, unknown>)[key]);
      if (nested) return nested;
    }
  }
  return null;
}
export function textField(task: GrowthTask, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = displayValue(task[key]);
    if (value) return value;
  }
  return null;
}
export function listField(task: GrowthTask, ...keys: string[]): unknown[] {
  for (const key of keys)
    if (Array.isArray(task[key])) return task[key] as unknown[];
  return [];
}
export function listItemKey(item: unknown, index: number): string {
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;
    const id =
      record.id ?? record._id ?? record.key ?? record.title ?? record.label;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return `${String(item)}-${index}`;
}
