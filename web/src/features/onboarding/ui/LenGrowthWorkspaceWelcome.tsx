import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Circle,
  ExternalLink,
  Hash,
  KeyRound,
  Sparkles,
  Users,
} from "lucide-react";
import { useAgents } from "@/features/agents/useAgents";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import {
  getCurrentPubkey,
  hasDurableIdentity,
  IDENTITY_STATE_CHANGE_EVENT,
} from "@/shared/lib/nostr-signer";
import {
  provisionStarterWorkspace,
  publishLenGrowthCommand,
  STARTER_AGENTS,
  STARTER_CHANNELS,
} from "@/features/onboarding/starterWorkspace";

function Step({
  complete,
  icon: Icon,
  title,
  description,
  action,
}: {
  complete: boolean;
  icon: typeof KeyRound;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="mt-0.5 shrink-0 text-black/40 dark:text-white/40">
        {complete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-black dark:text-white">
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-black/50 dark:text-white/50">
          {description}
        </p>
        {action}
      </div>
    </div>
  );
}

/**
 * The browser onboarding is intentionally quiet. The workspace is prepared
 * automatically after LenGrowth has handed the user a durable identity.
 */
export function LenGrowthWorkspaceWelcome() {
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const agents = useAgents(communityId);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [commandSending, setCommandSending] = useState(false);
  const autoProvisioned = useRef(false);

  const channelNames = new Set(
    channels.map((channel) => channel.name.trim().toLowerCase()),
  );
  const agentNames = new Set(
    agents.map((agent) => agent.name.trim().toLowerCase()),
  );
  const hasChannels = STARTER_CHANNELS.every((channel) =>
    channelNames.has(channel.name),
  );
  const hasAgents = STARTER_AGENTS.every((agent) =>
    agentNames.has(agent.name.toLowerCase()),
  );

  useEffect(() => {
    const refreshIdentity = () => {
      if (!hasDurableIdentity()) {
        setPubkey(null);
        return;
      }
      getCurrentPubkey()
        .then(setPubkey)
        .catch(() => setPubkey(null));
    };
    refreshIdentity();
    window.addEventListener(IDENTITY_STATE_CHANGE_EVENT, refreshIdentity);
    window.addEventListener("focus", refreshIdentity);
    return () => {
      window.removeEventListener(IDENTITY_STATE_CHANGE_EVENT, refreshIdentity);
      window.removeEventListener("focus", refreshIdentity);
    };
  }, []);

  useEffect(() => {
    if (
      workspace.status !== "found" ||
      !communityId ||
      !pubkey ||
      (hasChannels && hasAgents) ||
      autoProvisioned.current
    ) {
      return;
    }
    autoProvisioned.current = true;
    setProvisioning(true);
    setProvisionError(null);
    void provisionStarterWorkspace(communityId, channelNames, agentNames)
      .catch((error) => {
        setProvisionError(
          error instanceof Error
            ? error.message
            : "We could not finish setting up your workspace.",
        );
      })
      .finally(() => setProvisioning(false));
  }, [
    agentNames,
    channelNames,
    communityId,
    hasAgents,
    hasChannels,
    pubkey,
    workspace.status,
  ]);

  if (workspace.status !== "found") return null;
  const growthChannel = channels.find(
    (channel) => channel.name.trim().toLowerCase() === "lengrowth",
  );
  const complete = Boolean(pubkey) && hasChannels && hasAgents;
  if (complete) return null;

  const provision = async () => {
    if (!communityId || !hasDurableIdentity()) return;
    setProvisioning(true);
    setProvisionError(null);
    try {
      await provisionStarterWorkspace(communityId, channelNames, agentNames);
    } catch (error) {
      setProvisionError(
        error instanceof Error ? error.message : "Workspace setup failed",
      );
    } finally {
      setProvisioning(false);
    }
  };

  const sendTask = async () => {
    if (!growthChannel || !taskTitle.trim() || !taskDescription.trim()) return;
    setCommandSending(true);
    setCommandStatus(null);
    try {
      await publishLenGrowthCommand(
        growthChannel.id,
        `create task: ${taskTitle.trim()} | ${taskDescription.trim()}`,
      );
      setCommandStatus("Task request sent to LenGrowth in #lengrowth.");
      setTaskTitle("");
      setTaskDescription("");
    } catch (error) {
      setCommandStatus(
        error instanceof Error
          ? error.message
          : "Could not send the task request.",
      );
    } finally {
      setCommandSending(false);
    }
  };

  const runAgent = async (role: string) => {
    if (!growthChannel || !taskDescription.trim()) return;
    setCommandSending(true);
    setCommandStatus(null);
    try {
      await publishLenGrowthCommand(
        growthChannel.id,
        `run agent ${role}: ${taskDescription.trim()}`,
      );
      setCommandStatus(`${role} request sent to LenGrowth in #lengrowth.`);
    } catch (error) {
      setCommandStatus(
        error instanceof Error
          ? error.message
          : "Could not send the agent request.",
      );
    } finally {
      setCommandSending(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-900/60 dark:bg-blue-950/20">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-600 p-2 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-black dark:text-white">
              Welcome to your LenGrowth workspace
            </h1>
            <p className="mt-1 text-sm leading-6 text-black/60 dark:text-white/60">
              This browser is your Slack-like command center. LenGrowth provides
              the growth context and tasks; the workspace displays the channels,
              agents, and work they produce.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Step
            complete={Boolean(pubkey)}
            icon={KeyRound}
            title="Your workspace"
            description="Your workspace is connected and getting ready for you."
          />
          <Step
            complete={hasChannels}
            icon={Hash}
            title="Your channels"
            description="Your shared spaces will appear here automatically."
            action={
              provisionError && !hasChannels ? (
                <button
                  type="button"
                  onClick={() => void provision()}
                  disabled={!pubkey || provisioning}
                  className="mt-2 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"
                >
                  {provisioning
                    ? "Provisioning…"
                    : "Provision starter workspace"}{" "}
                  <ArrowRight className="ml-1 inline h-3 w-3" />
                </button>
              ) : undefined
            }
          />
          <Step
            complete={hasAgents}
            icon={Bot}
            title="Your LenGrowth team"
            description="Your team will appear here automatically."
            action={
              provisionError && !hasAgents ? (
                <button
                  type="button"
                  onClick={() => void provision()}
                  disabled={!pubkey || provisioning}
                  className="mt-2 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"
                >
                  {provisioning ? "Provisioning…" : "Provision growth team"}{" "}
                  <ArrowRight className="ml-1 inline h-3 w-3" />
                </button>
              ) : undefined
            }
          />
        </div>

        {provisionError && (
          <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Provisioning failed: {provisionError}
          </p>
        )}

        {hasChannels && (
          <div className="mt-5 rounded-lg border border-black/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm font-medium text-black dark:text-white">
              Start with LenGrowth
            </p>
            <p className="mt-1 text-xs leading-5 text-black/50 dark:text-white/50">
              Create a task or ask a remote growth role from here. Requests are
              sent to the workspace #lengrowth channel and require a linked
              identity.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Task title"
                disabled={!pubkey || !growthChannel || commandSending}
                className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/10"
              />
              <input
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
                placeholder="What should LenGrowth work on?"
                disabled={!pubkey || !growthChannel || commandSending}
                className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/10"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void sendTask()}
                disabled={
                  !pubkey ||
                  !growthChannel ||
                  !taskTitle.trim() ||
                  !taskDescription.trim() ||
                  commandSending
                }
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create task
              </button>
              {(["guide", "analyst", "execution"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => void runAgent(role)}
                  disabled={
                    !pubkey ||
                    !growthChannel ||
                    !taskDescription.trim() ||
                    commandSending
                  }
                  className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-white/70"
                >
                  Run {role}
                </button>
              ))}
            </div>
            {commandStatus && (
              <p className="mt-2 text-xs text-black/60 dark:text-white/60">
                {commandStatus}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-black/50 dark:text-white/50">
          <a
            href="https://lengrowth.com/settings/company?tab=team"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white"
          >
            <Users className="h-3.5 w-3.5" />
            Open Team Hub
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="inline-flex items-center gap-1">
            <Circle className="h-2.5 w-2.5 fill-current" />
            {pubkey
              ? "Workspace connected"
              : "Finish opening LenOS from LenGrowth to continue"}
          </span>
        </div>
      </div>
    </section>
  );
}
