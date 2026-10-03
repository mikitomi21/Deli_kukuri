import { expect, test } from "@playwright/test"

// Debug helper for the routine wizard: creates its own ward first so it runs
// in every mode (mocks and real API — no hardcoded ward ids).
test("debug wizard", async ({ page }) => {
  page.on("console", (m) => {
    if (m.type() === "error")
      console.log("CONSOLE-ERR:", m.text().slice(0, 200))
  })
  await page.goto("http://localhost:5173/")
  await expect(page.getByTestId("user-menu")).toBeVisible()

  await page
    .getByRole("button", { name: "Dodaj podopiecznego" })
    .first()
    .click()
  const wardName = `Wizard Debug ${Date.now()}`
  await page.getByPlaceholder("np. Halina Kowalska").fill(wardName)
  await page.getByPlaceholder("np. 600 100 200").fill("600 999 888")
  await page.getByRole("button", { name: "Dodaj", exact: true }).click()
  // The ward row (not the toast — it can auto-dismiss) proves the add worked
  await expect(page.getByRole("link", { name: wardName })).toBeVisible()
  await page.getByRole("link", { name: wardName }).click()

  await page.getByRole("button", { name: "Dodaj rutynę" }).click()
  await page.waitForTimeout(500)
  const nameBox = page.locator("#routine-name")
  console.log(
    "name visible:",
    await nameBox.isVisible(),
    "value:",
    await nameBox.inputValue(),
  )
  console.log("placeholder:", await nameBox.getAttribute("placeholder"))
  await nameBox.fill("Test rutyna")
  await page.locator("#routine-time").fill("09:00")
  await page.getByRole("button", { name: "Dalej" }).click()
  await page.waitForTimeout(400)
  const search = page.getByPlaceholder(/Szukaj leku/)
  console.log("search visible:", await search.isVisible())
  console.log(
    "step error:",
    await page.locator("[role=alert]").allTextContents(),
  )
  expect(await search.isVisible()).toBe(true)
})
