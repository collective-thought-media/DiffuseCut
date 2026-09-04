import { test, expect } from "@playwright/test";
import { createProject } from "./helpers";

test.describe("Smoke", () => {
  test("projects home loads", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Project name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create project" })).toBeVisible();
  });

  test("create project opens dashboard", async ({ page }) => {
    const { name } = await createProject(page, `E2E Smoke ${Date.now()}`);

    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByText("Logline and plot autosave as you type.")).toBeVisible();
  });

  test("project nav tabs route correctly", async ({ page }) => {
    const { projectId, name } = await createProject(
      page,
      `E2E Nav ${Date.now()}`
    );

    await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

    await page.getByRole("link", { name: "Characters" }).click();
    await expect(page).toHaveURL(`/projects/${projectId}/characters`);
    await expect(page.getByRole("heading", { name: "Characters", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "Export" }).click();
    await expect(page).toHaveURL(`/projects/${projectId}/export`);
    await expect(page.getByRole("heading", { name: "Export", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: name }).click();
    await expect(page).toHaveURL(`/projects/${projectId}`);
  });

  test("export page shows encoder panel", async ({ page }) => {
    const { projectId } = await createProject(page, `E2E Export ${Date.now()}`);

    await page.goto(`/projects/${projectId}/export`);

    await expect(page.getByRole("heading", { name: "Export", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Export queue" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export final video" })
    ).toBeVisible();
  });

  test("setup page loads dependency checklist", async ({ page }) => {
    await page.goto("/setup");

    await expect(page.getByRole("heading", { name: "Setup", level: 1 })).toBeVisible();
    await expect(page.getByText("System Status")).toBeVisible();
    await expect(page.getByRole("button", { name: "Re-check" })).toBeVisible();
  });
});
