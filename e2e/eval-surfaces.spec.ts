import { test, expect } from "@playwright/test";

const projectId = process.env.EVAL_PROJECT_ID;

test.describe("Eval surface touch", () => {
  test.skip(!projectId, "Set EVAL_PROJECT_ID to run eval surface checks");

  test("global routes: projects, setup, settings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    await page.goto("/setup");
    await expect(page.getByRole("heading", { name: "System Status", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Re-check/i })).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "App Settings", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy diagnostic report/i })).toBeVisible();
  });

  test("project tabs: characters, render, finishing, export", async ({ page }) => {
    const id = projectId!;

    await page.goto(`/projects/${id}`);
    await expect(page.getByLabel(/logline/i)).toBeVisible();

    await page.goto(`/projects/${id}/characters`);
    await expect(page.getByRole("heading", { name: "Characters", level: 1 })).toBeVisible();

    await page.goto(`/projects/${id}/render`);
    await expect(page.getByRole("heading", { name: "Render", level: 1 })).toBeVisible();

    await page.goto(`/projects/${id}/finishing`);
    await expect(page.getByRole("heading", { name: "Finishing", level: 1 })).toBeVisible();
    await page.getByRole("tab", { name: "Text Overlays" }).click();
    await expect(page.getByRole("tab", { name: "Text Overlays" })).toHaveAttribute(
      "data-state",
      "active"
    );
    await page.getByRole("tab", { name: "Musical Score" }).click();
    await expect(page.getByRole("tab", { name: "Musical Score" })).toHaveAttribute(
      "data-state",
      "active"
    );
    await page.getByRole("tab", { name: "Dialog" }).click();
    await expect(page.getByRole("tab", { name: "Dialog" })).toHaveAttribute(
      "data-state",
      "active"
    );

    await page.goto(`/projects/${id}/export`);
    await expect(page.getByRole("heading", { name: "Export", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Export queue" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Export final video|Export again/i })
    ).toBeVisible();
  });
});
