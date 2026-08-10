import { useState, useEffect, type ReactNode } from "react";
import {
  hasDurableIdentity,
  IDENTITY_STATE_CHANGE_EVENT,
} from "@/shared/lib/nostr-signer";
import { WebOnboardingFlow } from "./WebOnboardingFlow";
import { LenGrowthWorkspaceWelcome } from "./LenGrowthWorkspaceWelcome";

interface Props {
  children: ReactNode;
}

export function OnboardingGate({ children }: Props) {
  const [isDurable, setIsDurable] = useState(() => hasDurableIdentity());

  useEffect(() => {
    const refresh = () => setIsDurable(hasDurableIdentity());
    window.addEventListener(IDENTITY_STATE_CHANGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(IDENTITY_STATE_CHANGE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (!isDurable) {
    return (
      <WebOnboardingFlow
        onComplete={() => setIsDurable(hasDurableIdentity())}
      />
    );
  }

  return (
    <>
      <LenGrowthWorkspaceWelcome />
      {children}
    </>
  );
}
