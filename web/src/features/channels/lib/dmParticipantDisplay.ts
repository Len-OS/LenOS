export function formatDmParticipantDisplayName(
  otherPubkeys: string[],
  nameOf: (pubkey: string) => string,
): string {
  const LIMIT = 3;
  const visible = otherPubkeys.filter((_, index) => index < LIMIT);
  const hidden = otherPubkeys.length - LIMIT;
  const names = visible.map(nameOf);
  return hidden > 0
    ? [...names, `+${hidden} more`].join(", ")
    : names.join(", ");
}
