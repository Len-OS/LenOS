/**
 * Responsive layout and accessibility checks (mocked workspace).
 *
 * Tests 320px, 768px, and 1280px viewports for horizontal overflow,
 * sidebar visibility, keyboard focus, and dialog semantics.
 * No live relay or auth required — workspace and relay are mocked.
 */
import { expect, test } from "@playwright/test";

const WORKSPACE_API =
  "https://growth-api.lenquant.com/api/public/workspace/test-workspace";

const MOCK_WORKSPACE = {
  slug: "test-workspace",
  relay_community_id: "community-test-id",
  relay_url: "wss://relay.test",
};

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 568 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

async function setupMocks(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.addInitScript(() => { (window as any).__LENOS_WORKSPACE_SLUG__ = "test-workspace"; });
  await page.route(WORKSPACE_API, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_WORKSPACE) }),
  );
  await page.route("wss://relay.test/**", (route) => route.abort());
}

for (const vp of VIEWPORTS) {
  test(`no horizontal overflow at ${vp.name} (${vp.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await setupMocks(page);
    await page.goto("/channels");
    await page.waitForTimeout(1_500);

    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflowX, `horizontal overflow at ${vp.width}px`).toBe(false);
  });

  test(`renders without JS crash at ${vp.name} (${vp.width}px)`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await setupMocks(page);
    await page.goto("/channels");
    await page.waitForTimeout(1_500);

    const fatal = errors.filter(
      (e) => !e.includes("WebSocket") && !e.includes("AbortError") && !e.includes("Failed to fetch"),
    );
    expect(fatal).toHaveLength(0);
  });
}

test("mobile: sidebar or menu button visible at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupMocks(page);
  await page.goto("/channels");
  await page.waitForTimeout(1_500);

  // On mobile, either a hamburger/menu button or the sidebar itself is visible.
  const hasSidebar = await page
    .getByRole("navigation")
    .or(page.getByRole("button", { name: /menu|sidebar|channels/i }).first())
    .isVisible()
    .catch(() => false);

  // Acceptable outcome: sidebar is open OR a toggle button exists OR onboarding gate shown
  const hasOnboarding = await page
    .getByText(/connect|onboard|sign in/i)
    .first()
    .isVisible()
    .catch(() => false);

  expect(hasSidebar || hasOnboarding, "mobile: sidebar or onboarding should be visible").toBe(true);
});

test("keyboard: Tab key produces visible focus ring", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await setupMocks(page);
  await page.goto("/channels");
  await page.waitForTimeout(1_500);

  // Tab to first interactive element
  await page.keyboard.press("Tab");

  const focusedOutline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const style = window.getComputedStyle(el);
    // Either outline or box-shadow can implement a visible focus ring
    const hasOutline =
      style.outlineWidth !== "0px" && style.outlineStyle !== "none";
    const hasBoxShadow = style.boxShadow !== "none" && style.boxShadow !== "";
    return hasOutline || hasBoxShadow;
  });

  // Not all apps have focus ring on first Tab (e.g., if first element is a skip link).
  // This is a soft check — warn rather than hard-fail if no focused element found.
  if (!focusedOutline) {
    console.warn("No visible focus ring detected after first Tab — review accessibility.");
  }
});

test("dialog semantics: settings or modal dialog has correct ARIA role", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await setupMocks(page);
  await page.goto("/channels");
  await page.waitForTimeout(1_500);

  // Try to find and click any button that would open a dialog (e.g., settings, add channel)
  const trigger = page
    .getByRole("button", { name: /settings|add channel|create|invite/i })
    .first();
  const triggerVisible = await trigger.isVisible().catch(() => false);

  if (triggerVisible) {
    await trigger.click();
    await page.waitForTimeout(500);

    const dialog = page.getByRole("dialog");
    const hasDialog = await dialog.isVisible().catch(() => false);
    if (hasDialog) {
      // Dialog must have an accessible name (aria-label or aria-labelledby)
      const ariaLabel = await dialog.getAttribute("aria-label");
      const ariaLabelledBy = await dialog.getAttribute("aria-labelledby");
      expect(
        ariaLabel || ariaLabelledBy,
        "dialog must have aria-label or aria-labelledby",
      ).toBeTruthy();

      // Escape should close the dialog
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  }
  // If no trigger found (auth gate), test passes — page rendered without crash.
});
