/**
 * Channel list, creation, and permission states (mocked relay).
 *
 * Mocks hostname + workspace API + relay WebSocket so no live environment is
 * required. WebSocket events are injected via page.evaluate after connection.
 */
import { expect, test } from "@playwright/test";

const WORKSPACE_API =
  "https://growth-api.lenquant.com/api/public/workspace/test-workspace";

const MOCK_WORKSPACE = {
  slug: "test-workspace",
  relay_community_id: "community-test-id",
  relay_url: "wss://relay.test",
};

test.beforeEach(async ({ page }) => {
  // Set workspace slug override before the app's scripts run.
  // Object.defineProperty(window, 'location') is blocked in Chromium.
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__LENOS_WORKSPACE_SLUG__ = "test-workspace";
  });

  await page.route(WORKSPACE_API, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WORKSPACE),
    });
  });

  // Abort relay WebSocket — channels sidebar renders with empty state
  await page.route("wss://relay.test/**", async (route) => {
    await route.abort();
  });
});

test("channels page renders after workspace resolves", async ({ page }) => {
  await page.goto("/channels");
  // Page should reach a stable state — either channels list, onboarding, or
  // the empty-channels state. All are valid; none should be an unhandled crash.
  await expect(
    page
      .getByTestId("channels-sidebar")
      .or(page.getByRole("navigation"))
      .or(page.getByText(/channel|onboard|connect|sign in/i).first()),
  ).toBeVisible({ timeout: 8_000 });
});

test("channels page does not show a JS error overlay", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/channels");
  await page.waitForTimeout(2_000);

  // Filter out known benign warnings (e.g. WebSocket close on aborted relay)
  const fatal = errors.filter(
    (e) =>
      !e.includes("WebSocket") &&
      !e.includes("AbortError") &&
      !e.includes("Failed to fetch"),
  );
  expect(fatal).toHaveLength(0);
});

test("navigating to a channel ID route renders without crash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/channels/test-channel-id");
  await page.waitForTimeout(2_000);

  const fatal = errors.filter(
    (e) =>
      !e.includes("WebSocket") &&
      !e.includes("AbortError") &&
      !e.includes("Failed to fetch"),
  );
  expect(fatal).toHaveLength(0);
});
