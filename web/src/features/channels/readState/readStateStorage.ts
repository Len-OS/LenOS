const STORAGE_KEY = "lenos_read_state";

type ReadStateMap = Record<string, number>; // channelId → unix timestamp

function load(): ReadStateMap {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as ReadStateMap;
  } catch {
    return {};
  }
}

function save(map: ReadStateMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getLastRead(channelId: string): number {
  return load()[channelId] ?? 0;
}

export function setLastRead(channelId: string, timestamp: number): void {
  const map = load();
  map[channelId] = timestamp;
  save(map);
}
