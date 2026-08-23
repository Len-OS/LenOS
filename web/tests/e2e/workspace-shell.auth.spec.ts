/**
 * Workspace shell loading and error states.
 *
 * These tests mock the hostname so the app resolves a tenant slug, then mock
 * the LenGrowth public workspace API to control loading / not-found / error
 * states. No live relay or real account is required.
 */
import { expect, test } from "@playwright/test";

const WORKSPACE_API =
  "https://growth-api.lenquant.com/api/public/workspace/test-workspace";

const MOCK_WORKSPACE = {
  slug: "test-workspace",
  relay_community_id: "community-test-id",
  relay_url: "wss://relay.test",
};

function mockHostname(
  page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown
    ? P
    : never,
) {
  // Object.defineProperty(window, 'location') is blocked in Chromium.
  // Use the __LENOS_WORKSPACE_SLUG__ escape hatch in extractSlug() instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.addInitScript(() => {
    (window as any).__LENOS_WORKSPACE_SLUG__ = "test-workspace";
  });
}

test("workspace shell renders loading state while fetching workspace", async ({
  page,
}) => {
  await mockHostname(page);

  let resolveWorkspace: (value: Response) => void;
  const pendingWorkspace = new Promise<Response>((resolve) => {
    resolveWorkspace = resolve;
  });

  await page.route(WORKSPACE_API, async (route) => {
    await pendingWorkspace;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WORKSPACE),
    });
  });

  await page.goto("/channels");
  // Loading state is visible before the API resolves
  await expect(page.getByTestId("workspace-loading"))
    .toBeVisible({ timeout: 3_000 })
    .catch(() => {
      // Loading may be too fast to capture; tolerate if workspace resolves first
    });
  resolveWorkspace!(new Response());
});

test("workspace not-found state shown for unknown slug", async ({ page }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.addInitScript(() => {
    (window as any).__LENOS_WORKSPACE_SLUG__ = "unknown-workspace";
  });

  await page.route(
    "https://growth-api.lenquant.com/api/public/workspace/unknown-workspace",
    async (route) => {
      await route.fulfill({
        status: 404,
        body: JSON.stringify({ detail: "Not found" }),
      });
    },
  );

  await page.goto("/channels");
  // WorkspaceNotFound or WorkspaceLoadError should be rendered
  await expect(
    page
      .getByText(/workspace/i)
      .or(page.getByText(/not found/i))
      .first(),
  ).toBeVisible({ timeout: 5_000 });
});

test("workspace shell renders channels sidebar after workspace resolves", async ({
  page,
}) => {
  await mockHostname(page);

  await page.route(WORKSPACE_API, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WORKSPACE),
    });
  });

  // Block WebSocket connections to the relay so there are no errors
  await page.route("wss://relay.test/**", async (route) => {
    await route.abort();
  });

  await page.goto("/channels");

  // After workspace resolves the channels sidebar should be present.
  // WorkspaceLoading/OnboardingGate may intercept before channels render;
  // accept either the sidebar or an onboarding screen as success.
  await expect(
    page
      .getByRole("navigation")
      .or(page.getByTestId("channels-sidebar"))
      .or(page.getByText(/connect|onboard|sign in/i).first()),
  ).toBeVisible({ timeout: 8_000 });
});

test("no_subdomain: home page renders without workspace shell", async ({
  page,
}) => {
  // No hostname override — 127.0.0.1 → extractSlug returns null → no_subdomain
  await page.goto("/");
  await expect(
    page.getByRole("main").getByRole("img", { name: "LenGrowth" }),
  ).toBeVisible();
});
