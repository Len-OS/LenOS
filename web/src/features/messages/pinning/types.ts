export interface PinnedMessage {
  eventId: string;
  pinnedBy: string; // pubkey
  pinnedAt: number; // unix seconds
  content?: string; // message preview — populated client-side by looking up the event
}
