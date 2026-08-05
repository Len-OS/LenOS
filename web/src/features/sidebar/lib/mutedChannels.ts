const STORAGE_KEY = "lenos_muted_channels";

function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
}

function save(map: Record<string, boolean>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function isMuted(channelId: string): boolean {
  return load()[channelId] === true;
}

export function toggleMute(channelId: string): boolean {
  const map = load();
  const next = !map[channelId];
  if (next) {
    map[channelId] = true;
  } else {
    delete map[channelId];
  }
  save(map);
  return next;
}

export function getMutedIds(): Set<string> {
  return new Set(
    Object.entries(load())
      .filter(([, v]) => v)
      .map(([id]) => id),
  );
}
