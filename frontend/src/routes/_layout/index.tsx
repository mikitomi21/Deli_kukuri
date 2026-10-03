import { useQueries, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Phone,
  Pill,
  Plus,
  Users,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { PageHeader } from "@/components/Common/PageHeader"
import { StatCard } from "@/components/Common/StatCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AddWardDialog } from "@/components/Wards/AddWardDialog"
import { fetchCallTasks } from "@/hooks/useCalls"
import { fetchRoutines } from "@/hooks/useRoutines"
import { fetchWards, getWardsMode } from "@/hooks/useWards"
import i18n from "@/i18n"
import type {
  CallTask,
  RoutineWithOutcome,
  WardWithToday,
} from "@/types/dashboard"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: i18n.getFixedT(null, "admin")("dashboard.metaTitle"),
      },
    ],
  }),
})

function formatDashboardDateTime(iso: string): string {
  return new Date(iso).toLocaleString(i18n.language, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function TodaySummary({
  took,
  total,
  scheduled,
  needsAttention,
}: {
  took: number
  total: number
  scheduled: boolean
  needsAttention: boolean
}) {
  const { t } = useTranslation("admin")
  if (total === 0) return null
  if (needsAttention) {
    return (
      <Badge variant="destructive">
        {t("dashboard.summaryNeedsAttention")} · {took}/{total}
      </Badge>
    )
  }
  if (took === total) {
    return (
      <Badge variant="default">
        {t("dashboard.summaryAllGood")} · {took}/{total}
      </Badge>
    )
  }
  if (scheduled) {
    // Real calls have not reported yet — neutral info, not an alarm
    return (
      <Badge variant="outline">
        {t("dashboard.scheduledBadge", { total })}
      </Badge>
    )
  }
  // Pending without failures: stay silent instead of crying wolf
  return null
}

// A routine needs attention only when a call actually went wrong (not
// taken / unclear / no answer). Planned-but-not-yet-called does not count.
function routineNeedsAttention(r: RoutineWithOutcome): boolean {
  return (
    r.status === "approved" &&
    r.today_status !== undefined &&
    r.today_status !== "took" &&
    r.today_status !== "pending"
  )
}

function Dashboard() {
  const { t } = useTranslation("admin")
  const {
    isPending,
    error,
    data: wards,
  } = useQuery({
    queryKey: ["wards"],
    queryFn: fetchWards,
  })
  const mocksMode = getWardsMode() !== "api"

  // Routines come per ward from their own query in every mode — the API ward
  // payload does not embed them; mocks keep them for backwards compatibility.
  const routinesQueries = useQueries({
    queries: (wards ?? []).map((ward) => ({
      queryKey: ["routines", ward.id],
      queryFn: () => fetchRoutines(ward.id),
    })),
  })
  // The schedule (call-tasks) drives the "next call" summary line; derived
  // from approved routines, so it refreshes whenever routines change.
  const callTasksQueries = useQueries({
    queries: (wards ?? []).map((ward) => ({
      queryKey: ["call-tasks", ward.id],
      queryFn: () => fetchCallTasks(ward.id),
    })),
  })
  const routinesByWard = new Map<string, RoutineWithOutcome[] | undefined>(
    (wards ?? []).map((ward, index) => [ward.id, routinesQueries[index]?.data]),
  )
  const nextCallByWard = new Map<string, CallTask | undefined>(
    (wards ?? []).map((ward, index) => [
      ward.id,
      callTasksQueries[index]?.data?.[0],
    ]),
  )
  const routinesPendingSet = new Set(
    (wards ?? [])
      .filter((_, index) => routinesQueries[index]?.isPending)
      .map((ward) => ward.id),
  )

  const effectiveToday = (
    ward: WardWithToday,
    routines: RoutineWithOutcome[] | undefined,
  ): { took: number; total: number } | undefined => {
    if (ward.today) return ward.today
    if (!routines) return undefined
    const approved = routines.filter((r) => r.status === "approved")
    return {
      took: approved.filter((r) => r.today_status === "took").length,
      total: approved.length,
    }
  }

  const wardsWithToday = (wards ?? []).map((ward) => ({
    ward,
    routines: routinesByWard.get(ward.id),
    today: effectiveToday(ward, routinesByWard.get(ward.id)),
  }))

  const totalToday = wardsWithToday.reduce(
    (acc, { today }) => ({
      took: acc.took + (today?.took ?? 0),
      total: acc.total + (today?.total ?? 0),
    }),
    { took: 0, total: 0 },
  )
  // "Needs attention" = a call actually went wrong today (not taken / unclear
  // / no answer). Planned-but-not-yet-called does not count — otherwise every
  // ward with approved routines would be flagged before the first call.
  const wardsNeedingAttention = wardsWithToday.filter(({ routines }) =>
    (routines ?? []).some(routineNeedsAttention),
  ).length

  if (isPending) {
    return (
      <div
        className="grid gap-4 md:grid-cols-2"
        role="status"
        aria-busy="true"
        aria-label={t("dashboard.loadingWards")}
      >
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.loadFailedTitle")}</CardTitle>
          <CardDescription role="alert">{error.message}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!wards || wards.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div>
            <p className="text-lg font-semibold">{t("dashboard.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.emptyDescription")}
            </p>
          </div>
          <AddWardDialog>
            <Button size="lg">
              <Plus aria-hidden />
              {t("dashboard.addWard")}
            </Button>
          </AddWardDialog>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("dashboard.todayTitle")}
        description={t("dashboard.todaySubtitle")}
        actions={
          <>
            {mocksMode && (
              <Badge variant="outline" className="text-muted-foreground">
                {t("dashboard.demoDataBadge")}
              </Badge>
            )}
            <AddWardDialog>
              <Button variant="outline">
                <Plus aria-hidden />
                {t("dashboard.addWard")}
              </Button>
            </AddWardDialog>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label={t("dashboard.statWards")}
          value={wards.length}
        />
        <StatCard
          icon={CircleCheck}
          tone="success"
          label={t("dashboard.statTakenToday")}
          value={totalToday.took}
        />
        <StatCard
          icon={Pill}
          tone="muted"
          label={t("dashboard.statRemainingToday")}
          value={Math.max(totalToday.total - totalToday.took, 0)}
        />
        <StatCard
          icon={CircleAlert}
          tone={wardsNeedingAttention > 0 ? "destructive" : "muted"}
          label={t("dashboard.statNeedsAttention")}
          value={wardsNeedingAttention}
        />
      </div>

      <ul className="grid gap-4 md:grid-cols-2">
        {wardsWithToday.map(({ ward, routines, today }) => {
          const isRoutinesPending = routinesPendingSet.has(ward.id)
          const routineList = routines ?? []
          const nextCall = nextCallByWard.get(ward.id)
          const approved = routineList.filter(
            (r) => r.status === "approved",
          ).length
          const drafts = routineList.filter((r) => r.status === "draft").length
          return (
            <li key={ward.id}>
              {/* The name link stretches over the whole card (after:inset-0),
                  so the entire tile is clickable and shares one hover state. */}
              <Card className="relative flex h-full flex-col gap-3 transition-colors hover:border-ring">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle>
                        <Link
                          to="/wards/$wardId"
                          params={{ wardId: ward.id }}
                          className="hover:underline after:absolute after:inset-0"
                        >
                          {ward.full_name}
                        </Link>
                      </CardTitle>
                      <CardDescription className="mt-3 flex items-center gap-1.5">
                        <Phone aria-hidden className="size-3" />
                        {ward.phone_e164}
                      </CardDescription>
                    </div>
                    {today && (
                      <TodaySummary
                        took={today.took}
                        total={today.total}
                        scheduled={!ward.today}
                        needsAttention={routineList.some(routineNeedsAttention)}
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  {isRoutinesPending ? (
                    <div className="grid gap-2" role="status" aria-busy="true">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-3/4" />
                    </div>
                  ) : routineList.length === 0 ? (
                    // Guide to the ward page — routine management lives there
                    <div className="relative z-10 flex flex-col gap-2 text-sm text-muted-foreground">
                      <p>{t("dashboard.noRoutinesYet")}</p>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="w-fit"
                      >
                        <Link
                          to="/wards/$wardId"
                          params={{ wardId: ward.id }}
                          search={{ addRoutine: true }}
                        >
                          <Plus aria-hidden />
                          {t("dashboard.addFirstRoutine")}
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    // Overview, not management: the ward page owns the full
                    // routine list — here only the next call and counts
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <CalendarClock aria-hidden className="size-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">
                            {nextCall
                              ? t("dashboard.nextCallLabel")
                              : t("dashboard.noUpcoming")}
                          </p>
                          {nextCall && (
                            <p className="truncate text-sm font-medium">
                              {t("dashboard.nextCall", {
                                name: nextCall.routine_name,
                                time: formatDashboardDateTime(
                                  nextCall.scheduled_at,
                                ),
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-normal">
                          {t("dashboard.approvedCount", { approved })}
                        </Badge>
                        {drafts > 0 && (
                          <Badge variant="outline" className="font-normal">
                            {t("dashboard.draftsCount", { drafts })}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
