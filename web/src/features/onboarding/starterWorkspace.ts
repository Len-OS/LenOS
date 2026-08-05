import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export const STARTER_CHANNELS = [
  { slug: "general", name: "general", description: "Company-wide updates and collaboration." },
  { slug: "welcome-everyone", name: "welcome-everyone", description: "Orientation, introductions, and questions." },
  { slug: "lengrowth", name: "lengrowth", description: "LenGrowth growth context, tasks, and commands." },
  { slug: "tasks", name: "tasks", description: "Task intake, status, and agent results." },
] as const;

export const STARTER_AGENTS = [
  { slug: "growth-guide", name: "Growth Guide", agentType: "guide", description: "Turns growth context into clear next steps." },
  { slug: "market-analyst", name: "Market Analyst", agentType: "analyst", description: "Researches markets, competitors, and customer signals." },
  { slug: "execution-partner", name: "Execution Partner", agentType: "execution", description: "Helps turn decisions into shipped work." },
] as const;

async function stableHex(communityId: string, slug: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`lenos-starter:v1:${communityId}:${slug}`),
  );
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uuidFromHex(hex: string): string {
  const bytes = hex.slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  return [bytes.slice(0, 8).join(""), bytes.slice(8, 12).join(""), bytes.slice(12, 16).join(""), bytes.slice(16, 20).join(""), bytes.slice(20).join("")].join("-");
}

export async function provisionStarterWorkspace(
  communityId: string,
  existingChannelNames: ReadonlySet<string>,
  existingAgentNames: ReadonlySet<string>,
): Promise<void> {
  const client = getRelayClient(relayWsUrl());
  for (const channel of STARTER_CHANNELS) {
    if (existingChannelNames.has(channel.name.toLowerCase())) continue;
    const id = uuidFromHex(await stableHex(communityId, `channel:${channel.slug}`));
    const event = await signNostrEvent({
      kind: 9007,
      content: "",
      tags: [["h", id], ["name", channel.name], ["visibility", "open"], ["channel_type", "stream"], ["about", channel.description]],
    }, { requireNip07: true });
    await client.publishAndWait(event as Record<string, unknown>);
  }

  for (const agent of STARTER_AGENTS) {
    if (existingAgentNames.has(agent.name.toLowerCase())) continue;
    const agentPubkey = await stableHex(communityId, `agent:${agent.slug}`);
    const event = await signNostrEvent({
      kind: 30177,
      content: JSON.stringify({
        name: agent.name,
        description: agent.description,
        agent_type: agent.agentType,
        status: "online",
        remote: true,
      }),
      tags: [["d", agentPubkey], ["name", agent.name], ["about", agent.description], ["agent_type", agent.agentType], ["status", "online"]],
    }, { requireNip07: true });
    await client.publishAndWait(event as Record<string, unknown>);
  }
}
