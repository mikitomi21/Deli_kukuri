import { expect, test } from "@playwright/test"

// docs/05 + backend rule: a deactivated ward skips scheduling, so it cannot
// receive new routines (POST .../routines → 409). The UI must block the
// action up front instead of letting the user hit the 409 (user report).
test("deactivated ward: add-routine is blocked with an explanation", async ({
  page,
}) => {
  const wardName = `Dezaktywna ${Date.now()}`

  // Create a ward with one routine through the real UI flow
  await page.goto("http://localhost:5173/")
  await expect(page.getByTestId("user-menu")).toBeVisible()
  await page
    .getByRole("button", { name: "Dodaj podopiecznego" })
    .first()
    .click()
  await page.getByPlaceholder("np. Halina Kowalska").fill(wardName)
  await page.getByPlaceholder("np. 600 100 200").fill("600 555 444")
  await page.getByRole("button", { name: "Dodaj", exact: true }).click()
  await expect(page.getByRole("link", { name: wardName })).toBeVisible()
  await page.getByRole("link", { name: wardName }).click()

  await page.getByRole("button", { name: "Dodaj rutynę" }).click()
  await page.locator("#routine-name").fill("Rutyna przed dezaktywacją")
  await page.locator("#routine-time").fill("08:00")
  await page.getByRole("button", { name: "Dalej" }).click()
  await page.getByPlaceholder(/Szukaj leku/).fill("war")
  await page.getByRole("button", { name: /War/i }).first().click()
  await page.getByPlaceholder(/Ilość/).fill("1 tabletka")
  await page.getByRole("button", { name: "Dalej" }).click()
  await page.getByRole("button", { name: "Dodaj rutynę" }).last().click()
  await expect(
    page.getByText("Rutyna przed dezaktywacją").first(),
  ).toBeVisible()

  // Deactivate the ward
  await page.getByRole("button", { name: "Dezaktywuj" }).click()
  await page.getByRole("button", { name: "Dezaktywuj" }).last().click()
  await page.waitForTimeout(1500)

  // Deactivation returns to the dashboard; reopen the ward detail
  await expect(page.getByRole("link", { name: wardName })).toBeVisible()
  await page.getByRole("link", { name: wardName }).click()

  // The add-routine button is gone and the UI explains why (no dead-end 409)
  await expect(page.getByRole("button", { name: "Dodaj rutynę" })).toHaveCount(
    0,
  )
  await expect(
    page.getByText(
      "Podopieczny jest dezaktywowany — dodawanie nowych rutyn jest wyłączone.",
    ),
  ).toBeVisible()
})
