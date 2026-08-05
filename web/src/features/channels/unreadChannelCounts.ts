import { getLastRead } from "./readState/readStateStorage";
import type { Message } from "@/features/messages/use-messages";

export function getUnreadCount(channelId: string, messages: Message[]): number {
  const lastRead = getLastRead(channelId);
  return messages.filter((m) => m.createdAt > lastRead).length;
}

export function hasUnread(
  channelId: string,
  lastMessageTimestamp: number,
): boolean {
  return lastMessageTimestamp > getLastRead(channelId);
}
