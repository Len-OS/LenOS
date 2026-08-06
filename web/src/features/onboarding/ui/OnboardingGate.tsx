import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function OnboardingGate({ children }: Props) {
  // The relay client has an ephemeral-key fallback for open/read-only browsing.
  // Do not block the whole workspace on NIP-07: users arriving from the
  // LenGrowth web app must be able to see the Slack-like workspace immediately.
  // Operations that create durable membership still pass `requireNip07` and
  // remain protected by the signer.
  return <>{children}</>;
}
