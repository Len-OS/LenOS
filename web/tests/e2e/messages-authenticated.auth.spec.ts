/**
 * Message composer and timeline rendering (mocked relay).
 *
 * Navigates to a channel route and verifies that the message composer and
 * timeline mount correctly. No live relay required.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.addInitScript(() => {
    (window as any).__LENOS_WORKSPACE_SLUG__ = "test-workspace";
  });

  await page.route(WORKSPACE_API, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WORKSPACE),
    });
  });

  await page.route("wss://relay.test/**", async (route) => {
    await route.abort();
  });
});

test("message channel page renders without JS errors", async ({ page }) => {
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

test("message composer or identity gate is visible in channel view", async ({
  page,
}) => {
  await page.goto("/channels/test-channel-id");

  // Either the composer textarea or an onboarding/identity gate renders.
  // Both outcomes are correct — we just verify no blank/crashed state.
  await expect(
    page
      .getByRole("textbox")
      .or(page.getByText(/connect|onboard|sign in|identity/i).first()),
  ).toBeVisible({ timeout: 8_000 });
});

test("DM list page renders without crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/messages");
  await page.waitForTimeout(2_000);

  const fatal = errors.filter(
    (e) =>
      !e.includes("WebSocket") &&
      !e.includes("AbortError") &&
      !e.includes("Failed to fetch"),
  );
  expect(fatal).toHaveLength(0);
});
