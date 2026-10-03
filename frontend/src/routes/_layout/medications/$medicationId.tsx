import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  FileText,
  Info,
  ShieldCheck,
  Sparkles,
  Utensils,
} from "lucide-react"
import { useTranslation } from "react-i18next"
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
import { medicationDetailQueryOptions } from "@/hooks/useMedications"
import i18n from "@/i18n"

export const Route = createFileRoute("/_layout/medications/$medicationId")({
  component: MedicationDetailPage,
  head: () => ({
    meta: [
      {
        title: i18n.getFixedT(null, "wards")("medicationDetail.pageTitle"),
      },
    ],
  }),
})

interface AISummaryShape {
  what_it_is?: string
  how_to_take?: string
  when_to_take?: string
  warnings?: string
}

interface FDALabelShape {
  source?: string
  generic_name?: string
  brand_name?: string[]
  indications_and_usage?: string[]
  dosage_and_administration?: string[]
  warnings?: string[]
  food_safety_warning?: string[]
  storage_and_handling?: string[]
}

function parseJSON<T>(raw: string | null | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function MedicationDetailPage() {
  const { medicationId } = Route.useParams()
  const router = useRouter()
  const { t } = useTranslation("wards")

  const {
    isPending,
    error,
    data: medication,
  } = useQuery(medicationDetailQueryOptions(medicationId))

  if (isPending) {
    return (
      <div
        className="flex flex-col gap-6"
        role="status"
        aria-busy="true"
        aria-label={t("medicationDetail.loading")}
      >
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !medication) {
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.history.back()}
          className="-ml-2 mb-2 w-fit"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("medicationDetail.back")}
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>{t("medicationDetail.errorTitle")}</CardTitle>
            <CardDescription role="alert">
              {error?.message ?? t("medicationDetail.notFound")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const aiSummary = parseJSON<AISummaryShape>(medication.ai_summary)
  const fdaData = parseJSON<FDALabelShape>(medication.fda_raw)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.history.back()}
          className="-ml-2 mb-2"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("medicationDetail.back")}
        </Button>
        <PageHeader
          title={medication.name}
          description={
            <span className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="secondary" className="font-mono text-xs">
                {medication.dosage}
              </Badge>
              {medication.form && (
                <Badge variant="outline" className="text-xs">
                  {medication.form}
                </Badge>
              )}
              {medication.generic_name && (
                <Badge
                  variant="outline"
                  className="border-primary/30 text-primary text-xs"
                >
                  INN / FDA: {medication.generic_name}
                </Badge>
              )}
            </span>
          }
        />
        {medication.instructions && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <Info aria-hidden className="size-3.5 shrink-0" />
            <span>
              <strong className="font-medium text-foreground">
                {t("medicationDetail.standardInstructions")}:
              </strong>{" "}
              {medication.instructions}
            </span>
          </div>
        )}
      </div>

      {/* AI Summary Section */}
      <Card className="border-primary/20 bg-gradient-to-b from-primary/5 via-card to-card shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles aria-hidden className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  {t("medicationDetail.aiSectionTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("medicationDetail.aiSectionSubtitle")}
                </CardDescription>
              </div>
            </div>
            <Badge variant="default" className="text-xs">
              <Sparkles aria-hidden className="mr-1 size-3" />
              AI Verified
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Czym jest lek */}
          <div className="flex flex-col gap-1.5 rounded-lg border bg-background/80 p-3.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <ShieldCheck aria-hidden className="size-4" />
              {t("medicationDetail.whatItIsTitle")}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {aiSummary?.what_it_is ??
                `${medication.name} (${medication.generic_name ?? ""}) — ${medication.instructions ?? ""}`}
            </p>
          </div>

          {/* Z czym brać i czym popijać */}
          <div className="flex flex-col gap-1.5 rounded-lg border bg-background/80 p-3.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Utensils aria-hidden className="size-4" />
              {t("medicationDetail.howToTakeTitle")}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {aiSummary?.how_to_take ??
                "Przyjmować doustnie, popijając pełną szklanką wody."}
            </p>
          </div>

          {/* Kiedy najlepiej przyjmować */}
          <div className="flex flex-col gap-1.5 rounded-lg border bg-background/80 p-3.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Clock aria-hidden className="size-4" />
              {t("medicationDetail.whenToTakeTitle")}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {aiSummary?.when_to_take ??
                "Przyjmować o stałych porach każdego dnia zgodnie z zaleceniem lekarza."}
            </p>
          </div>

          {/* Ważne ostrzeżenia */}
          <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <AlertTriangle aria-hidden className="size-4" />
              {t("medicationDetail.warningsTitle")}
            </div>
            <p className="text-xs leading-relaxed text-destructive/90">
              {aiSummary?.warnings ??
                "Nie modyfikować dawek samodzielnie. W przypadku wątpliwości skonsultować się z lekarzem."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* openFDA Documentation Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText aria-hidden className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {t("medicationDetail.fdaSectionTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("medicationDetail.fdaSectionSubtitle")}
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              openFDA
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {fdaData ? (
            <div className="flex flex-col gap-4 text-xs">
              {fdaData.indications_and_usage &&
                fdaData.indications_and_usage.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <h4 className="mb-1.5 font-semibold text-foreground">
                      {t("medicationDetail.fdaIndications")}
                    </h4>
                    <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                      {fdaData.indications_and_usage.map((text, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {fdaData.dosage_and_administration &&
                fdaData.dosage_and_administration.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <h4 className="mb-1.5 font-semibold text-foreground">
                      {t("medicationDetail.fdaDosage")}
                    </h4>
                    <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                      {fdaData.dosage_and_administration.map((text, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {fdaData.warnings && fdaData.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-50/50 p-3 dark:bg-amber-950/10">
                  <h4 className="mb-1.5 font-semibold text-amber-800 dark:text-amber-300">
                    {t("medicationDetail.fdaWarnings")}
                  </h4>
                  <ul className="list-inside list-disc space-y-1 text-amber-900/90 dark:text-amber-200/90">
                    {fdaData.warnings.map((text, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {fdaData.food_safety_warning &&
                fdaData.food_safety_warning.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <h4 className="mb-1.5 font-semibold text-foreground">
                      {t("medicationDetail.fdaFoodSafety")}
                    </h4>
                    <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                      {fdaData.food_safety_warning.map((text, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Dokumentacja openFDA jest dostępna po uruchomieniu wzbogacania
              danych.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
