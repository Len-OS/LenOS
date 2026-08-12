import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface ProfilePanelState {
  pubkey: string | null;
  openProfile: (pubkey: string) => void;
  closeProfile: () => void;
}

const ProfilePanelContext = createContext<ProfilePanelState>({
  pubkey: null,
  openProfile: () => {},
  closeProfile: () => {},
});

export function ProfilePanelProvider({ children }: { children: ReactNode }) {
  const [pubkey, setPubkey] = useState<string | null>(null);

  const openProfile = useCallback((pk: string) => setPubkey(pk), []);
  const closeProfile = useCallback(() => setPubkey(null), []);

  return (
    <ProfilePanelContext.Provider value={{ pubkey, openProfile, closeProfile }}>
      {children}
    </ProfilePanelContext.Provider>
  );
}

export function useProfilePanel() {
  return useContext(ProfilePanelContext);
}
