let _isDndActive = false;

export function setDndActive(value: boolean): void {
  _isDndActive = value;
}

export function isDndActive(): boolean {
  return _isDndActive;
}
