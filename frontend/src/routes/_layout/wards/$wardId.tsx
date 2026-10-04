import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Clock,
  Pencil,
  Phone,
  PhoneOff,
  Pill,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ListRow } from "@/components/Common/ListRow"
import { PageHeader } from "@/components/Common/PageHeader"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AddRoutineDialog } from "@/components/Wards/AddRoutineDialog"
import { RoutineActionsMenu } from "@/components/Wards/RoutineActionsMenu"
import {
  RoutineStatusBadge,
  TodayOutcomeBadge,
} from "@/components/Wards/RoutineStatusBadge"
import { WardDeleteDialog } from "@/components/Wards/WardDeleteDialog"
import { WardEditDialog } from "@/components/Wards/WardEditDialog"
import { fetchCalls, fetchCallTasks, startTestCall } from "@/hooks/useCalls"
import useCustomToast from "@/hooks/useCustomToast"
import { fetchMedications } from "@/hooks/useMedications"
import { fetchWard } from "@/hooks/useWards"
import i18n from "@/i18n"
import { callStartErrorKey } from "@/lib/apiErrors"

export const Route = createFileRoute("/_layout/wards/$wardId")({
  component: WardRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): { addRoutine?: boolean } => {
    // Deep link from the dashboard: ?addRoutine opens the creation dialog
    return {
      addRoutine: search.addRoutine === true || search.addRoutine === "1",
    }
  },
  head: () => ({
    meta: [
      {
        title: i18n.getFixedT(null, "wards")("wardDetail.pageTitle"),
      },
    ],
  }),
})

function WardRoute() {
  const showingCall = useRouterState({
    select: (state) =>
      state.matches.some(
        (match) => match.routeId === "/_layout/wards/$wardId/calls/$callId",
      ),
  })
  return showingCall ? <Outlet /> : <WardDetail />
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(i18n.language, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function WardDetail() {
  const { wardId } = Route.useParams()
  const { addRoutine } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const queryClient = useQueryClient()
  const { t } = useTranslation("wards")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const {
    isPending,
    error,
    data: ward,
  } = useQuery({
    queryKey: ["ward", wardId],
    queryFn: () => fetchWard(wardId),
    refetchInterval: 5000,
  })

  const testCall = useMutation({
    mutationFn: () => startTestCall(wardId),
    onSuccess: () => {
      showSuccessToast(t("wardDetail.callQueued"))
      queryClient.invalidateQueries({ queryKey: ["ward", wardId] })
      queryClient.invalidateQueries({ queryKey: ["calls", wardId] })
      queryClient.invalidateQueries({ queryKey: ["call-tasks", wardId] })
    },
    onError: (error) => showErrorToast(t(callStartErrorKey(error))),
  })

  if (isPending) {
    return (
      <div
        className="flex flex-col gap-6"
        role="status"
        aria-busy="true"
        aria-label={t("wardDetail.loading")}
      >
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !ward) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("wardDetail.loadErrorTitle")}</CardTitle>
          <CardDescription role="alert">
            {error?.message ?? t("wardDetail.notFound")}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/">
            <ArrowLeft aria-hidden />
            {t("wardDetail.backToList")}
          </Link>
        </Button>
        <PageHeader
          title={ward.full_name}
          description={
            <span className="flex items-center gap-1.5">
              <Phone aria-hidden className="size-3" />
              {ward.phone_e164} · {ward.tz}
            </span>
          }
          actions={
            <>
              <Button
                size="sm"
                onClick={() => testCall.mutate()}
                disabled={testCall.isPending}
                aria-busy={testCall.isPending}
              >
                <PhoneOff aria-hidden className="rotate-135" />
                {t("wardDetail.callNow")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil aria-hidden />
                {t("wardDetail.edit")}
              </Button>
              <Button
                variant="outline-destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 aria-hidden />
                {t("wardDetail.delete")}
              </Button>
            </>
          }
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ward.today && (
            <Badge
              variant={
                ward.today.took === ward.today.total && ward.today.total > 0
                  ? "default"
                  : "destructive"
              }
            >
              {t("wardDetail.todayBadge", {
                took: ward.today.took,
                total: ward.today.total,
              })}
            </Badge>
          )}
          {ward.week_pct !== undefined && (
            <Badge variant="outline">
              {t("wardDetail.weekBadge", { pct: ward.week_pct })}
            </Badge>
          )}
        </div>
      </div>

      <WardTabs
        wardId={wardId}
        addRoutineOpen={Boolean(addRoutine)}
        onAddRoutineOpenChange={(open) =>
          navigate({
            to: "/wards/$wardId",
            params: { wardId },
            search: { addRoutine: open ? true : undefined },
          })
        }
      />

      <WardEditDialog ward={ward} open={editOpen} onOpenChange={setEditOpen} />
      <WardDeleteDialog
        ward={ward}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  )
}

function WardTabs({
  wardId,
  addRoutineOpen,
  onAddRoutineOpenChange,
}: {
  wardId: string
  addRoutineOpen: boolean
  onAddRoutineOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation("wards")
  return (
    <Tabs defaultValue="routines">
      <TabsList>
        <TabsTrigger value="routines">
          {t("wardDetail.tabRoutines")}
        </TabsTrigger>
        <TabsTrigger value="medications">
          {t("wardDetail.tabMedications")}
        </TabsTrigger>
        <TabsTrigger value="calls">{t("wardDetail.tabCalls")}</TabsTrigger>
      </TabsList>
      <TabsContent value="routines" className="mt-4">
        <RoutinesSection
          wardId={wardId}
          addRoutineOpen={addRoutineOpen}
          onAddRoutineOpenChange={onAddRoutineOpenChange}
        />
      </TabsContent>
      <TabsContent value="medications" className="mt-4">
        <WardMedicationsSection wardId={wardId} />
      </TabsContent>
      <TabsContent value="calls" className="mt-4">
        <CallsSection wardId={wardId} />
      </TabsContent>
    </Tabs>
  )
}

function WardMedicationsSection({ wardId }: { wardId: string }) {
  const { t } = useTranslation("wards")
  const { isPending, data: ward } = useQuery({
    queryKey: ["ward", wardId],
    queryFn: () => fetchWard(wardId),
  })
  const { data: catalog = [] } = useQuery({
    queryKey: ["medications", "catalog", ""],
    queryFn: () => fetchMedications(),
  })

  if (isPending || !ward) {
    return (
      <div
        className="grid gap-2"
        role="status"
        aria-busy="true"
        aria-label={t("wardDetail.loadingRoutines")}
      >
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  const routines = ward.routines ?? []
  const medMap = new Map<
    string,
    {
      id: string
      name: string
      dosage: string
      routines: Array<{ routineName: string; time: string; amount: string }>
    }
  >()

  for (const routine of routines) {
    for (const item of routine.items ?? []) {
      const key = item.medication_id || `${item.medication_name}-${item.dosage}`
      const existing = medMap.get(key)
      const routineInfo = {
        routineName: routine.name,
        time: routine.time_of_day,
        amount: item.amount_label,
      }
      if (existing) {
        existing.routines.push(routineInfo)
      } else {
        medMap.set(key, {
          id: item.medication_id,
          name: item.medication_name,
          dosage: item.dosage,
          routines: [routineInfo],
        })
      }
    }
  }

  const medications = Array.from(medMap.values())

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Pill aria-hidden className="size-4 text-primary" />
          {t("wardDetail.medicationsTitle")}
        </CardTitle>
        <CardDescription>
          {t("wardDetail.medicationsDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {medications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Pill aria-hidden className="size-5" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("wardDetail.medicationsEmpty")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {medications.map((med) => {
              const catalogItem = catalog.find(
                (c) =>
                  c.id === med.id ||
                  (c.name.toLowerCase() === med.name.toLowerCase() &&
                    c.dosage === med.dosage),
              )
              const targetId = med.id || catalogItem?.id
              const hasAI = !!catalogItem?.ai_summary

              return (
                <ListRow
                  key={med.id || med.name}
                  className="flex-wrap sm:flex-nowrap"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Pill aria-hidden className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {med.name}
                        </p>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {med.dosage}
                        </Badge>
                        {catalogItem?.generic_name && (
                          <Badge variant="outline" className="text-xs">
                            {catalogItem.generic_name}
                          </Badge>
                        )}
                        {hasAI && (
                          <Badge
                            variant="outline"
                            className="border-primary/30 text-primary text-xs flex items-center gap-1"
                          >
                            <Sparkles aria-hidden className="size-3" />
                            AI
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {med.routines.map((r, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {r.routineName} ({r.time}) · {r.amount}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2 pt-2 sm:pt-0">
                    {targetId ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to="/medications/$medicationId"
                          params={{ medicationId: targetId }}
                        >
                          {t("wardDetail.viewMedicationDetails")}
                          <ChevronRight aria-hidden className="size-4 ml-1" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </ListRow>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RoutinesSection({
  wardId,
  addRoutineOpen,
  onAddRoutineOpenChange,
}: {
  wardId: string
  addRoutineOpen: boolean
  onAddRoutineOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation("wards")
  const { isPending, data: ward } = useQuery({
    queryKey: ["ward", wardId],
    queryFn: () => fetchWard(wardId),
    refetchInterval: 5000,
  })
  const { data: callTasks } = useQuery({
    queryKey: ["call-tasks", wardId],
    queryFn: () => fetchCallTasks(wardId),
    refetchInterval: 5000,
  })

  if (isPending || !ward) {
    return (
      <div
        className="grid gap-2"
        role="status"
        aria-busy="true"
        aria-label={t("wardDetail.loadingRoutines")}
      >
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  const routines = ward.routines ?? []
  const pending = (callTasks ?? []).filter((task) => task.status === "pending")
  // Show only the nearest day of pending calls — later days stay scheduled but
  // would only clutter the ward view (scheduler horizon spans multiple days).
  const nearestDay = pending.length
    ? new Date(
        Math.min(...pending.map((task) => Date.parse(task.scheduled_at))),
      ).toDateString()
    : null
  const upcoming = pending.filter(
    (task) => new Date(task.scheduled_at).toDateString() === nearestDay,
  )

  return (
    <div className="flex flex-col gap-6">
      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock
                aria-hidden
                className="size-4 text-muted-foreground"
              />
              {t("wardDetail.upcomingTitle")}
            </CardTitle>
            <CardDescription>
              {t("wardDetail.upcomingDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {upcoming.map((task) => (
                <ListRow key={task.id} className="flex-wrap sm:flex-nowrap">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {task.routine_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("wardDetail.attemptNo", { number: task.attempt_no })}
                    </p>
                  </div>
                  <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
                    <Clock
                      aria-hidden
                      className="size-3.5 text-muted-foreground"
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDateTime(task.scheduled_at)}
                    </span>
                    <Badge variant="outline">{t("outcome.pending")}</Badge>
                  </div>
                </ListRow>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {t("wardDetail.routinesTitle")}
              </CardTitle>
              <CardDescription>
                {t("wardDetail.routinesDescription")}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddRoutineOpenChange(true)}
              >
                <Plus aria-hidden />
                {t("wardDetail.addRoutine")}
              </Button>
              <AddRoutineDialog
                wardId={wardId}
                open={addRoutineOpen}
                onOpenChange={onAddRoutineOpenChange}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {routines.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <CalendarClock aria-hidden className="size-5" />
              </div>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("wardDetail.routinesEmpty")}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {routines.map((routine) => (
                <ListRow key={routine.id} className="flex-wrap sm:flex-nowrap">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {routine.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {routine.items
                        .map(
                          (item) =>
                            `${item.medication_name} ${item.dosage} — ${item.amount_label}`,
                        )
                        .join(", ")}
                    </p>
                  </div>
                  <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {routine.time_of_day}
                    </span>
                    <RoutineStatusBadge status={routine.status} />
                    {routine.status === "approved" && routine.today_status && (
                      <TodayOutcomeBadge status={routine.today_status} />
                    )}
                    <RoutineActionsMenu routine={routine} />
                  </div>
                </ListRow>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CallsSection({ wardId }: { wardId: string }) {
  const { t } = useTranslation("wards")
  const { isPending, data: calls } = useQuery({
    queryKey: ["calls", wardId],
    queryFn: () => fetchCalls(wardId),
    refetchInterval: 5000,
  })

  if (isPending) {
    return (
      <div
        className="grid gap-2"
        role="status"
        aria-busy="true"
        aria-label={t("wardDetail.loadingCalls")}
      >
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (!calls || calls.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <PhoneOff aria-hidden className="size-5" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("wardDetail.callsEmpty")}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("wardDetail.callsTitle")}
        </CardTitle>
        <CardDescription>{t("wardDetail.callsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {calls.map((call) => (
            <li key={call.id}>
              <Link
                to="/wards/$wardId/calls/$callId"
                params={{ wardId, callId: call.id }}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {call.routine.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(call.started_at)}
                    {call.duration_sec > 0 &&
                      ` · ${t("wardDetail.durationSec", { number: call.duration_sec })}`}
                    {call.attempt_no > 1 &&
                      ` · ${t("wardDetail.attemptLower", { number: call.attempt_no })}`}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone aria-hidden className="size-3" />
                    {t(`wardDetail.callStatus.${call.status}`)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {call.result && (
                    <span className="text-xs text-muted-foreground">
                      {t("wardDetail.medicationOutcome")}
                    </span>
                  )}
                  {call.result ? (
                    <TodayOutcomeBadge status={call.result.outcome} />
                  ) : (
                    <TodayOutcomeBadge status="pending" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {t("wardDetail.viewCall")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
