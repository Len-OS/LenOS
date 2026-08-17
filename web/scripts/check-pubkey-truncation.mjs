import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPubkeyTruncationCheck } from "../../scripts/check-pubkey-truncation-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const rules = [
  {
    root: "src",
    extensions: new Set([".ts", ".tsx"]),
  },
];

const overrides = new Set([
  // Avatar fallback initials — two glyphs inside an avatar disc.
  "src/features/repos/ui/PubkeyAvatar.tsx:29",
  // Array window (first N pubkeys), not string truncation.
  "src/features/repos/ui/OrgSidebar.tsx:22",
  // Fallback filename for export download — not a user-facing identity display.
  "src/features/settings/ui/PrivacySettingsPanel.tsx:56",
  // Partial pubkey stored in local export history record — not displayed.
  "src/features/settings/ui/PrivacySettingsPanel.tsx:68",
  // npub (bech32) truncation for copy button — truncatePubkey is for hex keys.
  "src/features/profiles/ui/UserProfilePanel.tsx:110",
  // npub (bech32) truncation for copy button in popover — not a hex identity display.
  "src/features/profiles/ui/ProfilePopover.tsx:98",
  // npub (bech32) truncation in confirmation dialog after linking identity.
  "src/features/profiles/ui/NostrBindDialog.tsx:172",
  // npub (bech32) used as filename suffix for export download — not displayed.
  "src/features/profiles/ui/ProfileExport.tsx:44",
  // Raw hex key prefix in monospace lock screen — shows first 20 chars for account identification.
  "src/features/onboarding/ui/KeyringLockedScreen.tsx:114",
  // Search filter comparison fallback — not displayed, used for string match only.
  "src/features/people/ui/PeoplePage.tsx:121",
]);

await runPubkeyTruncationCheck({
  projectRoot,
  rules,
  overrides,
  allowedFiles: new Set(["src/shared/lib/pubkey.ts"]),
  label: "Web",
  scriptPath: "web/scripts/check-pubkey-truncation.mjs",
});
