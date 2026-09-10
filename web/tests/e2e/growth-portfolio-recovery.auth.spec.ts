import { expect, test } from "@playwright/test";

const GROWTH_API = "https://growth-api.lenquant.com/api";

test("portfolio reports partial metrics and retries only failed workspaces", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const pubkey = "ab".repeat(32);
    (
      window as Window & {
        __LENOS_WORKSPACE_SLUG__?: string;
        nostr?: {
          getPublicKey(): Promise<string>;
          signEvent(
            event: Record<string, unknown>,
          ): Promise<Record<string, unknown>>;
        };
      }
    ).__LENOS_WORKSPACE_SLUG__ = "test-workspace";
    (
      window as Window & {
        nostr?: {
          getPublicKey(): Promise<string>;
          signEvent(
            event: Record<string, unknown>,
          ): Promise<Record<string, unknown>>;
        };
      }
    ).nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(event) {
        return { ...event, id: "cd".repeat(32), pubkey, sig: "ef".repeat(64) };
      },
    };
    localStorage.setItem("lengrowth-company-id:test-workspace", "company-a");
  });

  await page.route("wss://relay.test/**", (route) => route.abort());

  let failedMetricsAttempts = 0;
  let healthyMetricsAttempts = 0;
  await page.route(`${GROWTH_API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/workspace/test-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "test-workspace",
          relay_community_id: "community-test-id",
          relay_url: "wss://relay.test",
        }),
      });
      return;
    }
    if (url.pathname === "/api/growth/readiness/summary") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          operationalHealth: {
            dependencies: {
              growthFlags: { growthOs: true, growthPortfolio: true },
            },
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/agency/workspaces") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { _id: "agency-a", name: "Agency A" },
          { _id: "agency-b", name: "Agency B" },
        ]),
      });
      return;
    }
    if (url.pathname === "/api/agency/workspaces/agency-a/clients") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            _id: "client-a",
            client_company_name: "Client A",
            status: "active",
            scopes: ["workspace:view"],
          },
        ]),
      });
      return;
    }
    if (url.pathname === "/api/agency/workspaces/agency-b/clients") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            _id: "client-b",
            client_company_name: "Client B",
            status: "active",
            scopes: ["metrics:view"],
          },
        ]),
      });
      return;
    }
    if (url.pathname === "/api/agency/workspaces/agency-a/metrics") {
      healthyMetricsAttempts += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workspace_id: "agency-a",
          linked_client_count: 2,
          active_client_count: 1,
          pending_client_count: 1,
        }),
      });
      return;
    }
    if (url.pathname === "/api/agency/workspaces/agency-b/metrics") {
      failedMetricsAttempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "metrics unavailable" }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/home");
  await page.getByRole("button", { name: "Portfolio" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Metrics for 1 portfolio workspace are unavailable",
  );
  await expect(page.getByText("Portfolio total (partial)")).toBeVisible();
  await expect(page.getByText("Retry failed metrics")).toBeVisible();

  await page.getByRole("button", { name: "Retry failed metrics" }).click();
  await expect.poll(() => failedMetricsAttempts).toBe(2);
  expect(healthyMetricsAttempts).toBe(1);
  await page.getByRole("tab", { name: "Agency B" }).click();
  await expect(page.getByText("Client B")).toBeVisible();
  await expect(page.getByText("Client A")).toHaveCount(0);
});

test("OAuth callback query reopens Integrations and exposes the failure notice", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const pubkey = "ab".repeat(32);
    const windowWithIdentity = window as Window & {
      __LENOS_WORKSPACE_SLUG__?: string;
      nostr?: {
        getPublicKey(): Promise<string>;
        signEvent(
          event: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      };
    };
    windowWithIdentity.__LENOS_WORKSPACE_SLUG__ = "test-workspace";
    windowWithIdentity.nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(event) {
        return { ...event, id: "cd".repeat(32), pubkey, sig: "ef".repeat(64) };
      },
    };
    localStorage.setItem("lengrowth-company-id:test-workspace", "company-a");
  });

  await page.route("wss://relay.test/**", (route) => route.abort());
  await page.route("http://relay.test/**", (route) => route.abort());
  await page.route(`${GROWTH_API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/workspace/test-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "test-workspace",
          relay_community_id: "community-test-id",
          relay_url: "wss://relay.test",
        }),
      });
      return;
    }
    if (url.pathname === "/api/workspace/integrations/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            platform: "github",
            connected: true,
            connected_at: "2026-08-28T00:00:00Z",
            scopes: ["repo"],
            last_sync_at: "2026-08-28T00:00:00Z",
            token_expiry: "2026-08-30T00:00:00Z",
            scope_status: "reduced",
            sync_status: "completed",
            last_error: null,
            supported_metrics: ["issues", "pull_requests"],
          },
          { platform: "notion", connected: false },
          { platform: "linear", connected: false },
          { platform: "slack", connected: false },
        ]),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/home?tab=integrations&error=github_oauth_failed");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "github connection was not completed" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  await expect(page.getByText("issues, pull_requests")).toBeVisible();
  await expect(page.getByText("Token expired")).toBeVisible();
  await expect(page.getByText("Access reduced")).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
});

test("team shows pending ownership and specialist availability", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const pubkey = "ab".repeat(32);
    const windowWithIdentity = window as Window & {
      __LENOS_WORKSPACE_SLUG__?: string;
      nostr?: {
        getPublicKey(): Promise<string>;
        signEvent(
          event: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      };
    };
    windowWithIdentity.__LENOS_WORKSPACE_SLUG__ = "test-workspace";
    windowWithIdentity.nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(event) {
        return { ...event, id: "cd".repeat(32), pubkey, sig: "ef".repeat(64) };
      },
    };
    localStorage.setItem("lengrowth-company-id:test-workspace", "company-a");
  });
  await page.route("wss://relay.test/**", (route) => route.abort());
  await page.route(`${GROWTH_API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/workspace/test-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "test-workspace",
          relay_community_id: "community-test-id",
          relay_url: "wss://relay.test",
        }),
      });
      return;
    }
    if (url.pathname === "/api/growth/readiness/summary") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          operationalHealth: {
            dependencies: {
              growthFlags: { growthOs: true, growthPortfolio: false },
            },
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-a/members") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              _id: "owner-1",
              name: "Founder",
              role: "owner",
              status: "active",
            },
            {
              _id: "invite-1",
              email: "teammate@example.com",
              role: "contributor",
              status: "pending",
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-a/specialist-pipeline") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          buckets: [{ label: "Awaiting assignment", count: 1 }],
        }),
      });
      return;
    }
    if (url.pathname === "/api/growth/specialists") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            _id: "specialist-1",
            displayName: "Ava",
            canReceiveWork: true,
            activeAssignedTaskCount: 1,
          },
        ]),
      });
      return;
    }
    await route.abort();
  });
  await page.goto("/home?tab=team");
  const profileSkip = page.getByRole("button", { name: "Skip" }).first();
  if (await profileSkip.isVisible().catch(() => false)) {
    await profileSkip.click();
  }
  await page.getByRole("button", { name: "Team" }).click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(
    page.getByText("1 pending invitation awaiting acceptance."),
  ).toBeVisible();
  await expect(page.getByText("Founder")).toBeVisible();
  await expect(page.getByText("Ava", { exact: true })).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
});

test("onboarding persists a reviewed brief, runs assessment, and emits milestones", async ({
  page,
}) => {
  const telemetryEvents: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    const pubkey = "ab".repeat(32);
    const windowWithIdentity = window as Window & {
      __LENOS_WORKSPACE_SLUG__?: string;
      nostr?: {
        getPublicKey(): Promise<string>;
        signEvent(
          event: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      };
    };
    windowWithIdentity.__LENOS_WORKSPACE_SLUG__ = "onboarding-workspace";
    windowWithIdentity.nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(event) {
        return { ...event, id: "cd".repeat(32), pubkey, sig: "ef".repeat(64) };
      },
    };
  });

  await page.route("wss://relay.onboarding.test/**", (route) => route.abort());
  await page.route(`${GROWTH_API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/workspace/onboarding-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "onboarding-workspace",
          relay_community_id: "community-onboarding",
          relay_url: "wss://relay.onboarding.test",
        }),
      });
      return;
    }
    if (url.pathname === "/api/telemetry/events") {
      telemetryEvents.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "recorded" }),
      });
      return;
    }
    if (url.pathname === "/api/companies/extract") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "Acme",
          business_idea: "A focused product",
          description: "A focused product for a clear audience.",
          industry: "software",
          target_audience: "Small teams",
          market: "B2B",
          confidence: 0.9,
          firstTaskPreview: [
            {
              title: "Interview five high-fit teams",
              why: "Your brief identifies small teams but needs direct demand evidence.",
              quickWin: true,
            },
          ],
        }),
      });
      return;
    }
    if (
      url.pathname === "/api/companies" &&
      route.request().method() === "POST"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "created",
          company_id: "company-onboarding",
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-onboarding/assess") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          assessmentStatus: "completed",
          generatedTasks: [
            {
              _id: "task-first",
              title: "Interview five high-fit teams",
              evidenceSummary:
                "Your reviewed brief identifies small teams and a lead-generation goal, but no direct demand evidence yet.",
            },
          ],
        }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/channels");
  await page.getByRole("button", { name: "Skip" }).first().click();
  await expect(page.getByText("Growth intake · 1 of 6")).toBeVisible();

  const answers = [
    "We build software",
    "Small teams",
    "We have a website",
    "Get more leads",
    "Already operating",
    "A small team and limited budget",
  ];
  for (let index = 0; index < answers.length - 1; index += 1) {
    await page.getByRole("textbox").fill(answers[index]);
    await page.getByRole("button", { name: "Next" }).click();
  }
  await page.getByRole("textbox").fill(answers.at(-1) ?? "");
  await page.getByRole("button", { name: "Review Growth Brief" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your Growth Brief" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use this brief" }).click();
  await expect(
    page.getByRole("button", { name: "Run initial assessment" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run initial assessment" }).click();
  await expect(page.getByText("Your first recommended move")).toBeVisible();
  await expect(page.getByText("Interview five high-fit teams")).toBeVisible();
  await expect(
    page.getByText(/Evidence:.*reviewed brief identifies small teams/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to your LenGrowth workspace" }),
  ).toBeVisible();

  await expect
    .poll(() => telemetryEvents.map((event) => event.eventType))
    .toEqual(
      expect.arrayContaining([
        "growth_onboarding_started",
        "growth_onboarding_step_completed",
        "growth_onboarding_completed",
      ]),
    );
  expect(
    telemetryEvents.every((event) => {
      const metadata = event.metadata as Record<string, unknown>;
      return metadata?.workspaceSlug === "onboarding-workspace";
    }),
  ).toBe(true);
});

test("onboarding resumes a saved brief and retries a failed assessment", async ({
  page,
}) => {
  let assessmentAttempts = 0;
  await page.addInitScript(() => {
    const pubkey = "ab".repeat(32);
    const windowWithIdentity = window as Window & {
      __LENOS_WORKSPACE_SLUG__?: string;
      nostr?: {
        getPublicKey(): Promise<string>;
        signEvent(
          event: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      };
    };
    windowWithIdentity.__LENOS_WORKSPACE_SLUG__ = "resume-workspace";
    windowWithIdentity.nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(event) {
        return { ...event, id: "cd".repeat(32), pubkey, sig: "ef".repeat(64) };
      },
    };
    localStorage.setItem(
      "lengrowth-company-id:resume-workspace",
      "company-resume",
    );
    localStorage.setItem(
      "lenos-growth-intake:resume-workspace",
      JSON.stringify({
        answers: {
          business: "We build software",
          audience: "Small teams",
          presence: "We have a website",
          goal: "Get more leads",
          stage: "Already operating",
          constraints: "Limited budget",
        },
        step: 5,
        result: {
          name: "Resume Co",
          business_idea: "A focused product",
          description: "A focused product for small teams.",
          industry: "software",
          target_audience: "Small teams",
          market: "B2B",
          confidence: 0.8,
        },
        savedCompanyId: "company-resume",
        assessmentStatus: "failed",
      }),
    );
  });

  await page.route("wss://relay.resume.test/**", (route) => route.abort());
  await page.route(`${GROWTH_API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/workspace/resume-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "resume-workspace",
          relay_community_id: "community-resume",
          relay_url: "wss://relay.resume.test",
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-resume") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          _id: "company-resume",
          name: "Resume Co",
          assessmentStatus: "failed",
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-resume/assess") {
      assessmentAttempts += 1;
      if (assessmentAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Assessment service unavailable" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "completed" }),
        });
      }
      return;
    }
    if (url.pathname === "/api/telemetry/events") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "recorded" }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/channels");
  await page.getByRole("button", { name: "Skip" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Review your Growth Brief" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry assessment" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry assessment" }).click();
  await expect(page.getByText("Assessment service unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Retry assessment" }).click();
  await expect(page.getByText("Assessment complete.")).toBeVisible();
  await page.getByRole("button", { name: "Continue to workspace" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Welcome to your LenGrowth workspace",
    }),
  ).toBeVisible();
  expect(assessmentAttempts).toBe(2);
});

test("work turns a queued recommendation into a completed evidence-backed task", async ({
  page,
}) => {
  let status = "queue";
  let resultSummary = "";
  let resultStatus = "pending";
  let approvalCount = 0;
  let assetCreated = false;
  let currentTitle = "Improve qualified signups";
  let currentDescription = "Review the highest-intent acquisition path.";
  let currentObjective = "Increase qualified signups";
  const task = (id = "task-1", title = "Improve qualified signups") => ({
    _id: id,
    title: id === "task-1" ? currentTitle : title,
    description:
      id === "task-1"
        ? currentDescription
        : "Review the highest-intent acquisition path.",
    objective:
      id === "task-1" ? currentObjective : "Increase qualified signups",
    rationale: "The highest-intent path is the clearest current bottleneck.",
    expectedResult: "A measurable lift in qualified signups.",
    checklist: ["Review funnel", "Ship landing-page change"],
    dependencies: ["Analytics access"],
    blockers: ["Awaiting baseline confirmation"],
    history: [{ action: "Task created from recommendation" }],
    status,
    resultSubmissions: resultSummary
      ? [{ id: "result-1", summary: resultSummary, status: resultStatus }]
      : [],
    generated_asset_id: assetCreated ? "asset-result-1" : undefined,
    referenced_assets: assetCreated ? ["asset-result-1"] : undefined,
  });

  await page.addInitScript(() => {
    const pubkey = "ab".repeat(32);
    const windowWithIdentity = window as Window & {
      __LENOS_WORKSPACE_SLUG__?: string;
      nostr?: {
        getPublicKey(): Promise<string>;
        signEvent(
          event: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      };
    };
    windowWithIdentity.__LENOS_WORKSPACE_SLUG__ = "work-workspace";
    windowWithIdentity.nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(event) {
        return { ...event, id: "cd".repeat(32), pubkey, sig: "ef".repeat(64) };
      },
    };
    localStorage.setItem("lengrowth-company-id:work-workspace", "company-work");
    localStorage.setItem("lenos-growth-intake:work-workspace:reviewed", "1");
  });

  await page.route("wss://relay.work.test/**", (route) => route.abort());
  await page.route(`${GROWTH_API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/workspace/work-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "work-workspace",
          relay_community_id: "community-work",
          relay_url: "wss://relay.work.test",
        }),
      });
      return;
    }
    if (url.pathname === "/api/growth/readiness/summary") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          operationalHealth: {
            dependencies: { growthFlags: { growthOs: true } },
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-work/strategy") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          companyId: "company-work",
          northStar: {
            _id: "objective-work",
            title: "Increase qualified signups",
            targetMetric: "qualified signups",
            status: "active",
          },
          alignmentSummary: {},
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-work/strategy/history") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, limit: 50, skip: 0 }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-work/reporting") {
      const events = resultSummary
        ? [
            {
              id: "task-1-outcome",
              title: "Qualified signup improvement recorded",
              summary: resultSummary,
              occurredAt: "2026-08-30T12:00:00Z",
              taskId: "task-1",
            },
          ]
        : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generatedAt: "2026-08-30T12:00:00Z",
          assessment: { growthScore: 64 },
          executionMomentum: {
            completionPercentage: status === "completed" ? 100 : 25,
          },
          recentOutcomes: {
            summary: { totalCount: events.length },
            events,
          },
          completedWork: resultSummary
            ? [
                {
                  taskId: "task-1",
                  title: currentTitle,
                  resultSummary,
                  resultReviewStatus: resultStatus,
                  assetId: assetCreated ? "asset-result-1" : undefined,
                  assetName: assetCreated
                    ? "Improve qualified signups"
                    : undefined,
                },
              ]
            : [],
          experiments: [
            {
              experimentId: "experiment-report-1",
              title: "Shorten the signup form",
              status: "concluded",
              observedResult: "Qualified signup rate rose from 12% to 18%.",
              decision: "scale",
              learning: "Shorter forms are worth scaling for this audience.",
              learningApprovalStatus: "approved",
            },
          ],
          integrations: {},
          manualMetrics: [],
          priorityHighlights: [],
          warnings: [],
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-work/experiments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
      return;
    }
    if (url.pathname === "/api/growth/tasks") {
      const skip = Number(url.searchParams.get("skip") ?? "0");
      const pageTasks =
        skip > 0
          ? [task("task-26", "Review the next acquisition signal")]
          : [
              task(),
              ...Array.from({ length: 24 }, (_, index) =>
                task(`task-${index + 2}`, `Queued growth task ${index + 2}`),
              ),
            ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: pageTasks,
          total: 26,
          limit: 25,
          skip,
        }),
      });
      return;
    }
    if (
      url.pathname === "/api/tasks/task-1" &&
      route.request().method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data: task() }),
      });
      return;
    }
    if (
      url.pathname === "/api/tasks/task-1" &&
      route.request().method() === "PUT"
    ) {
      const body = JSON.parse(route.request().postData() ?? "{}");
      if (typeof body.status === "string") status = body.status;
      if (typeof body.title === "string") currentTitle = body.title;
      if (typeof body.description === "string")
        currentDescription = body.description;
      if (typeof body.objective === "string") currentObjective = body.objective;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(task()),
      });
      return;
    }
    if (url.pathname === "/api/tasks/task-1/approvals") {
      if (route.request().method() === "POST") {
        approvalCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "approved",
            approval: { outcome: "approved", note: "Ready to ship" },
            task: task(),
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          approvals: approvalCount
            ? [{ outcome: "approved", note: "Ready to ship" }]
            : [],
        }),
      });
      return;
    }
    if (url.pathname === "/api/tasks/task-1/messages") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }
    if (url.pathname === "/api/tasks/task-1/assignments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    if (url.pathname === "/api/tasks/task-1/submit-result") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      resultSummary = String(body.summary ?? "");
      if (body.completeTask) status = "completed";
      expect(body.saveToAssets).toBe(true);
      assetCreated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(task()),
      });
      return;
    }
    if (
      url.pathname === "/api/companies/company-work/assets" &&
      route.request().method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          assets: assetCreated
            ? [
                {
                  _id: "asset-result-1",
                  asset_name: "Improve qualified signups",
                  asset_type: "CUSTOM",
                  status: "draft",
                  content_current:
                    "Qualified signups rose after the landing-page change.",
                  generated_by_task_id: "task-1",
                  source_document_ids: ["source-result-1"],
                },
              ]
            : [],
          storage_quota: { used_bytes: 128, limit_bytes: 1000000 },
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-work/assets/asset-result-1") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          _id: "asset-result-1",
          asset_name: "Improve qualified signups",
          asset_type: "CUSTOM",
          status: "draft",
          review_status: "draft",
          version: 1,
          versions: [
            {
              version: 1,
              change_reason: "Created from task result",
              created_by: "Founder",
            },
          ],
          content_current:
            "Qualified signups rose after the landing-page change.",
          source_document_ids: ["source-result-1"],
          generated_by_task_id: "task-1",
        }),
      });
      return;
    }
    if (
      url.pathname ===
        "/api/companies/company-work/assets/asset-result-1/request-review" ||
      url.pathname ===
        "/api/companies/company-work/assets/asset-result-1/verify"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          review_status: "in_review",
          status: "in_review",
        }),
      });
      return;
    }
    if (
      url.pathname ===
      "/api/companies/company-work/assets/asset-result-1/download"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "text/markdown",
        body: "# Improve qualified signups\n\nSource: source-result-1",
      });
      return;
    }
    if (
      url.pathname === "/api/tasks/task-1/results/result-1/review" &&
      route.request().method() === "PATCH"
    ) {
      resultStatus = "accepted";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "accepted", data: task() }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/home");
  await page.getByRole("button", { name: "Skip" }).first().click();
  await page.getByText("Work", { exact: true }).click();
  await expect(page.getByText("Showing 1–25 of 26")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Showing 26–26 of 26")).toBeVisible();
  await page.getByRole("button", { name: "Previous" }).click();
  await page.getByRole("button", { name: /Improve qualified signups/ }).click();
  await expect(
    page.getByRole("heading", { name: "Improve qualified signups" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The highest-intent path is the clearest current bottleneck.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("A measurable lift in qualified signups."),
  ).toBeVisible();
  await expect(page.getByText("Review funnel")).toBeVisible();
  await expect(page.getByText("Analytics access")).toBeVisible();
  await expect(page.getByText("Awaiting baseline confirmation")).toBeVisible();
  await page.getByText(/Task history \(1\)/).click();
  await expect(
    page.getByText("Task created from recommendation"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Task title").fill("Improve qualified signups faster");
  await page.getByRole("button", { name: "Save edits" }).click();
  await expect(
    page.getByRole("heading", { name: "Improve qualified signups faster" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByLabel("Task result summary")
    .fill("Qualified signups rose after the landing-page change.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Submit and complete" }).click();
  await expect(page.getByText("completed").first()).toBeVisible();
  await expect(
    page.getByText("Qualified signups rose after the landing-page change."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept result" }).click();
  await expect(page.getByText("Status: accepted")).toBeVisible();
  await expect(page.getByText("Generated: asset-result-1")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("1 decision(s) recorded")).toBeVisible();
  await page.getByRole("button", { name: "Growth Home" }).click();
  await expect(page.getByText("Recent wins")).toBeVisible();
  await expect(
    page.getByText("Qualified signup improvement recorded"),
  ).toBeVisible();
  await expect(
    page.getByText("Qualified signups rose after the landing-page change."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Assets" }).click();
  await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
  await expect(
    page.getByText("Improve qualified signups").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open details" }).click();
  await expect(
    page.getByText("Source documents: source-result-1"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Request review" }).click();
  await page.getByRole("button", { name: "Verify asset" }).click();
  await page.getByRole("button", { name: "Export Markdown" }).click();
  await page.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByText("Recent observed outcomes")).toBeVisible();
  await expect(page.getByText("Completed work")).toBeVisible();
  await expect(page.getByText("Experiments and learnings")).toBeVisible();
  await expect(
    page.getByText(/Shorter forms are worth scaling for this audience/),
  ).toBeVisible();
  await expect(
    page
      .getByText(/Qualified signups rose after the landing-page change/)
      .last(),
  ).toBeVisible();
  await expect(
    page.getByText(/Reusable asset: Improve qualified signups/),
  ).toBeVisible();
});

test("growth home explains no objective data and stale reporting sources", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const pubkey = "ab".repeat(32);
    const windowWithIdentity = window as Window & {
      __LENOS_WORKSPACE_SLUG__?: string;
      nostr?: {
        getPublicKey(): Promise<string>;
        signEvent(
          event: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      };
    };
    windowWithIdentity.__LENOS_WORKSPACE_SLUG__ = "phase3-empty-workspace";
    windowWithIdentity.nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(event) {
        return { ...event, id: "cd".repeat(32), pubkey, sig: "ef".repeat(64) };
      },
    };
    localStorage.setItem(
      "lengrowth-company-id:phase3-empty-workspace",
      "company-empty",
    );
    localStorage.setItem(
      "lenos-growth-intake:phase3-empty-workspace:reviewed",
      "1",
    );
  });

  await page.route("wss://relay.phase3.test/**", (route) => route.abort());
  await page.route(`${GROWTH_API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/workspace/phase3-empty-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "phase3-empty-workspace",
          relay_community_id: "community-phase3",
          relay_url: "wss://relay.phase3.test",
        }),
      });
      return;
    }
    if (url.pathname === "/api/growth/readiness/summary") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          objective: null,
          bottleneck: null,
          nextAction: {
            title: "Connect analytics",
            whyThis: "The strongest signal is currently unmeasured.",
            evidenceMissing: "A trusted conversion baseline.",
          },
          evidenceStatus: "No evidence yet",
          operationalHealth: {
            dependencies: { growthFlags: { growthOs: true } },
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-empty/strategy") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          companyId: "company-empty",
          northStar: null,
          alignmentSummary: {},
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-empty/strategy/history") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, limit: 50, skip: 0 }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-empty/reporting") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generatedAt: "2026-08-30T10:00:00Z",
          assessment: {},
          executionMomentum: { completionPercentage: 0 },
          integrations: {
            googleAnalytics: {
              sourceLabel: "Google Analytics",
              freshnessLabel: "Stale",
            },
          },
          recentOutcomes: { summary: { totalCount: 0 }, events: [] },
          manualMetrics: [],
          warnings: [
            {
              title: "Stale analytics",
              summary: "Reconnect the source before using this scorecard.",
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-empty/experiments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
      return;
    }
    if (url.pathname === "/api/growth/tasks") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], total: 0 }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/home");
  await page.getByRole("button", { name: "Skip" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Growth Home" }),
  ).toBeVisible();
  await expect(page.getByText("No objective set yet")).toBeVisible();
  await expect(page.getByText("Connect analytics")).toBeVisible();
  await page.getByText("Why this action?").click();
  await expect(
    page.getByText("The strongest signal is currently unmeasured."),
  ).toBeVisible();
  await expect(page.getByText("A trusted conversion baseline.")).toBeVisible();
  await expect(page.getByText("Google Analytics")).toBeVisible();
  await expect(page.getByText("Stale", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Reconnect the source before using this scorecard."),
  ).toBeVisible();
});

test("experiment preserves hypothesis, evidence, decision, and approved learning", async ({
  page,
}) => {
  let experiment: Record<string, unknown> | null = null;
  await page.addInitScript(() => {
    const pubkey = "ab".repeat(32);
    const browser = window as Window & {
      __LENOS_WORKSPACE_SLUG__?: string;
      nostr?: {
        getPublicKey(): Promise<string>;
        signEvent(
          event: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      };
    };
    browser.__LENOS_WORKSPACE_SLUG__ = "experiment-workspace";
    browser.nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(event) {
        return { ...event, id: "cd".repeat(32), pubkey, sig: "ef".repeat(64) };
      },
    };
    localStorage.setItem(
      "lengrowth-company-id:experiment-workspace",
      "company-experiment",
    );
    localStorage.setItem(
      "lenos-growth-intake:experiment-workspace:reviewed",
      "1",
    );
  });

  await page.route("wss://relay.experiment.test/**", (route) => route.abort());
  await page.route(`${GROWTH_API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/workspace/experiment-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "experiment-workspace",
          relay_community_id: "community-experiment",
          relay_url: "wss://relay.experiment.test",
        }),
      });
      return;
    }
    if (url.pathname === "/api/growth/readiness/summary") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          operationalHealth: {
            dependencies: {
              growthFlags: { growthOs: true, growthExperiments: true },
            },
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-experiment/experiments") {
      if (route.request().method() === "POST") {
        experiment = {
          _id: "experiment-1",
          ...JSON.parse(route.request().postData() ?? "{}"),
          status: "backlog",
          learningApprovalStatus: "pending",
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          route.request().method() === "GET"
            ? {
                items: experiment ? [experiment] : [],
                total: experiment ? 1 : 0,
              }
            : experiment,
        ),
      });
      return;
    }
    if (
      url.pathname ===
        "/api/companies/company-experiment/experiments/experiment-1" &&
      route.request().method() === "PATCH"
    ) {
      experiment = {
        ...(experiment ?? {}),
        ...JSON.parse(route.request().postData() ?? "{}"),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(experiment),
      });
      return;
    }
    if (
      url.pathname ===
      "/api/companies/company-experiment/experiments/experiment-1/approve-learning"
    ) {
      experiment = {
        ...(experiment ?? {}),
        learningApprovalStatus: "approved",
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(experiment),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/home");
  await page.getByRole("button", { name: "Skip" }).first().click();
  await page.getByRole("button", { name: "Experiments" }).click();
  await page.getByLabel("Experiment title").fill("Shorten signup path");
  await page
    .getByLabel("Experiment objective")
    .fill("Increase qualified signups");
  await page.getByLabel("Expected impact").fill("20% more completions");
  await page.getByLabel("Confidence percentage").fill("70");
  await page.getByLabel("Experiment cost").fill("Low");
  await page
    .getByLabel("Experiment hypothesis")
    .fill("Removing one step will increase completed signups.");
  await page.getByLabel("Experiment metric").fill("signup completion rate");
  await page.getByLabel("Linked task IDs").fill("task-1");
  await page.getByRole("button", { name: "Add experiment" }).click();
  await expect(page.getByText("Shorten signup path")).toBeVisible();
  await expect(page.getByText("Linked tasks: task-1")).toBeVisible();
  await expect(page.getByText(/confidence 70%/)).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Record decision" }).click();
  await page
    .getByLabel("Observed result for Shorten signup path")
    .fill("Completion rate increased from 30% to 36%.");
  await page
    .getByLabel("Learning for Shorten signup path")
    .fill("Shorter signup paths reduce abandonment for this audience.");
  await page.getByLabel("Experiment decision").selectOption("scale");
  await page.getByRole("button", { name: "Conclude experiment" }).click();
  await expect(
    page.getByText(
      "Learning: Shorter signup paths reduce abandonment for this audience.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve learning" }).click();
  await expect(page.getByText("Approval: approved")).toBeVisible();
});

test("growth home renders and edits an objective scorecard with history", async ({
  page,
}) => {
  let objective = {
    _id: "objective-1",
    title: "Reach product-market fit",
    description: "Build a repeatable acquisition motion.",
    targetMetric: "qualified leads",
    baselineValue: 12,
    targetValue: 40,
    targetDate: "2027-08-30",
    status: "active",
  };

  await page.addInitScript(() => {
    const pubkey = "ab".repeat(32);
    const windowWithIdentity = window as Window & {
      __LENOS_WORKSPACE_SLUG__?: string;
      nostr?: {
        getPublicKey(): Promise<string>;
        signEvent(
          event: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      };
    };
    windowWithIdentity.__LENOS_WORKSPACE_SLUG__ = "phase3-scorecard-workspace";
    windowWithIdentity.nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(event) {
        return { ...event, id: "cd".repeat(32), pubkey, sig: "ef".repeat(64) };
      },
    };
    localStorage.setItem(
      "lengrowth-company-id:phase3-scorecard-workspace",
      "company-scorecard",
    );
    localStorage.setItem(
      "lenos-growth-intake:phase3-scorecard-workspace:reviewed",
      "1",
    );
  });

  await page.route("wss://relay.scorecard.test/**", (route) => route.abort());
  await page.route(`${GROWTH_API}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/workspace/phase3-scorecard-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "phase3-scorecard-workspace",
          relay_community_id: "community-scorecard",
          relay_url: "wss://relay.scorecard.test",
        }),
      });
      return;
    }
    if (url.pathname === "/api/growth/readiness/summary") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bottleneck: "Acquisition measurement",
          nextAction: "Instrument the acquisition funnel",
          evidenceStatus: "Source-backed",
          operationalHealth: {
            dependencies: { growthFlags: { growthOs: true } },
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-scorecard/strategy") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          companyId: "company-scorecard",
          northStar: objective,
          alignmentSummary: { alignedCount: 1, totalCount: 1 },
        }),
      });
      return;
    }
    if (
      url.pathname === "/api/companies/company-scorecard/strategy/north-star" &&
      route.request().method() === "PUT"
    ) {
      const body = JSON.parse(route.request().postData() ?? "{}");
      objective = { ...objective, ...body };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(objective),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-scorecard/strategy/history") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              action: "strategy.north_star.updated",
              createdAt: "2026-08-30T10:00:00Z",
            },
          ],
          total: 1,
          limit: 50,
          skip: 0,
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-scorecard/reporting") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generatedAt: "2026-08-30T10:00:00Z",
          assessment: { growthScore: 62 },
          executionMomentum: { completionPercentage: 25 },
          integrations: {},
          recentOutcomes: {
            summary: { totalCount: 1 },
            events: [
              {
                id: "outcome-1",
                title: "Qualified lead baseline established",
                summary: "The team recorded its first audited lead baseline.",
                occurredAt: "2026-08-30T10:00:00Z",
              },
            ],
          },
          manualMetrics: [],
          warnings: [],
        }),
      });
      return;
    }
    if (url.pathname === "/api/companies/company-scorecard/experiments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              _id: "experiment-1",
              title: "Shorten the signup path",
              metric: "qualified leads",
              status: "active",
            },
          ],
          total: 1,
        }),
      });
      return;
    }
    if (url.pathname === "/api/growth/tasks") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], total: 0 }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/home");
  await page.getByRole("button", { name: "Skip" }).first().click();
  await expect(page.getByText("Reach product-market fit")).toBeVisible();
  await expect(
    page.getByText("Scorecard: 12 → 40 by 2027-08-30"),
  ).toBeVisible();
  await expect(page.getByText("Objective history")).toBeVisible();
  await expect(page.getByText("Active experiments")).toBeVisible();
  await expect(page.getByText("Shorten the signup path")).toBeVisible();
  await expect(page.getByText("Recent wins")).toBeVisible();
  await expect(
    page.getByText("Qualified lead baseline established"),
  ).toBeVisible();
  await expect(
    page.getByText("Observed outcomes, not assumed causal impact."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit objective" }).click();
  await page
    .getByRole("textbox", { name: "Objective title" })
    .fill("Reach 40 qualified leads");
  await page.getByRole("button", { name: "Save objective" }).click();
  await expect(page.getByText("Reach 40 qualified leads")).toBeVisible();
});
