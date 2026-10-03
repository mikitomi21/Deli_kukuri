import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Clock, Hash } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TodayOutcomeBadge } from "@/components/Wards/RoutineStatusBadge"
import { fetchCall } from "@/hooks/useCalls"
import i18n from "@/i18n"

export const Route = createFileRoute("/_layout/wards/$wardId/calls/$callId")({
  component: CallDetail,
  head: () => ({
    meta: [
      {
        title: i18n.getFixedT(null, "wards")("callDetail.pageTitle"),
      },
    ],
  }),
})

/** docs/04 E2: call details with every turn and the full transcript. */
function CallDetail() {
  const { callId, wardId } = Route.useParams()
  const { t } = useTranslation("wards")
  const {
    isPending,
    error,
    data: call,
  } = useQuery({
    queryKey: ["call", callId],
    queryFn: () => fetchCall(callId),
    refetchInterval: 5000,
  })

  if (isPending) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-busy="true"
        aria-label={t("callDetail.loading")}
      >
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !call) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("callDetail.errorTitle")}</CardTitle>
          <CardDescription role="alert">
            {error?.message ?? t("callDetail.notFound")}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/wards/$wardId" params={{ wardId }}>
            <ArrowLeft aria-hidden />
            {t("callDetail.backToWard")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {call.routine.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {new Date(call.started_at).toLocaleString(i18n.language)}
            </p>
          </div>
          {call.result && <TodayOutcomeBadge status={call.result.outcome} />}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock aria-hidden className="size-3.5" />
            {call.duration_sec > 0
              ? t("callDetail.durationSec", { number: call.duration_sec })
              : t("callDetail.noConversation")}
          </span>
          <span className="flex items-center gap-1.5">
            <Hash aria-hidden className="size-3.5" />
            {t("callDetail.attemptNo", { number: call.attempt_no })}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("callDetail.summaryTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">
            {call.result?.notes || t("callDetail.summaryUnavailable")}
          </p>
        </CardContent>
      </Card>

      {call.turns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("callDetail.turnsTitle")}
            </CardTitle>
            <CardDescription>
              {t("callDetail.turnsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {call.turns.map((turn) => (
                <li key={turn.turn_no} className="rounded-md border p-3">
                  <p className="text-sm">
                    <span className="font-medium">
                      {t("callDetail.systemLabel")}
                    </span>{" "}
                    {turn.question}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">
                      {t("callDetail.wardLabel")}
                    </span>{" "}
                    {turn.speech_result || "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("callDetail.turnNo", { number: turn.turn_no })} ·{" "}
                    {t("callDetail.confidence", {
                      pct: (turn.confidence * 100).toFixed(0),
                    })}
                    {turn.parsed &&
                      ` · ${t("callDetail.interpreted", {
                        value: t(
                          `callDetail.parsed${
                            turn.parsed === "yes"
                              ? "Yes"
                              : turn.parsed === "no"
                                ? "No"
                                : "Unclear"
                          }`,
                        ),
                      })}`}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {call.result?.transcript_full && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("callDetail.transcriptTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
              {call.result.transcript_full}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
