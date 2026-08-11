const JOINABLE_WINDOW_SECONDS = 3600;

export function isHuddleStale(startedAt: number): boolean {
  return Math.floor(Date.now() / 1000) - startedAt > JOINABLE_WINDOW_SECONDS;
}
