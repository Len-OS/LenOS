/** Material Phase 0 screenshots for the current LenOS workspace shell. */
import { expect, test } from "@playwright/test";

const API =
  "https://growth-api.lenquant.com/api/public/workspace/phase0-workspace";

test("capture current workspace shell baseline", async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __LENOS_WORKSPACE_SLUG__: string }
    ).__LENOS_WORKSPACE_SLUG__ = "phase0-workspace";
  });
  await page.route(API, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        slug: "phase0-workspace",
        relay_community_id: "community-phase0",
        relay_url: "wss://relay.phase0.test",
      }),
    });
  });
  await page.route("wss://relay.phase0.test/**", (route) => route.abort());

  await page.goto("/channels");
  await expect(
    page
      .getByRole("navigation")
      .or(page.getByTestId("channels-sidebar"))
      .or(page.getByText(/connect|onboard|sign in/i).first()),
  ).toBeVisible({ timeout: 8_000 });
  await page.screenshot({
    path: "test-results/phase0-baseline/workspace-shell.png",
    fullPage: true,
  });
});

test("capture current unknown-workspace baseline", async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __LENOS_WORKSPACE_SLUG__: string }
    ).__LENOS_WORKSPACE_SLUG__ = "phase0-missing";
  });
  await page.route(
    "https://growth-api.lenquant.com/api/public/workspace/phase0-missing",
    async (route) => {
      await route.fulfill({
        status: 404,
        body: JSON.stringify({ detail: "Not found" }),
      });
    },
  );

  await page.goto("/channels");
  await expect(page.getByText(/workspace|not found/i).first()).toBeVisible({
    timeout: 5_000,
  });
  await page.screenshot({
    path: "test-results/phase0-baseline/workspace-not-found.png",
    fullPage: true,
  });
});
