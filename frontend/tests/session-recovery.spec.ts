import { expect, test } from "@playwright/test"

test("an invalidated session clears the token and returns to login", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("session-test-initialized")) {
      localStorage.setItem("access_token", "invalidated-session")
      sessionStorage.setItem("session-test-initialized", "true")
    }
  })
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": process.env.PLAYWRIGHT_BASE_URL!,
        "access-control-allow-credentials": "true",
        "www-authenticate": "Bearer",
      },
      body: JSON.stringify({ detail: "Session user no longer exists" }),
    })
  })
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByTestId("email-input")).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem("access_token")),
  ).toBeNull()
})
