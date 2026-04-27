import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/about",
  "/become-subcontractor",
  "/become-client",
  "/contact",
  "/login"
];

test.describe("smoke", () => {
  for (const route of publicRoutes) {
    test(`loads ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("dashboard demo role switcher works", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Demo Mode")).toBeVisible();
    await page.getByLabel("Test role").selectOption("admin");
    await expect(page.getByRole("button", { name: "Admin" })).toBeVisible();
    await page.getByRole("button", { name: "Admin" }).click();
    await expect(page.getByText("Profit dashboard")).toBeVisible();
  });
});
