import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Clock, Hash, Send } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LoadingButton } from "@/components/ui/loading-button"
import { Skeleton } from "@/components/ui/skeleton"
import { CallConversation } from "@/components/Wards/CallConversation"
import { TodayOutcomeBadge } from "@/components/Wards/RoutineStatusBadge"
import { getWardsMode } from "@/hooks/apiMode"
import { fetchCall, sendCallSummarySms } from "@/hooks/useCalls"
import useCustomToast from "@/hooks/useCustomToast"
import i18n from "@/i18n"
import { handleError } from "@/utils"

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
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const smsMutation = useMutation({
    mutationFn: sendCallSummarySms,
    onSuccess: () => showSuccessToast(t("callDetail.smsSent")),
    onError: handleError.bind(showErrorToast),
  })
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
          {call.result && (
            <div className="flex flex-wrap items-center gap-2">
              <TodayOutcomeBadge status={call.result.outcome} />
              {getWardsMode() === "api" && (
                <LoadingButton
                  size="sm"
                  variant="outline"
                  loading={smsMutation.isPending}
                  disabled={smsMutation.isSuccess}
                  onClick={() => smsMutation.mutate(call.id)}
                >
                  <Send aria-hidden className="size-4" />
                  {smsMutation.isSuccess
                    ? t("callDetail.smsSentButton")
                    : t("callDetail.sendSms")}
                </LoadingButton>
              )}
            </div>
          )}
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
            <CallConversation turns={call.turns} />
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
