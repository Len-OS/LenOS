# Channel Templates Implementation Plan (Web)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Channel Templates feature to the web client (desktop already has full implementation). Users can manage templates in Settings and apply them when creating a channel.

**Architecture:** Web-only feature. 3 touchpoints: new SettingsCard component, SettingsModal section, CreateChannelModal dropdown. Uses kind:30078 d:"channel-templates" for storage (same pattern as desktop).

**Tech Stack:** TypeScript/React, Tailwind CSS, Nostr kind:30078

**Spec:** docs/superpowers/specs/2026-08-14-phase3-design.md (Feature 4)

## Global Constraints

- Web-only (desktop already complete — do NOT modify desktop files)
- Web publish: `signNostrEvent` + `getRelayClient(relayWsUrl()).publishAndWait()`
- Tailwind-only (no shadcn/ui on web)
- Template shape: `{ id: string, name: string, description: string, defaultTopic: string, isPrivate: boolean }`
- kind:30078 d:`"channel-templates"` — content: `{ templates: ChannelTemplate[] }`
- Pre-existing compile error in `crates/lenos-relay/src/api/webhooks.rs:239` — do NOT touch

---

### Task 1: Web — ChannelTemplatesSettingsCard component

**Files:**
- Create: `web/src/features/settings/ui/ChannelTemplatesSettingsCard.tsx`
- Create: `web/src/features/channels/hooks/useChannelTemplates.ts`

**Interfaces:**
- Produces: `useChannelTemplates()` — returns `{ templates: ChannelTemplate[], addTemplate, removeTemplate, updateTemplate }`
- Produces: `<ChannelTemplatesSettingsCard />` — no props

- [ ] **Step 1: Read desktop ChannelTemplatesSettingsCard to understand the pattern**

```bash
cat desktop/src/features/settings/ui/ChannelTemplatesSettingsCard.tsx
```

- [ ] **Step 2: Find web settings patterns (how existing settings cards look)**

```bash
ls web/src/features/settings/ui/
grep -n "input\|button\|form" web/src/features/settings/ui/GeneralSettingsCard.tsx 2>/dev/null | head -20 || grep -rn "card\|Card" web/src/features/settings/ui/ --include="*.tsx" | head -10
```

- [ ] **Step 3: Write useChannelTemplates.ts**

```typescript
// web/src/features/channels/hooks/useChannelTemplates.ts
import { useState, useEffect, useCallback } from "react";
import { signNostrEvent } from "@/shared/lib/nostr";
import { getRelayClient, relayWsUrl, relayHttpBaseUrl } from "@/shared/lib/relay";

export interface ChannelTemplate {
  id: string;
  name: string;
  description: string;
  defaultTopic: string;
  isPrivate: boolean;
}

export function useChannelTemplates() {
  const [templates, setTemplates] = useState<ChannelTemplate[]>([]);

  useEffect(() => {
    // Subscribe to kind:30078 d:"channel-templates" for live updates
    const client = getRelayClient(relayWsUrl());
    const sub = client.subscribe(
      [{ kinds: [30078], "#d": ["channel-templates"], limit: 1 }],
      (event) => {
        try {
          const data = JSON.parse(event.content) as { templates: ChannelTemplate[] };
          setTemplates(data.templates ?? []);
        } catch {
          // ignore
        }
      }
    );
    return () => sub.close();
  }, []);

  const publishTemplates = useCallback(async (newTemplates: ChannelTemplate[]) => {
    const event = await signNostrEvent({
      kind: 30078,
      content: JSON.stringify({ templates: newTemplates }),
      tags: [["d", "channel-templates"]],
      created_at: Math.floor(Date.now() / 1000),
    });
    await getRelayClient(relayWsUrl()).publishAndWait(event);
    setTemplates(newTemplates);
  }, []);

  const addTemplate = useCallback(
    (t: Omit<ChannelTemplate, "id">) => {
      const newTemplates = [...templates, { ...t, id: crypto.randomUUID() }];
      return publishTemplates(newTemplates);
    },
    [templates, publishTemplates]
  );

  const removeTemplate = useCallback(
    (id: string) => {
      const newTemplates = templates.filter((t) => t.id !== id);
      return publishTemplates(newTemplates);
    },
    [templates, publishTemplates]
  );

  const updateTemplate = useCallback(
    (id: string, updates: Partial<ChannelTemplate>) => {
      const newTemplates = templates.map((t) => (t.id === id ? { ...t, ...updates } : t));
      return publishTemplates(newTemplates);
    },
    [templates, publishTemplates]
  );

  return { templates, addTemplate, removeTemplate, updateTemplate };
}
```

Check actual `signNostrEvent` and `getRelayClient` import paths:
```bash
grep -rn "export.*signNostrEvent\|export.*getRelayClient" web/src/shared/ --include="*.ts" | head -5
```

- [ ] **Step 4: Write ChannelTemplatesSettingsCard.tsx**

This card lets admins manage the list of channel templates. Provide a form to add a new template (name, description, isPrivate toggle) and a list of existing templates with delete buttons.

```tsx
import { useState } from "react";
import { useChannelTemplates, ChannelTemplate } from "@/features/channels/hooks/useChannelTemplates";

export function ChannelTemplatesSettingsCard() {
  const { templates, addTemplate, removeTemplate } = useChannelTemplates();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addTemplate({ name: name.trim(), description: description.trim(), defaultTopic: "", isPrivate });
    setName("");
    setDescription("");
    setIsPrivate(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Channel Templates</h3>
      <form onSubmit={handleAdd} className="space-y-2">
        <input
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          Private by default
        </label>
        <button
          type="submit"
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add Template
        </button>
      </form>
      <ul className="space-y-2">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{t.name}</div>
              {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
            </div>
            <button
              onClick={() => removeTemplate(t.id)}
              className="text-xs text-destructive hover:underline ml-4"
            >
              Remove
            </button>
          </li>
        ))}
        {templates.length === 0 && (
          <li className="text-xs text-muted-foreground">No templates yet.</li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add web/src/features/channels/hooks/useChannelTemplates.ts web/src/features/settings/ui/ChannelTemplatesSettingsCard.tsx
git commit -m "feat(web): add ChannelTemplatesSettingsCard and useChannelTemplates hook"
```

---

### Task 2: Web — add Channel Templates section to SettingsModal

**Files:**
- Modify: `web/src/features/settings/ui/SettingsModal.tsx`

**Interfaces:**
- Consumes: `ChannelTemplatesSettingsCard` from `./ChannelTemplatesSettingsCard`

- [ ] **Step 1: Read SettingsModal.tsx to understand section structure**

```bash
cat web/src/features/settings/ui/SettingsModal.tsx | head -120
```

- [ ] **Step 2: Add channel-templates section**

The spec says: add `{ id: 'channel-templates', label: 'Channel Templates', icon: LayoutTemplate }` to the `SECTIONS` array (line ~80).

```bash
grep -n "SECTIONS\|sections\|LayoutTemplate\|lucide" web/src/features/settings/ui/SettingsModal.tsx | head -15
```

Add the LayoutTemplate import from lucide-react, add the section entry, and add the render case for `channel-templates` that renders `<ChannelTemplatesSettingsCard />`.

The render pattern is usually a switch/if block. Find how existing sections render their content and follow the same pattern.

- [ ] **Step 3: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add web/src/features/settings/ui/SettingsModal.tsx
git commit -m "feat(web): add Channel Templates section to SettingsModal"
```

---

### Task 3: Web — template selector in CreateChannelModal

**Files:**
- Modify: `web/src/features/channels/ui/CreateChannelModal.tsx`

**Interfaces:**
- Consumes: `useChannelTemplates` from `../hooks/useChannelTemplates`
- Consumes: `ChannelTemplate` type from `../hooks/useChannelTemplates`

- [ ] **Step 1: Read CreateChannelModal to understand current form fields**

```bash
cat web/src/features/channels/ui/CreateChannelModal.tsx | head -150
```

- [ ] **Step 2: Add template select dropdown**

At the top of the form (before name/description fields), add a template selector:

```tsx
const { templates } = useChannelTemplates();
const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

const handleTemplateChange = (templateId: string) => {
  setSelectedTemplateId(templateId);
  if (!templateId) return;
  const t = templates.find((t) => t.id === templateId);
  if (!t) return;
  setName(t.name);
  setDescription(t.description);
  // isPrivate setter — find the actual state setter name in the file
  setIsPrivate(t.isPrivate);
};
```

Add a `<select>` element (or styled select):
```tsx
{templates.length > 0 && (
  <div className="space-y-1">
    <label className="text-xs font-medium text-muted-foreground">Template (optional)</label>
    <select
      className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
      value={selectedTemplateId}
      onChange={(e) => handleTemplateChange(e.target.value)}
    >
      <option value="">No template</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  </div>
)}
```

- [ ] **Step 3: Adjust state setter names**

The actual state variable names for name/description/isPrivate in CreateChannelModal may differ. Read the file and use the correct names.

- [ ] **Step 4: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add web/src/features/channels/ui/CreateChannelModal.tsx
git commit -m "feat(web): add template selector to CreateChannelModal"
```
