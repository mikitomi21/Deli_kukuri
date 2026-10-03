/**
 * E2E: login, user menu (logout) and medication search.
 * Requires a backend on :8000 and vite dev on :5173
 * (auth.setup.ts config: logged in as admin@example.com / changethis).
 * Run: bun --bun x playwright test tests/e2e-auth-meds.spec.ts
 */
import { expect, test } from "@playwright/test"

import { firstSuperuser, firstSuperuserPassword } from "./config"

const EMAIL = firstSuperuser
const PASSWORD = firstSuperuserPassword

test("login, user menu and logout", async ({ page }) => {
  // Fresh session — drop the auth.setup storageState to test the full login flow
  await page.context().clearCookies()
  await page.goto("http://localhost:5173/login")
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await page.getByLabel("E-mail").fill(EMAIL)
  await page.getByLabel("Hasło").fill(PASSWORD)
  await page.getByRole("button", { name: "Zaloguj się" }).click()

  // After login we land on the dashboard (user menu = rendered for any
  // logged-in user, regardless of mode/data)
  await expect(page.getByTestId("user-menu")).toBeVisible()

  // User menu in the sidebar footer (avatar → log out)
  await page.getByTestId("user-menu").click()
  await expect(page.getByText("Wyloguj się")).toBeVisible()
  await page.getByText("Wyloguj się").click()

  // After logout we are back on the login screen
  await expect(page).toHaveURL(/\/login/)
})

test("medication search in the routine dialog (auth.setup session)", async ({
  page,
}) => {
  await page.goto("http://localhost:5173/")
  // The medication search test creates no wards first: assert the shell is
  // ready (user menu), not the ward list which is empty in API mode.
  await expect(page.getByTestId("user-menu")).toBeVisible()

  // Add a ward — form with E.164 phone normalization. The name is unique
  // per run: in API mode created wards persist in the database.
  const wardName = `Testowa Osoba ${Date.now()}`
  await page
    .getByRole("button", { name: "Dodaj podopiecznego" })
    .first()
    .click()
  await expect(
    page.getByRole("heading", { name: "Dodaj podopiecznego" }),
  ).toBeVisible()
  await page.getByPlaceholder("np. Halina Kowalska").fill(wardName)
  await page.getByPlaceholder("np. 600 100 200").fill("600 100 200")
  await page.getByRole("button", { name: "Dodaj", exact: true }).click()
  await expect(page.getByText("Podopieczny został dodany")).toBeVisible()

  // Ward card links to the detail view
  await page.getByRole("link", { name: wardName }).click()
  await expect(page.getByRole("heading", { name: wardName })).toBeVisible()

  // Add a routine → search the medication catalog. /War/ matches both the
  // mock catalog ("Warfarin") and the real seeded catalog ("Warfin").
  await page.getByRole("button", { name: "Dodaj rutynę" }).click()
  await page.waitForTimeout(800)
  console.log("NAME VALUE:", await page.locator("#routine-name").inputValue())
  console.log(
    "PLACEHOLDER:",
    await page.locator("#routine-name").getAttribute("placeholder"),
  )
  console.log("DIALOG COUNT:", await page.locator("[role=dialog]").count())
  await page.locator("#routine-name").fill("Test rutyna")
  await page.waitForTimeout(200)
  console.log(
    "NAME AFTER FILL:",
    await page.locator("#routine-name").inputValue(),
  )
  await page.locator("#routine-time").fill("09:00")
  await page.getByRole("button", { name: "Dalej" }).click()
  await page.getByPlaceholder("Szukaj leku w katalogu, np. warf…").fill("warf")
  await expect(page.getByRole("button", { name: /War/i }).first()).toBeVisible()
  await page.getByRole("button", { name: /War/i }).first().click()
  await page.getByPlaceholder("Ilość, np. 1 tabletka").fill("1 tabletka")
  await page.getByRole("button", { name: "Dalej" }).click()
  await page.getByRole("button", { name: "Dodaj rutynę" }).last().click()
  await expect(page.getByText("Rutyna dodana jako szkic")).toBeVisible()
  await expect(page.getByText("Test rutyna")).toBeVisible()
})
