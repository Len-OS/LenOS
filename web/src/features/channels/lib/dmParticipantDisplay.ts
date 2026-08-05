export function formatDmParticipantDisplayName(
  otherPubkeys: string[],
  nameOf: (pubkey: string) => string,
): string {
  const LIMIT = 3;
  const visible = otherPubkeys.slice(0, LIMIT);
  const hidden = otherPubkeys.length - LIMIT;
  const names = visible.map(nameOf);
  return hidden > 0 ? [...names, `+${hidden} more`].join(", ") : names.join(", ");
}
