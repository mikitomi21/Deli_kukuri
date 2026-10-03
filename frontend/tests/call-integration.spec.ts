import { expect, test } from "@playwright/test"

const api = `${process.env.CALL_TEST_API_URL}/api/v1`

test("the merged medication editor saves through the real API in Polish", async ({
  page,
  request,
}) => {
  const login = await request.post(`${api}/login/access-token`, {
    form: {
      username: process.env.FIRST_SUPERUSER!,
      password: process.env.FIRST_SUPERUSER_PASSWORD!,
    },
  })
  const headers = {
    Authorization: `Bearer ${(await login.json()).access_token}`,
  }
  const catalog = await request.get(`${api}/medications/`, { headers })
  const medication = (await catalog.json()).data[0]
  try {
    await page.goto("/admin")
    await page
      .getByPlaceholder("Szukaj leków po nazwie, dawce lub postaci…")
      .fill(medication.name)
    const row = page
      .getByRole("row")
      .filter({ hasText: medication.name })
      .first()
    await row.getByRole("button", { name: "Otwórz menu działań leku" }).click()
    await page.getByRole("menuitem", { name: "Edytuj lek" }).click()
    await page
      .getByPlaceholder("np. po posiłku")
      .fill("Integration instructions")
    await page.getByRole("button", { name: "Zapisz", exact: true }).click()
    await expect(
      page.getByText("Lek został zaktualizowany", { exact: true }),
    ).toBeVisible()
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get(`${api}/medications/${medication.id}`, {
                headers,
              })
            ).json()
          ).instructions,
      )
      .toBe("Integration instructions")
  } finally {
    await request.patch(`${api}/medications/${medication.id}`, {
      headers,
      data: { instructions: medication.instructions },
    })
  }
})

test.beforeEach(async ({ page, request }) => {
  page.on("pageerror", (error) => console.error(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text())
  })
  const login = await request.post(`${api}/login/access-token`, {
    form: {
      username: process.env.FIRST_SUPERUSER!,
      password: process.env.FIRST_SUPERUSER_PASSWORD!,
    },
  })
  expect(login.ok()).toBeTruthy()
  const token = (await login.json()).access_token
  await page.addInitScript((accessToken) => {
    localStorage.setItem("access_token", accessToken)
  }, token)
  // Proxy the real UI's API requests to the isolated backend, preserving the full HTTP contract.
  await page.route("**/api/v1/**", async (route) => {
    const original = new URL(route.request().url())
    const response = await route.fetch({
      url: `${process.env.CALL_TEST_API_URL}${original.pathname}${original.search}`,
    })
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "access-control-allow-origin": process.env.PLAYWRIGHT_BASE_URL!,
        "access-control-allow-credentials": "true",
      },
    })
  })
})

for (const mode of ["manual", "scheduled"] as const) {
  test(`${mode} call reaches the gateway through Celery and displays its result`, async ({
    page,
    request,
  }) => {
    const login = await request.post(`${api}/login/access-token`, {
      form: {
        username: process.env.FIRST_SUPERUSER!,
        password: process.env.FIRST_SUPERUSER_PASSWORD!,
      },
    })
    const headers = {
      Authorization: `Bearer ${(await login.json()).access_token}`,
    }
    const wardResponse = await request.post(`${api}/wards/`, {
      headers,
      data: {
        full_name: `Integration ${mode}`,
        phone_e164: "+48600100200",
        tz: "UTC",
      },
    })
    expect(wardResponse.ok()).toBeTruthy()
    const ward = await wardResponse.json()
    const catalog = await request.get(`${api}/medications/`, { headers })
    const medication = (await catalog.json()).data[0]
    const at = new Date(Date.now() + (mode === "scheduled" ? 12000 : 3600000))
    const routineResponse = await request.post(
      `${api}/wards/${ward.id}/routines`,
      {
        headers,
        data: {
          name: `Routine ${mode}`,
          time_of_day: at.toISOString().slice(11, 19),
          items: [{ medication_id: medication.id, amount_label: "1 tablet" }],
        },
      },
    )
    expect(routineResponse.ok()).toBeTruthy()
    const routine = await routineResponse.json()
    expect(
      (
        await request.post(`${api}/routines/${routine.id}/approve`, { headers })
      ).ok(),
    ).toBeTruthy()
    try {
      await page.goto(`/wards/${ward.id}`)
      await expect(
        page.getByRole("heading", { name: ward.full_name }),
      ).toBeVisible()
      if (mode === "manual") {
        const queued = page.waitForResponse(
          (response) =>
            response.url().includes("/test-call") && response.status() === 201,
        )
        await page
          .getByRole("button", { name: "Zadzwoń teraz", exact: true })
          .click()
        await queued
      }
      await expect
        .poll(
          async () => {
            const history = await request.get(`${api}/wards/${ward.id}/calls`, {
              headers,
            })
            const calls = (await history.json()).data
            return calls.some(
              (call: { status: string; result?: { outcome: string } }) =>
                call.status === "completed" && call.result?.outcome === "took",
            )
          },
          { timeout: 30000 },
        )
        .toBe(true)
      await page.reload()
      await expect(
        page.getByText(`Routine ${mode}`, { exact: true }).first(),
      ).toBeVisible()
      await expect(
        page.getByText("Przyjęte", { exact: true }).first(),
      ).toBeVisible()
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark"),
      )
      await page.screenshot({
        path: `test-results/${mode}-light.png`,
        fullPage: true,
        animations: "disabled",
      })
      await page.evaluate(() => document.documentElement.classList.add("dark"))
      await page.screenshot({
        path: `test-results/${mode}-dark.png`,
        fullPage: true,
        animations: "disabled",
      })
      await page.getByRole("tab", { name: "Połączenia", exact: true }).click()
      await expect(
        page.getByText("Rozmowa zakończona", { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByText("Wynik dotyczący leków", { exact: true }),
      ).toBeVisible()
      await page
        .getByRole("link")
        .filter({ hasText: "Zobacz rozmowę" })
        .first()
        .click()
      await expect(
        page.getByText("Podsumowanie rozmowy", { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByText("Test conversation: medication taken", { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByText("Pełny transkrypt", { exact: true }),
      ).toBeVisible()
      await expect(page.locator("pre")).toContainText("USER: Tak, przyjąłem.")
      await page.screenshot({
        path: `test-results/${mode}-detail-dark.png`,
        fullPage: true,
        animations: "disabled",
      })
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark"),
      )
      await page.screenshot({
        path: `test-results/${mode}-detail-light.png`,
        fullPage: true,
        animations: "disabled",
      })
      await page.reload()
      await expect(
        page.getByText("Podsumowanie rozmowy", { exact: true }),
      ).toBeVisible()
      await page.getByRole("link", { name: "Wróć do podopiecznego" }).click()
      await expect(
        page.getByRole("heading", { name: ward.full_name }),
      ).toBeVisible()
      const deactivated = await request.delete(`${api}/wards/${ward.id}`, {
        headers,
      })
      expect(deactivated.ok()).toBeTruthy()
      await page.reload()
      await expect(
        page.getByRole("button", { name: "Dodaj rutynę" }),
      ).toHaveCount(0)
      await expect(
        page.getByText(
          "Podopieczny jest dezaktywowany — dodawanie nowych rutyn jest wyłączone.",
        ),
      ).toBeVisible()
    } finally {
      await request.post(`${api}/routines/${routine.id}/pause`, { headers })
      await request.delete(`${api}/wards/${ward.id}`, { headers })
    }
  })
}
