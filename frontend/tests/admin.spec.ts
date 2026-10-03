import { expect, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"
import { createUser } from "./utils/privateApi"
import { randomEmail, randomPassword } from "./utils/random"
import { logInUser } from "./utils/user"

test("Admin page is accessible and shows correct title", async ({ page }) => {
  await page.goto("/admin")
  await expect(page.getByRole("heading", { name: "Użytkownicy" })).toBeVisible()
  await expect(
    page.getByText("Zarządzaj kontami użytkowników i uprawnieniami"),
  ).toBeVisible()
})

test("Add User button is visible", async ({ page }) => {
  await page.goto("/admin")
  await expect(
    page.getByRole("button", { name: "Dodaj użytkownika" }),
  ).toBeVisible()
})

test.describe("Admin user management", () => {
  test("Create a new user successfully", async ({ page }) => {
    await page.goto("/admin")

    const email = randomEmail()
    const password = randomPassword()
    const fullName = "Test User Admin"

    await page.getByRole("button", { name: "Dodaj użytkownika" }).click()

    await page.getByPlaceholder("E-mail").fill(email)
    await page.getByPlaceholder("Imię i nazwisko").fill(fullName)
    await page.getByPlaceholder("Hasło").first().fill(password)
    await page.getByPlaceholder("Hasło").last().fill(password)

    await page.getByRole("button", { name: "Zapisz" }).click()

    await expect(page.getByText("Użytkownik został utworzony")).toBeVisible()

    await expect(page.getByRole("dialog")).not.toBeVisible()

    const userRow = page.getByRole("row").filter({ hasText: email })
    await expect(userRow).toBeVisible()
  })

  test("Create a superuser", async ({ page }) => {
    await page.goto("/admin")

    const email = randomEmail()
    const password = randomPassword()

    await page.getByRole("button", { name: "Dodaj użytkownika" }).click()

    await page.getByPlaceholder("E-mail").fill(email)
    await page.getByPlaceholder("Hasło").first().fill(password)
    await page.getByPlaceholder("Hasło").last().fill(password)
    await page.getByLabel("Superuser?").check()
    await page.getByLabel("Aktywny?").check()

    await page.getByRole("button", { name: "Zapisz" }).click()

    await expect(page.getByText("Użytkownik został utworzony")).toBeVisible()

    await expect(page.getByRole("dialog")).not.toBeVisible()

    const userRow = page.getByRole("row").filter({ hasText: email })
    await expect(userRow.getByText("Superuser")).toBeVisible()
  })

  test("Edit a user successfully", async ({ page }) => {
    await page.goto("/admin")

    const email = randomEmail()
    const password = randomPassword()
    const originalName = "Original Name"
    const updatedName = "Updated Name"

    await page.getByRole("button", { name: "Dodaj użytkownika" }).click()
    await page.getByPlaceholder("E-mail").fill(email)
    await page.getByPlaceholder("Imię i nazwisko").fill(originalName)
    await page.getByPlaceholder("Hasło").first().fill(password)
    await page.getByPlaceholder("Hasło").last().fill(password)
    await page.getByRole("button", { name: "Zapisz" }).click()

    await expect(page.getByText("Użytkownik został utworzony")).toBeVisible()
    await expect(page.getByRole("dialog")).not.toBeVisible()

    const userRow = page.getByRole("row").filter({ hasText: email })
    await userRow.getByRole("button").click()

    await page.getByRole("menuitem", { name: "Edytuj użytkownika" }).click()

    await page.getByPlaceholder("Imię i nazwisko").fill(updatedName)
    await page.getByRole("button", { name: "Zapisz" }).click()

    await expect(
      page.getByText("Dane użytkownika zostały zaktualizowane"),
    ).toBeVisible()
    await expect(page.getByText(updatedName)).toBeVisible()
  })

  test("Delete a user successfully", async ({ page }) => {
    await page.goto("/admin")

    const email = randomEmail()
    const password = randomPassword()

    await page.getByRole("button", { name: "Dodaj użytkownika" }).click()
    await page.getByPlaceholder("E-mail").fill(email)
    await page.getByPlaceholder("Hasło").first().fill(password)
    await page.getByPlaceholder("Hasło").last().fill(password)
    await page.getByRole("button", { name: "Zapisz" }).click()

    await expect(page.getByText("Użytkownik został utworzony")).toBeVisible()

    await expect(page.getByRole("dialog")).not.toBeVisible()

    const userRow = page.getByRole("row").filter({ hasText: email })
    await userRow.getByRole("button").click()

    await page.getByRole("menuitem", { name: "Usuń użytkownika" }).click()

    await page.getByRole("button", { name: "Usuń" }).click()

    await expect(page.getByText("Użytkownik został usunięty")).toBeVisible()

    await expect(
      page.getByRole("row").filter({ hasText: email }),
    ).not.toBeVisible()
  })

  test("Cancel user creation", async ({ page }) => {
    await page.goto("/admin")

    await page.getByRole("button", { name: "Dodaj użytkownika" }).click()
    await page.getByPlaceholder("E-mail").fill("test@example.com")

    await page.getByRole("button", { name: "Anuluj" }).click()

    await expect(page.getByRole("dialog")).not.toBeVisible()
  })

  test("Email is required and must be valid", async ({ page }) => {
    await page.goto("/admin")

    await page.getByRole("button", { name: "Dodaj użytkownika" }).click()

    await page.getByPlaceholder("E-mail").fill("invalid-email")
    await page.getByPlaceholder("E-mail").blur()

    await expect(page.getByText("Nieprawidłowy adres e-mail")).toBeVisible()
  })

  test("Password must be at least 8 characters", async ({ page }) => {
    await page.goto("/admin")

    await page.getByRole("button", { name: "Dodaj użytkownika" }).click()

    await page.getByPlaceholder("E-mail").fill(randomEmail())
    await page.getByPlaceholder("Hasło").first().fill("short")
    await page.getByPlaceholder("Hasło").last().fill("short")
    await page.getByRole("button", { name: "Zapisz" }).click()

    await expect(
      page.getByText("Hasło musi mieć co najmniej 8 znaków"),
    ).toBeVisible()
  })

  test("Passwords must match", async ({ page }) => {
    await page.goto("/admin")

    await page.getByRole("button", { name: "Dodaj użytkownika" }).click()

    await page.getByPlaceholder("E-mail").fill(randomEmail())
    await page.getByPlaceholder("Hasło").first().fill(randomPassword())
    await page.getByPlaceholder("Hasło").last().fill("different12345")
    await page.getByPlaceholder("Hasło").last().blur()

    await expect(page.getByText("Hasła nie są identyczne")).toBeVisible()
  })
})

test.describe("Admin page access control", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Non-superuser cannot access admin page", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()

    await createUser({ email, password })
    await logInUser(page, email, password)

    await page.goto("/admin")

    await expect(
      page.getByRole("heading", { name: "Użytkownicy" }),
    ).not.toBeVisible()
    await expect(page).not.toHaveURL(/\/admin/)
  })

  test("Superuser can access admin page", async ({ page }) => {
    await logInUser(page, firstSuperuser, firstSuperuserPassword)

    await page.goto("/admin")

    await expect(
      page.getByRole("heading", { name: "Użytkownicy" }),
    ).toBeVisible()
  })
})
