import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Phone, Plus } from "lucide-react"
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
import { AddRoutineDialog } from "@/components/Wards/AddRoutineDialog"
import { AddWardDialog } from "@/components/Wards/AddWardDialog"
import {
  RoutineStatusBadge,
  TodayOutcomeBadge,
} from "@/components/Wards/RoutineStatusBadge"
import { fetchWards, getWardsMode } from "@/hooks/useWards"
import i18n from "@/i18n"

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

function TodaySummary({ took, total }: { took: number; total: number }) {
  const { t } = useTranslation("admin")
  const allGood = took === total && total > 0
  return (
    <Badge variant={allGood ? "default" : "destructive"}>
      {allGood
        ? t("dashboard.summaryAllGood")
        : t("dashboard.summaryNeedsAttention")}{" "}
      · {took}/{total}
    </Badge>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("dashboard.todayTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.todaySubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      <ul className="grid gap-4 md:grid-cols-2">
        {wards.map((ward) => (
          <li key={ward.id}>
            <Card className="flex h-full flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle>
                      <Link
                        to="/wards/$wardId"
                        params={{ wardId: ward.id }}
                        className="hover:underline"
                      >
                        {ward.full_name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1.5">
                      <Phone aria-hidden className="size-3" />
                      {ward.phone_e164}
                    </CardDescription>
                  </div>
                  {ward.today && (
                    <TodaySummary
                      took={ward.today.took}
                      total={ward.today.total}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {!ward.routines ? (
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.routinesPending")}
                  </p>
                ) : ward.routines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.noRoutines")}{" "}
                    <AddRoutineDialog wardId={ward.id}>
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        {t("dashboard.addFirstRoutine")}
                      </button>
                    </AddRoutineDialog>
                    .
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {ward.routines.map((routine) => (
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
                                  `${item.medication_name} ${item.dosage}`,
                              )
                              .join(", ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {routine.time_of_day}
                          </span>
                          {routine.today_status &&
                          routine.status === "approved" ? (
                            <TodayOutcomeBadge status={routine.today_status} />
                          ) : (
                            <RoutineStatusBadge status={routine.status} />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
