import { useState, type ReactNode } from "react";
import { hasNip07Provider } from "@/shared/lib/nostr-signer";
import { IdentityStep } from "./IdentityStep";
import { ProfileSetupStep } from "./ProfileSetupStep";

function hasIdentity(): boolean {
  return hasNip07Provider() || !!localStorage.getItem("lenos_privkey");
}

type Step = "identity" | "profile" | "done";

function getInitialStep(): Step {
  return hasIdentity() ? "done" : "identity";
}

interface Props {
  children: ReactNode;
}

export function OnboardingGate({ children }: Props) {
  const [step, setStep] = useState<Step>(getInitialStep);

  if (step === "done") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-8 dark:bg-[#111]">
      <div className="w-full max-w-md">
        {step === "identity" && (
          <IdentityStep
            onComplete={() => {
              if (hasIdentity()) {
                setStep("profile");
              }
            }}
          />
        )}
        {step === "profile" && (
          <ProfileSetupStep onComplete={() => setStep("done")} />
        )}
      </div>
    </div>
  );
}
