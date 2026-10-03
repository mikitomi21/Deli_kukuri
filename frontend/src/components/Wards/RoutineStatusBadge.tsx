import {
  CircleCheck,
  CircleHelp,
  Clock,
  FilePenLine,
  Pause,
  PhoneOff,
  X,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import type { CallOutcome, RoutineStatus } from "@/types/dashboard"

// Labels live in the wards namespace (routineStatus / outcome); the maps
// only hold presentation data that does not need translation.
const routineMeta: Record<
  RoutineStatus,
  { icon: typeof CircleCheck; iconClassName: string }
> = {
  draft: {
    icon: FilePenLine,
    iconClassName: "text-muted-foreground",
  },
  approved: {
    icon: CircleCheck,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
  paused: {
    icon: Pause,
    iconClassName: "text-amber-600 dark:text-amber-400",
  },
}

/** Lifecycle badge: draft / approved / paused (docs/04 C4). */
export function RoutineStatusBadge({ status }: { status: RoutineStatus }) {
  const { t } = useTranslation("wards")
  const { icon: Icon, iconClassName } = routineMeta[status]
  return (
    <Badge variant={status === "approved" ? "secondary" : "outline"}>
      <Icon aria-hidden className={iconClassName} />
      {t(`routineStatus.${status}`)}
    </Badge>
  )
}

const outcomeMeta: Record<
  CallOutcome | "pending",
  {
    icon: typeof CircleCheck
    iconClassName: string
    variant: "default" | "secondary" | "destructive" | "outline"
  }
> = {
  took: {
    icon: CircleCheck,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    variant: "secondary",
  },
  not_taken: {
    icon: X,
    iconClassName: "text-destructive",
    variant: "destructive",
  },
  unclear: {
    icon: CircleHelp,
    iconClassName: "text-amber-600 dark:text-amber-400",
    variant: "secondary",
  },
  no_answer: {
    icon: PhoneOff,
    iconClassName: "text-muted-foreground",
    variant: "outline",
  },
  pending: {
    icon: Clock,
    iconClassName: "text-muted-foreground",
    variant: "outline",
  },
}

/** Today's outcome badge for a routine (icon + color + text — never color alone). */
export function TodayOutcomeBadge({
  status,
}: {
  status: CallOutcome | "pending"
}) {
  const { t } = useTranslation("wards")
  const { icon: Icon, iconClassName, variant } = outcomeMeta[status]
  return (
    <Badge variant={variant}>
      <Icon aria-hidden className={iconClassName} />
      {t(`outcome.${status}`)}
    </Badge>
  )
}
