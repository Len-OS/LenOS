# Channel Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring web to parity with the already-complete desktop channel templates feature: add a Channel Templates section to web Settings, and a template dropdown in the web channel creation modal.

**Architecture:** Desktop already has `ChannelTemplatesSettingsCard`, `ChannelTemplate` type, `useChannelTemplatesQuery`, and template dropdown in `CreateChannelFormFields`. Web needs: (1) a Settings section entry, (2) a mirrored `ChannelTemplatesSettingsCard` for web, (3) a template dropdown in `CreateChannelModal`. Templates are stored as kind:30078 d:`"channel-templates"`, content = JSON array of template objects.

**Tech Stack:** TypeScript/React, Nostr kind:30078, web pub/query patterns

**Spec:** `docs/superpowers/specs/2026-08-14-phase3-design.md` — Feature 4

## Global Constraints

- Desktop already done. Implement web only.
- Web publish pattern: `signNostrEvent` + `getRelayClient(relayWsUrl()).publishAndWait()`
- Template shape: `{ id: string, name: string, description: string, defaultTopic: string, isPrivate: boolean }`
- kind:30078 d-tag: `"channel-templates"`; content: `JSON.stringify(templates[])`
- `SECTIONS` array is in `web/src/features/settings/ui/SettingsModal.tsx:80`
- Settings panel render switch is in the same file (or nearby)

---

### Task 1: `ChannelTemplate` type + `useChannelTemplatesQuery` hook for web

**Files:**
- Create: `web/src/features/channels/templates/types.ts`
- Create: `web/src/features/channels/templates/useChannelTemplates.ts`

**Interfaces:**
- Produces: `ChannelTemplate` type and `useChannelTemplates()` hook used by Tasks 2 and 3

- [ ] **Step 1: Create types**

```typescript
// web/src/features/channels/templates/types.ts
export interface ChannelTemplate {
  id: string;
  name: string;
  description: string;
  defaultTopic: string;
  isPrivate: boolean;
}
```

- [ ] **Step 2: Create `useChannelTemplates` hook**

```typescript
// web/src/features/channels/templates/useChannelTemplates.ts
import { useState, useEffect, useCallback } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import type { ChannelTemplate } from "./types";

const D_TAG = "channel-templates";

export function useChannelTemplates() {
  const [templates, setTemplates] = useState<ChannelTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: "channel-templates",
      filter: { kinds: [30078], "#d": [D_TAG] },
      onEvent: (raw) => {
        setLoading(false);
        try {
          const parsed = JSON.parse(raw.content as string) as ChannelTemplate[];
          setTemplates(Array.isArray(parsed) ? parsed : []);
        } catch {
          setTemplates([]);
        }
      },
    });
    // If no event arrives, clear loading after timeout
    const t = setTimeout(() => setLoading(false), 5000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  const saveTemplates = useCallback(async (next: ChannelTemplate[]) => {
    const signed = await signNostrEvent(
      {
        kind: 30078,
        content: JSON.stringify(next),
        tags: [["d", D_TAG]],
      },
      { requireNip07: false },
    );
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
  }, []);

  const addTemplate = useCallback(
    async (t: Omit<ChannelTemplate, "id">) => {
      const newTemplate: ChannelTemplate = {
        ...t,
        id: crypto.randomUUID(),
      };
      await saveTemplates([...templates, newTemplate]);
    },
    [templates, saveTemplates],
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      await saveTemplates(templates.filter((t) => t.id !== id));
    },
    [templates, saveTemplates],
  );

  return { templates, loading, addTemplate, deleteTemplate };
}
```

- [ ] **Step 3: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add web/src/features/channels/templates/types.ts \
        web/src/features/channels/templates/useChannelTemplates.ts
git commit -m "feat(web): add ChannelTemplate type and useChannelTemplates hook"
```

---

### Task 2: Web — `ChannelTemplatesSettingsCard` component

**Files:**
- Create: `web/src/features/settings/ui/ChannelTemplatesSettingsCard.tsx`

**Interfaces:**
- Consumes: `useChannelTemplates()` from Task 1

- [ ] **Step 1: Write the component**

```tsx
// web/src/features/settings/ui/ChannelTemplatesSettingsCard.tsx
import { useState } from "react";
import { useChannelTemplates } from "@/features/channels/templates/useChannelTemplates";
import type { ChannelTemplate } from "@/features/channels/templates/types";

export function ChannelTemplatesSettingsCard() {
  const { templates, loading, addTemplate, deleteTemplate } = useChannelTemplates();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    defaultTopic: "",
    isPrivate: false,
  });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await addTemplate(form);
      setForm({ name: "", description: "", defaultTopic: "", isPrivate: false });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-black dark:text-white">Channel Templates</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded px-3 py-1.5 text-sm font-medium bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          {showForm ? "Cancel" : "New Template"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-black/10 p-4 space-y-3 dark:border-white/10">
          <label className="block text-sm">
            <span className="font-medium text-black/70 dark:text-white/70">Name *</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 block w-full rounded border border-black/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
              placeholder="e.g. Engineering channel"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-black/70 dark:text-white/70">Description</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="mt-1 block w-full rounded border border-black/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-black/70 dark:text-white/70">Default Topic</span>
            <input
              type="text"
              value={form.defaultTopic}
              onChange={(e) => setForm((f) => ({ ...f, defaultTopic: e.target.value }))}
              className="mt-1 block w-full rounded border border-black/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPrivate}
              onChange={(e) => setForm((f) => ({ ...f, isPrivate: e.target.checked }))}
            />
            <span className="text-black/70 dark:text-white/70">Private channel</span>
          </label>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={saving || !form.name.trim()}
            className="rounded px-3 py-1.5 text-sm font-medium bg-black text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      )}

      {loading && (
        <p className="text-sm text-black/40 dark:text-white/40">Loading…</p>
      )}

      {!loading && templates.length === 0 && !showForm && (
        <p className="text-sm text-black/40 dark:text-white/40">No templates yet.</p>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="flex items-start justify-between rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div>
              <p className="text-sm font-medium text-black dark:text-white">{t.name}</p>
              {t.description && (
                <p className="text-xs text-black/50 dark:text-white/50">{t.description}</p>
              )}
              <p className="mt-0.5 text-xs text-black/40 dark:text-white/40">
                {t.isPrivate ? "Private" : "Public"}{t.defaultTopic ? ` • Topic: ${t.defaultTopic}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void deleteTemplate(t.id)}
              className="text-xs text-red-500 hover:underline"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add web/src/features/settings/ui/ChannelTemplatesSettingsCard.tsx
git commit -m "feat(web): add ChannelTemplatesSettingsCard"
```

---

### Task 3: Web — add Channel Templates to Settings + `CreateChannelModal`

**Files:**
- Modify: `web/src/features/settings/ui/SettingsModal.tsx`
- Modify: `web/src/features/channels/ui/CreateChannelModal.tsx`

**Interfaces:**
- Consumes: `ChannelTemplatesSettingsCard` from Task 2
- Consumes: `useChannelTemplates()` from Task 1

- [ ] **Step 1: Examine SettingsModal SECTIONS + render switch**

Read `web/src/features/settings/ui/SettingsModal.tsx` and find:
- The `SECTIONS` array (around line 80)
- The panel render switch (nearby)

- [ ] **Step 2: Add `channel-templates` to SECTIONS**

In the `SECTIONS` array, add:

```typescript
{ id: "channel-templates", label: "Channel Templates" },
```

- [ ] **Step 3: Add case to render switch**

In the panel render switch (likely a chain of `selectedSection === "..."` checks), add:

```tsx
import { ChannelTemplatesSettingsCard } from "@/features/settings/ui/ChannelTemplatesSettingsCard";

// In the render switch:
{selectedSection === "channel-templates" && <ChannelTemplatesSettingsCard />}
```

- [ ] **Step 4: Read `CreateChannelModal.tsx` and find the form fields**

Read `web/src/features/channels/ui/CreateChannelModal.tsx` to understand current fields (name, id, description).

- [ ] **Step 5: Add template dropdown to `CreateChannelModal`**

Add imports:

```typescript
import { useChannelTemplates } from "@/features/channels/templates/useChannelTemplates";
```

Inside the modal component, add:

```typescript
const { templates } = useChannelTemplates();
const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
```

Add a template `<select>` before the name field:

```tsx
{templates.length > 0 && (
  <label className="block text-sm">
    <span className="font-medium text-black/70 dark:text-white/70">Use template</span>
    <select
      value={selectedTemplateId}
      onChange={(e) => {
        const id = e.target.value;
        setSelectedTemplateId(id);
        const tpl = templates.find((t) => t.id === id);
        if (tpl) {
          setName(tpl.name);
          setDescription(tpl.description);
          // If modal supports isPrivate, set it: setIsPrivate(tpl.isPrivate)
        }
      }}
      className="mt-1 block w-full rounded border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/15"
    >
      <option value="">No template</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  </label>
)}
```

Note: `setName` and `setDescription` are the modal's existing state setters for those fields — find them by reading the file.

- [ ] **Step 6: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add web/src/features/settings/ui/SettingsModal.tsx \
        web/src/features/channels/ui/CreateChannelModal.tsx
git commit -m "feat(web): add channel templates section to Settings and CreateChannelModal"
```
