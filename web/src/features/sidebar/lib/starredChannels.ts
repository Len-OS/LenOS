const STORAGE_KEY = "lenos_starred_channels";

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function save(order: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

export function isStarred(channelId: string): boolean {
  return load().includes(channelId);
}

export function toggleStar(channelId: string): boolean {
  const order = load();
  const idx = order.indexOf(channelId);
  if (idx === -1) {
    order.push(channelId);
    save(order);
    return true;
  }
  order.splice(idx, 1);
  save(order);
  return false;
}

export function getStarredOrder(): string[] {
  return load();
}

export function getStarredIds(): Set<string> {
  return new Set(load());
}
