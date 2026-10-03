import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Pencil,
  Phone,
  PhoneOff,
  Plus,
  UserX,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
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
import { WardDeactivateDialog } from "@/components/Wards/WardDeactivateDialog"
import { WardEditDialog } from "@/components/Wards/WardEditDialog"
import { fetchCalls, fetchCallTasks, startTestCall } from "@/hooks/useCalls"
import useCustomToast from "@/hooks/useCustomToast"
import { fetchWard } from "@/hooks/useWards"
import i18n from "@/i18n"
import { handleError } from "@/utils"

export const Route = createFileRoute("/_layout/wards/$wardId")({
  component: WardDetail,
  head: () => ({
    meta: [
      {
        title: i18n.getFixedT(null, "wards")("wardDetail.pageTitle"),
      },
    ],
  }),
})

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
  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
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
  })

  const testCall = useMutation({
    mutationFn: () => startTestCall(wardId),
    onSuccess: (call) => {
      showSuccessToast(
        t("wardDetail.testCallResult", {
          outcome: call.result
            ? t(`outcome.${call.result.outcome}`)
            : t("wardDetail.noOutcome"),
        }),
      )
      queryClient.invalidateQueries({ queryKey: ["ward", wardId] })
      queryClient.invalidateQueries({ queryKey: ["calls", wardId] })
    },
    onError: handleError.bind(showErrorToast),
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {ward.full_name}
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone aria-hidden className="size-3" />
              {ward.phone_e164} · {ward.tz}
            </p>
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => testCall.mutate()}
              disabled={testCall.isPending}
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
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeactivateOpen(true)}
            >
              <UserX aria-hidden />
              {t("wardDetail.deactivate")}
            </Button>
          </div>
        </div>
      </div>

      <WardTabs wardId={wardId} />

      <WardEditDialog ward={ward} open={editOpen} onOpenChange={setEditOpen} />
      <WardDeactivateDialog
        ward={ward}
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
      />
    </div>
  )
}

function WardTabs({ wardId }: { wardId: string }) {
  const { t } = useTranslation("wards")
  return (
    <Tabs defaultValue="routines">
      <TabsList>
        <TabsTrigger value="routines">
          {t("wardDetail.tabRoutines")}
        </TabsTrigger>
        <TabsTrigger value="calls">{t("wardDetail.tabCalls")}</TabsTrigger>
      </TabsList>
      <TabsContent value="routines" className="mt-4">
        <RoutinesSection wardId={wardId} />
      </TabsContent>
      <TabsContent value="calls" className="mt-4">
        <CallsSection wardId={wardId} />
      </TabsContent>
    </Tabs>
  )
}

function RoutinesSection({ wardId }: { wardId: string }) {
  const { t } = useTranslation("wards")
  const { isPending, data: ward } = useQuery({
    queryKey: ["ward", wardId],
    queryFn: () => fetchWard(wardId),
  })
  const { data: callTasks } = useQuery({
    queryKey: ["call-tasks", wardId],
    queryFn: () => fetchCallTasks(wardId),
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
  const upcoming = (callTasks ?? []).filter((task) => task.status === "pending")

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
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {task.routine_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("wardDetail.attemptNo", { number: task.attempt_no })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Clock
                      aria-hidden
                      className="size-3.5 text-muted-foreground"
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDateTime(task.scheduled_at)}
                    </span>
                    <Badge variant="outline">{t("outcome.pending")}</Badge>
                  </div>
                </li>
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
            <AddRoutineDialog wardId={wardId}>
              <Button variant="outline" size="sm">
                <Plus aria-hidden />
                {t("wardDetail.addRoutine")}
              </Button>
            </AddRoutineDialog>
          </div>
        </CardHeader>
        <CardContent>
          {routines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("wardDetail.routinesEmpty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {routines.map((routine) => (
                <li
                  key={routine.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
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
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {routine.time_of_day}
                    </span>
                    <RoutineStatusBadge status={routine.status} />
                    {routine.status === "approved" && routine.today_status && (
                      <TodayOutcomeBadge status={routine.today_status} />
                    )}
                    <RoutineActionsMenu routine={routine} />
                  </div>
                </li>
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
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">
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
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-accent"
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
                </div>
                {call.result && (
                  <TodayOutcomeBadge status={call.result.outcome} />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
