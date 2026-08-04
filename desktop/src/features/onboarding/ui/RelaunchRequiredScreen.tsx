import { RecoveryScreen } from "./RecoveryScreen";

export function RelaunchRequiredScreen() {
  return (
    <RecoveryScreen
      testId="relaunch-required"
      title="Restart LenOS to finish recovery"
      body="Your identity was updated. LenOS needs to restart so syncing and agents run under it."
    />
  );
}
