import { test } from "@playwright/test"

test("debug wizard", async ({ page }) => {
  page.on("console", (m) => {
    if (m.type() === "error")
      console.log("CONSOLE-ERR:", m.text().slice(0, 200))
  })
  await page.goto(
    "http://localhost:5173/wards/11111111-1111-1111-1111-111111111111",
  )
  await page.getByText("Nadchodzące połączenia").waitFor()
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
})
