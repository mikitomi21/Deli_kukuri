/**
 * In-memory demo "backend" for the docs/05-api-spec.md endpoints.
 * VITE_USE_MOCKS=mocks explicitly enables demo data. Wards, medications,
 * routines, calls and statistics use the generated API client by default.
 *
 * Data lives for the browser session (no persistence). All mutations are
 * immutable so TanStack Query always sees a fresh reference.
 */

import { createUuid } from "@/lib/uuid"
import type {
  Call,
  CallOutcome,
  CallTask,
  Routine,
  RoutineItem,
  RoutineWithOutcome,
  WardStats,
  WardWithToday,
} from "@/types/dashboard"

const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms))
const uid = createUuid

function atTime(timeOfDay: string, dayOffset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  const [h, m] = timeOfDay.split(":").map(Number)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

function daysAgo(days: number, hour = 9): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

interface RoutineMedication {
  id: string
  name: string
  dosage: string
  form?: string | null
  instructions?: string | null
  generic_name?: string | null
  fda_raw?: string | null
  ai_summary?: string | null
}

/** Fallback catalog for the medication picker when the backend is unreachable. */
export const mockMedications: RoutineMedication[] = [
  {
    id: "med-1",
    name: "Warfarin",
    dosage: "5 mg",
    form: "tabletki powlekane",
    instructions: "o stałej porze wieczorem, regularne kontrole INR",
    generic_name: "Warfarin",
    fda_raw: JSON.stringify(
      {
        source: "U.S. Food and Drug Administration (openFDA)",
        generic_name: "WARFARIN SODIUM",
        indications_and_usage: [
          "WARFARIN SODIUM is indicated for the prophylaxis and treatment of venous thrombosis and its extension, pulmonary embolism.",
        ],
        dosage_and_administration: [
          "The dosage and administration of WARFARIN SODIUM must be individualized for each patient according to the particular patient's PT/INR response.",
        ],
        warnings: [
          "WARFARIN SODIUM can cause major or fatal bleeding. Perform regular monitoring of INR in all treated patients.",
        ],
        food_safety_warning: [
          "Advise patients to maintain a consistent dietary intake of vitamin K. Avoid sudden dietary changes including large amounts of green leafy vegetables.",
        ],
      },
      null,
      2,
    ),
    ai_summary: JSON.stringify(
      {
        what_it_is:
          "Antagonista witaminy K, lek przeciwzakrzepowy zapobiegający powstawaniu groźnych skrzeplin krwi.",
        how_to_take:
          "Doustnie o stałej porze, popijając wodą. Niezwykle ważna jest stała dieta bez gwałtownych zmian w spożyciu witaminy K.",
        when_to_take: "Raz dziennie wieczorem (np. o godz. 18:00–20:00).",
        warnings:
          "Unikać nagłych zmian w diecie (np. dużych ilości szpinaku, kapusty czy jarmużu). Bezwzględnie kontrolować wskaźnik INR.",
      },
      null,
      2,
    ),
  },
  {
    id: "med-2",
    name: "Metformina",
    dosage: "850 mg",
    form: "tabletki powlekane",
    instructions: "po posiłku, wieczorem",
    generic_name: "Metformin",
    fda_raw: JSON.stringify(
      {
        source: "U.S. Food and Drug Administration (openFDA)",
        generic_name: "METFORMIN HYDROCHLORIDE",
        indications_and_usage: [
          "METFORMIN HYDROCHLORIDE tablets are indicated as an adjunct to diet and exercise to improve glycemic control in adults with type 2 diabetes mellitus.",
        ],
        dosage_and_administration: [
          "Administer in divided doses with meals. Dosage increases should be made in increments of 500 mg weekly or 850 mg every 2 weeks.",
        ],
        warnings: [
          "Lactic acidosis is a rare, but serious, complication that can occur due to metformin accumulation.",
        ],
        food_safety_warning: [
          "Take with meals to reduce gastrointestinal discomfort.",
        ],
      },
      null,
      2,
    ),
    ai_summary: JSON.stringify(
      {
        what_it_is:
          "Podstawowy lek przeciwcukrzycowy obniżający stężenie glukozy we krwi i zwiększający wrażliwość komórek na insulinę.",
        how_to_take:
          "Zawsze w trakcie lub bezpośrednio po posiłku, popić szklanką wody (zmniejsza to ryzyko dolegliwości żołądkowych).",
        when_to_take:
          "Podczas głównych posiłków (zwykle śniadanie i/lub kolacja).",
        warnings:
          "Całkowity zakaz spożywania alkoholu. Przy planowanych badaniach rentgenowskich z kontrastem poinformować lekarza.",
      },
      null,
      2,
    ),
  },
  {
    id: "med-3",
    name: "Bisoprolol",
    dosage: "2,5 mg",
    form: "tabletki powlekane",
    instructions: "rano, podczas śniadania, nie rozgryzać",
    generic_name: "Bisoprolol",
    fda_raw: JSON.stringify(
      {
        source: "U.S. Food and Drug Administration (openFDA)",
        generic_name: "BISOPROLOL FUMARATE",
        indications_and_usage: [
          "Bisoprolol fumarate is indicated in the management of hypertension.",
        ],
        dosage_and_administration: [
          "The initial dose of bisoprolol fumarate is 5 mg once daily. In some patients, 2.5 mg may be an appropriate starting dose.",
        ],
        warnings: [
          "Do not abruptly discontinue therapy. Severe exacerbation of angina and myocardial infarction have been reported following abrupt cessation.",
        ],
      },
      null,
      2,
    ),
    ai_summary: JSON.stringify(
      {
        what_it_is:
          "Lek z grupy beta-blokerów zwalniający rytm serca i obniżający ciśnienie tętnicze.",
        how_to_take:
          "Rano podczas śniadania, popijając wodą. Połykać w całości, bez rozgryzania.",
        when_to_take: "Codziennie rano o stałej porze.",
        warnings:
          "Nigdy nie przerywać zażywania leku nagle — grozi to gwałtownym skokiem ciśnienia i zaburzeniami rytmu serca.",
      },
      null,
      2,
    ),
  },
  {
    id: "med-4",
    name: "Atorwastatyna",
    dosage: "20 mg",
    form: "tabletki powlekane",
    instructions: "wieczorem, z posiłkiem lub bez",
    generic_name: "Atorvastatin",
    fda_raw: JSON.stringify(
      {
        source: "U.S. Food and Drug Administration (openFDA)",
        generic_name: "ATORVASTATIN CALCIUM",
        indications_and_usage: [
          "Lipid-lowering agent indicated to reduce the risk of myocardial infarction and stroke in patients with cardiovascular risk factors.",
        ],
        dosage_and_administration: [
          "Recommended starting dose is 10 or 20 mg once daily. Can be administered as a single dose at any time of the day, with or without food.",
        ],
        warnings: [
          "Myopathy and rhabdomyolysis have been reported with statin therapy. Instruct patients to report unexplained muscle pain or weakness.",
        ],
        food_safety_warning: [
          "Avoid excessive consumption of grapefruit juice while taking atorvastatin.",
        ],
      },
      null,
      2,
    ),
    ai_summary: JSON.stringify(
      {
        what_it_is:
          "Statyna obniżająca poziom „złego” cholesterolu (LDL) i trójglicerydów oraz chroniąca naczynia krwionośne przed miażdżycą.",
        how_to_take:
          "Doustnie, połykać w całości, popijając wodą. Posiłek nie wpływa na działanie.",
        when_to_take: "Raz na dobę, najlepiej wieczorem przed snem.",
        warnings:
          "Nie pić soku grejpfrutowego. W razie wystąpienia niewyjaśnionych bólów mięśniowych niezwłocznie zgłosić się do lekarza.",
      },
      null,
      2,
    ),
  },
  {
    id: "med-5",
    name: "Ramipryl",
    dosage: "5 mg",
    form: "tabletki",
    instructions: "rano, przed lub po posiłku",
    generic_name: "Ramipril",
    fda_raw: JSON.stringify(
      {
        source: "U.S. Food and Drug Administration (openFDA)",
        generic_name: "RAMIPRIL",
        indications_and_usage: [
          "Treatment of hypertension and reduction in risk of myocardial infarction, stroke, or death from cardiovascular causes.",
        ],
        dosage_and_administration: [
          "Initial dose for hypertension is 2.5 mg to 5 mg once daily. May be taken with or without food.",
        ],
        warnings: [
          "Discontinue as soon as possible if angioedema occurs. Monitor renal function and serum potassium.",
        ],
      },
      null,
      2,
    ),
    ai_summary: JSON.stringify(
      {
        what_it_is:
          "Lek hipotensyjny z grupy inhibitorów ACE, obniżający ciśnienie i chroniący mięsień sercowy oraz nerki.",
        how_to_take: "Doustnie, popić szklanką wody, niezależnie od posiłków.",
        when_to_take: "Codziennie rano o stałej porze.",
        warnings:
          "Może wywoływać suchy kaszel. Przy nagłym wstawaniu z łóżka może wystąpić przejściowy zawrót głowy.",
      },
      null,
      2,
    ),
  },
  {
    id: "med-6",
    name: "Hydrochlorotiazyd",
    dosage: "12,5 mg",
    form: "tabletki",
    instructions: "rano, popić wodą",
    generic_name: "Hydrochlorothiazide",
    fda_raw: JSON.stringify(
      {
        source: "U.S. Food and Drug Administration (openFDA)",
        generic_name: "HYDROCHLOROTHIAZIDE",
        indications_and_usage: [
          "Thiazide diuretic indicated for the treatment of hypertension alone or in combination with other antihypertensive agents.",
        ],
        dosage_and_administration: [
          "Usual dose is 12.5 mg to 50 mg once daily, preferably in the morning.",
        ],
        warnings: [
          "Electrolyte imbalances (hypokalemia, hyponatremia) may occur. Periodic determination of serum electrolytes should be done.",
        ],
      },
      null,
      2,
    ),
    ai_summary: JSON.stringify(
      {
        what_it_is:
          "Lek moczopędny (diuretyk tiazydowy) obniżający ciśnienie tętnicze i usuwający nadmiar soli oraz wody z organizmu.",
        how_to_take: "Rano, podczas śniadania lub po nim, popić wodą.",
        when_to_take:
          "Bezwzględnie rano — nie brać wieczorem, by uniknąć wybudzania w nocy na oddawanie moczu.",
        warnings:
          "Zwiększa wydalanie potasu z moczem. Pić odpowiednią ilość płynów w ciągu dnia, by zapobiec odwodnieniu.",
      },
      null,
      2,
    ),
  },
  {
    id: "med-7",
    name: "Witamina D3",
    dosage: "2000 IU",
    form: "kapsułki",
    instructions: "raz dziennie podczas posiłku zawierającego tłuszcz",
    generic_name: "Cholecalciferol",
    fda_raw: JSON.stringify(
      {
        source: "U.S. Food and Drug Administration (openFDA)",
        generic_name: "CHOLECALCIFEROL",
        indications_and_usage: [
          "Indicated for dietary supplementation and treatment/prevention of Vitamin D deficiency, supporting bone mineral density and calcium absorption.",
        ],
        dosage_and_administration: [
          "Take orally once daily with a meal containing dietary fat for optimal absorption.",
        ],
        warnings: [
          "Do not exceed recommended daily allowance. Hypercalcemia may occur with excessive intake.",
        ],
        food_safety_warning: [
          "Fat-soluble vitamin: absorption is significantly enhanced when taken with meals containing dietary fats (e.g., butter, olive oil, milk).",
        ],
      },
      null,
      2,
    ),
    ai_summary: JSON.stringify(
      {
        what_it_is:
          "Witamina D3 regulująca gospodarkę wapniowo-fosforanową, wzmacniająca kości, siłę mięśni i odporność seniora.",
        how_to_take:
          "Przyjmować w trakcie posiłku zawierającego tłuszcze (masło, oliwa, ser), popić szklanką wody.",
        when_to_take: "Raz dziennie o stałej porze, rano lub podczas obiadu.",
        warnings:
          "Nie łączyć z innymi preparatami wielowitaminowymi zawierającymi wysokie dawki witaminy D bez kontroli stężenia we krwi.",
      },
      null,
      2,
    ),
  },
]

interface MockWard {
  ward: WardWithToday
  routines: Routine[]
  callTasks: CallTask[]
  calls: Call[]
}

function makeCall(
  wardId: string,
  routine: { name: string; time_of_day: string },
  outcome: CallOutcome,
  startedAt: string,
  attemptNo = 1,
  routineId?: string,
): Call {
  const question = `Dzień dobry. Czy przyjął(a) Pan(i) dziś o ${routine.time_of_day} lek: ${routine.name}? Proszę odpowiedzieć: tak lub nie.`
  const parsed =
    outcome === "took" ? "yes" : outcome === "not_taken" ? "no" : "unclear"
  const answer =
    outcome === "took"
      ? "Tak, przyjęłam"
      : outcome === "not_taken"
        ? "Nie, jeszcze nie"
        : "Co? Nie wiem"
  return {
    id: uid(),
    ward_id: wardId,
    call_task_id: null,
    routine_id: routineId ?? null,
    routine,
    status: "completed",
    started_at: startedAt,
    duration_sec: outcome === "no_answer" ? 0 : 34,
    attempt_no: attemptNo,
    result: {
      outcome,
      confidence: outcome === "unclear" ? 0.42 : 0.91,
      transcript_full: `System: ${question}\nPodopieczny: ${answer}`,
    },
    turns:
      outcome === "no_answer"
        ? []
        : [
            {
              turn_no: 1,
              question,
              speech_result: answer,
              confidence: outcome === "unclear" ? 0.42 : 0.91,
              parsed,
            },
          ],
  }
}

function seed(): MockWard[] {
  const halina: MockWard = {
    ward: {
      id: "11111111-1111-1111-1111-111111111111",
      full_name: "Halina Kowalska",
      phone_e164: "+48600100200",
      tz: "Europe/Warsaw",
      active: true,
    },
    routines: [
      {
        id: "r-1",
        ward_id: "11111111-1111-1111-1111-111111111111",
        name: "Poranne leki",
        time_of_day: "09:00",
        status: "approved",
        depends_on: [],
        items: [
          {
            medication_id: "med-1",
            medication_name: "Warfarin",
            dosage: "5 mg",
            amount_label: "1",
          },
        ],
      },
      {
        id: "r-2",
        ward_id: "11111111-1111-1111-1111-111111111111",
        name: "Leki na ciśnienie",
        time_of_day: "13:00",
        status: "approved",
        depends_on: [],
        items: [
          {
            medication_id: "med-3",
            medication_name: "Bisoprolol",
            dosage: "2,5 mg",
            amount_label: "0,5",
          },
        ],
      },
      {
        id: "r-3",
        ward_id: "11111111-1111-1111-1111-111111111111",
        name: "Wieczorne leki",
        time_of_day: "19:00",
        status: "approved",
        depends_on: ["r-1"],
        items: [
          {
            medication_id: "med-1",
            medication_name: "Warfarin",
            dosage: "5 mg",
            amount_label: "1",
          },
          {
            medication_id: "med-2",
            medication_name: "Metformina",
            dosage: "850 mg",
            amount_label: "1",
          },
        ],
      },
    ],
    callTasks: [
      {
        id: "t-1",
        ward_id: "11111111-1111-1111-1111-111111111111",
        routine_id: "r-3",
        routine_name: "Wieczorne leki",
        scheduled_at: atTime("19:00"),
        status: "pending",
        attempt_no: 1,
      },
    ],
    calls: [
      makeCall(
        "11111111-1111-1111-1111-111111111111",
        { name: "Poranne leki", time_of_day: "09:00" },
        "took",
        atTime("09:00"),
        1,
        "r-1",
      ),
      makeCall(
        "11111111-1111-1111-1111-111111111111",
        { name: "Leki na ciśnienie", time_of_day: "13:00" },
        "not_taken",
        atTime("13:00"),
        1,
        "r-2",
      ),
      makeCall(
        "11111111-1111-1111-1111-111111111111",
        { name: "Poranne leki", time_of_day: "09:00" },
        "took",
        daysAgo(1, 9),
        1,
        "r-1",
      ),
      makeCall(
        "11111111-1111-1111-1111-111111111111",
        { name: "Leki na ciśnienie", time_of_day: "13:00" },
        "took",
        daysAgo(1, 13),
        1,
        "r-2",
      ),
      makeCall(
        "11111111-1111-1111-1111-111111111111",
        { name: "Poranne leki", time_of_day: "09:00" },
        "no_answer",
        daysAgo(2, 9),
        1,
        "r-1",
      ),
    ],
  }

  const jan: MockWard = {
    ward: {
      id: "22222222-2222-2222-2222-222222222222",
      full_name: "Jan Nowak",
      phone_e164: "+48600200300",
      tz: "Europe/Warsaw",
      active: true,
    },
    routines: [
      {
        id: "r-4",
        ward_id: "22222222-2222-2222-2222-222222222222",
        name: "Poranne leki",
        time_of_day: "08:00",
        status: "approved",
        depends_on: [],
        items: [
          {
            medication_id: "med-2",
            medication_name: "Metformina",
            dosage: "850 mg",
            amount_label: "1",
          },
        ],
      },
      {
        id: "r-5",
        ward_id: "22222222-2222-2222-2222-222222222222",
        name: "Szkic — dawka południowa",
        time_of_day: "12:30",
        status: "draft",
        depends_on: [],
        items: [
          {
            medication_id: "med-4",
            medication_name: "Atorwastatyna",
            dosage: "20 mg",
            amount_label: "1",
          },
        ],
      },
    ],
    callTasks: [],
    calls: [
      makeCall(
        "22222222-2222-2222-2222-222222222222",
        { name: "Poranne leki", time_of_day: "08:00" },
        "took",
        atTime("08:00"),
        1,
        "r-4",
      ),
      makeCall(
        "22222222-2222-2222-2222-222222222222",
        { name: "Poranne leki", time_of_day: "08:00" },
        "unclear",
        daysAgo(1, 8),
        1,
        "r-4",
      ),
    ],
  }

  const zofia: MockWard = {
    ward: {
      id: "33333333-3333-3333-3333-333333333333",
      full_name: "Zofia Wiśniewska",
      phone_e164: "+48600300400",
      tz: "Europe/Warsaw",
      active: true,
    },
    routines: [
      {
        id: "r-6",
        ward_id: "33333333-3333-3333-3333-333333333333",
        name: "Krople do oka",
        time_of_day: "10:00",
        status: "approved",
        depends_on: [],
        items: [
          {
            medication_id: "med-6",
            medication_name: "Hydrochlorotiazyd",
            dosage: "12,5 mg",
            amount_label: "1",
          },
        ],
      },
    ],
    callTasks: [
      {
        id: "t-2",
        ward_id: "33333333-3333-3333-3333-333333333333",
        routine_id: "r-6",
        routine_name: "Krople do oka",
        scheduled_at: atTime("10:00"),
        status: "pending",
        attempt_no: 2,
      },
    ],
    calls: [
      makeCall(
        "33333333-3333-3333-3333-333333333333",
        { name: "Krople do oka", time_of_day: "10:00" },
        "no_answer",
        atTime("10:00"),
        2,
        "r-6",
      ),
    ],
  }

  return [halina, jan, zofia]
}

let db: MockWard[] = seed()

function todayOutcome(
  mock: MockWard,
  routine: Routine,
): CallOutcome | "pending" {
  const today = new Date().toDateString()
  const call = mock.calls.find(
    (c) =>
      c.routine_id === routine.id &&
      new Date(c.started_at).toDateString() === today,
  )
  if (call?.result) {
    return call.result.outcome
  }
  return "pending"
}

function withOutcomes(mock: MockWard): WardWithToday {
  const routines = mock.routines.map((r) => ({
    ...r,
    today_status: todayOutcome(mock, r),
  }))
  const today = new Date().toDateString()
  const todayCalls = mock.calls.filter(
    (c) => new Date(c.started_at).toDateString() === today,
  )
  const took = todayCalls.filter((c) => c.result?.outcome === "took").length
  const weekCalls = mock.calls.filter(
    (c) =>
      c.result &&
      Date.now() - new Date(c.started_at).getTime() < 7 * 24 * 3600 * 1000,
  )
  const weekTook = weekCalls.filter((c) => c.result?.outcome === "took").length
  return {
    ...mock.ward,
    routines,
    today: {
      took,
      total: Math.max(
        todayCalls.length,
        routines.filter((r) => r.status === "approved").length,
      ),
    },
    week_pct: weekCalls.length
      ? Math.round((weekTook / weekCalls.length) * 100)
      : 0,
  }
}

// --- Wards (mock fallback; the real backend ships these since T05) ---

export async function listWards(): Promise<WardWithToday[]> {
  await delay()
  return db.map(withOutcomes)
}

export async function getWard(id: string): Promise<WardWithToday> {
  await delay()
  const mock = db.find((w) => w.ward.id === id)
  if (!mock) throw new Error("Nie znaleziono podopiecznego")
  return withOutcomes(mock)
}

export interface CreateWardPayload {
  full_name: string
  phone_e164: string
  tz: string
}

export async function createWard(
  payload: CreateWardPayload,
): Promise<WardWithToday> {
  await delay()
  const mock: MockWard = {
    ward: { id: uid(), active: true, ...payload },
    routines: [],
    callTasks: [],
    calls: [],
  }
  db = [...db, mock]
  return withOutcomes(mock)
}

export interface UpdateWardPayload {
  full_name?: string
  phone_e164?: string
  tz?: string
}

export async function updateWard(
  id: string,
  payload: UpdateWardPayload,
): Promise<WardWithToday> {
  await delay()
  const mock = db.find((w) => w.ward.id === id)
  if (!mock) throw new Error("Nie znaleziono podopiecznego")
  mock.ward = { ...mock.ward, ...payload }
  return withOutcomes(mock)
}

/** Hard delete: the ward and its mock history are removed. */
export async function deleteWard(id: string): Promise<void> {
  await delay()
  const mock = db.find((w) => w.ward.id === id)
  if (!mock) throw new Error("Nie znaleziono podopiecznego")
  db = db.filter((w) => w.ward.id !== id)
}

// --- Routines (docs/05: POST/GET/PATCH/DELETE /routines, approve, pause) ---

export async function listRoutines(wardId: string): Promise<Routine[]> {
  await delay()
  return structuredClone(db.find((w) => w.ward.id === wardId)?.routines ?? [])
}

/** Routines enriched with today's outcome — what the ward detail tab renders. */
export async function listRoutinesWithOutcomes(
  wardId: string,
): Promise<RoutineWithOutcome[]> {
  await delay()
  const mock = db.find((w) => w.ward.id === wardId)
  if (!mock) return []
  return structuredClone(
    mock.routines.map((r) => ({ ...r, today_status: todayOutcome(mock, r) })),
  )
}

export interface RoutinePayload {
  name: string
  time_of_day: string
  items: RoutineItem[]
  depends_on?: string[]
}

/** Mirrors the RoutineItemCreate validation on the backend (models.py). */
function validateRoutinePayload(payload: RoutinePayload): void {
  if (
    payload.items.some(
      (item) => !/^\d+(?:[.,]\d+)?$/.test(item.amount_label.trim()),
    )
  ) {
    throw new Error("Ilość musi być liczbą, np. 1 albo 0,5")
  }
}

export async function createRoutine(
  wardId: string,
  payload: RoutinePayload,
): Promise<Routine> {
  await delay()
  validateRoutinePayload(payload)
  const mock = db.find((w) => w.ward.id === wardId)
  if (!mock) throw new Error("Nie znaleziono podopiecznego")
  const routine: Routine = {
    id: uid(),
    ward_id: wardId,
    name: payload.name,
    time_of_day: payload.time_of_day,
    status: "draft",
    items: payload.items,
    depends_on: payload.depends_on ?? [],
  }
  mock.routines = [...mock.routines, routine]
  return structuredClone(routine)
}

export async function updateRoutine(
  routineId: string,
  payload: RoutinePayload,
): Promise<Routine> {
  await delay()
  validateRoutinePayload(payload)
  const mock = db.find((w) => w.routines.some((r) => r.id === routineId))
  const routine = mock?.routines.find((r) => r.id === routineId)
  if (!mock || !routine) throw new Error("Nie znaleziono rutyny")
  const updated: Routine = {
    ...routine,
    ...payload,
    depends_on: payload.depends_on ?? routine.depends_on,
    // docs/04 C4: editing an approved routine puts it back to draft
    status: "draft",
  }
  mock.routines = mock.routines.map((r) => (r.id === routineId ? updated : r))
  return structuredClone(updated)
}

export async function deleteRoutine(routineId: string): Promise<void> {
  await delay()
  const mock = db.find((w) => w.routines.some((r) => r.id === routineId))
  const routine = mock?.routines.find((r) => r.id === routineId)
  if (!mock || !routine) throw new Error("Nie znaleziono rutyny")
  // Any status can be deleted (parity with the backend); scheduled tasks
  // are derived from approved routines, so they vanish with it
  mock.routines = mock.routines.filter((r) => r.id !== routineId)
  mock.callTasks = mock.callTasks.filter((t) => t.routine_id !== routineId)
}

export async function approveRoutine(routineId: string): Promise<Routine> {
  await delay()
  const mock = db.find((w) => w.routines.some((r) => r.id === routineId))
  const routine = mock?.routines.find((r) => r.id === routineId)
  if (!mock || !routine) throw new Error("Nie znaleziono rutyny")
  if (routine.items.length === 0) {
    // docs/05: 409 when approving a routine without items
    throw new Error("Nie można zatwierdzić rutyny bez leków")
  }
  const missing = routine.depends_on.filter((depId) => {
    const dep = mock.routines.find((r) => r.id === depId)
    return dep?.status !== "approved"
  })
  if (missing.length > 0) {
    throw new Error("Wymagana rutyna nie jest zatwierdzona")
  }
  const updated: Routine = { ...routine, status: "approved" }
  mock.routines = mock.routines.map((r) => (r.id === routineId ? updated : r))
  // docs/04 D1: the materializer schedules the nearest matching time
  mock.callTasks = [
    ...mock.callTasks.filter((t) => t.routine_id !== routineId),
    {
      id: uid(),
      ward_id: mock.ward.id,
      routine_id: routineId,
      routine_name: routine.name,
      scheduled_at: atTime(routine.time_of_day),
      status: "pending",
      attempt_no: 1,
    },
  ]
  return structuredClone(updated)
}

export async function pauseRoutine(
  routineId: string,
  paused: boolean,
): Promise<Routine> {
  await delay()
  const mock = db.find((w) => w.routines.some((r) => r.id === routineId))
  const routine = mock?.routines.find((r) => r.id === routineId)
  if (!mock || !routine) throw new Error("Nie znaleziono rutyny")
  const updated: Routine = {
    ...routine,
    status: paused ? "paused" : "approved",
  }
  mock.routines = mock.routines.map((r) => (r.id === routineId ? updated : r))
  return structuredClone(updated)
}

// --- Call tasks & calls (docs/05) ---

export async function listCallTasks(wardId: string): Promise<CallTask[]> {
  await delay()
  return structuredClone(db.find((w) => w.ward.id === wardId)?.callTasks ?? [])
}

export async function listCalls(wardId: string): Promise<Call[]> {
  await delay()
  return structuredClone(
    (db.find((w) => w.ward.id === wardId)?.calls ?? []).sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    ),
  )
}

export async function getCall(callId: string): Promise<Call> {
  await delay()
  const call = db.flatMap((w) => w.calls).find((c) => c.id === callId)
  if (!call) throw new Error("Nie znaleziono połączenia")
  return structuredClone(call)
}

const TEST_CALL_OUTCOMES: CallOutcome[] = ["took", "not_taken", "unclear"]

/** docs/05: POST /wards/{ward_id}/test-call — immediate call for the nearest approved routine. */
export async function testCall(wardId: string): Promise<Call> {
  await delay(800)
  const mock = db.find((w) => w.ward.id === wardId)
  if (!mock) throw new Error("Nie znaleziono podopiecznego")
  const routine = mock.routines.find((r) => r.status === "approved")
  if (!routine) {
    throw new Error("Podopieczny nie ma zatwierdzonej rutyny")
  }
  const call = makeCall(
    wardId,
    { name: routine.name, time_of_day: routine.time_of_day },
    TEST_CALL_OUTCOMES[mock.calls.length % TEST_CALL_OUTCOMES.length],
    new Date().toISOString(),
    1,
    routine.id,
  )
  mock.calls = [call, ...mock.calls]
  return structuredClone(call)
}

// --- Stats (docs/05: GET /wards/{ward_id}/stats) ---

export async function getWardStats(wardId: string): Promise<WardStats> {
  await delay()
  const ward = await getWard(wardId)
  return {
    today: ward.today ?? { took: 0, total: 0 },
    week_pct: ward.week_pct ?? 0,
  }
}
