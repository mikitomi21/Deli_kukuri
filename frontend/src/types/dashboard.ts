/**
 * Domain types shaped after the docs/05-api-spec.md contract.
 * API and demo modes share these shapes for routines, calls and statistics.
 */

export type RoutineStatus = "draft" | "approved" | "paused"

export type CallOutcome = "took" | "not_taken" | "unclear" | "no_answer"

/** Core ward — matches the backend WardPublic shape (T05). */
export interface Ward {
  id: string
  full_name: string
  phone_e164: string
  sms_notification_preference?: "always" | "issues_only" | "never"
  tz: string
  active: boolean
}

/**
 * Ward enriched with routines, persisted call outcomes and adherence statistics.
 */
export interface WardWithToday extends Ward {
  /** Today's summary: took / total routines. */
  today?: { took: number; total: number }
  /** Adherence over the last 7 days, percent. */
  week_pct?: number
  /** Ward routines with today's outcomes. */
  routines?: RoutineWithOutcome[]
}

export interface RoutineItem {
  /** UUID from the medication catalog (docs/05: items[].medication_id). */
  medication_id: string
  medication_name: string
  dosage: string
  amount_label: string
}

export interface Routine {
  id: string
  ward_id: string
  name: string
  time_of_day: string
  status: RoutineStatus
  items: RoutineItem[]
  /** IDs of routines this one depends on (docs/04 C3). */
  depends_on: string[]
}

/** Routine with today's derived status: outcome badge or "pending". */
export interface RoutineWithOutcome extends Routine {
  /** Today's call outcome, or "pending" when a call is still scheduled. */
  today_status?: CallOutcome | "pending"
}

export interface CallTask {
  id: string
  ward_id: string
  routine_id: string
  routine_name: string
  scheduled_at: string
  status: "pending" | "in_progress" | "completed" | "canceled" | "failed"
  attempt_no: number
}

export interface CallTurn {
  turn_no: number
  question: string
  speech_result: string
  confidence: number
  parsed: "yes" | "no" | "unclear" | null
}

export interface Call {
  id: string
  ward_id: string
  call_task_id: string | null
  /** Routine the call belongs to (null for ad-hoc calls). */
  routine_id: string | null
  routine: { name: string; time_of_day: string }
  status:
    | "queued"
    | "ringing"
    | "in_progress"
    | "completed"
    | "busy"
    | "failed"
    | "no_answer"
    | "canceled"
  started_at: string
  duration_sec: number
  attempt_no: number
  result: {
    outcome: CallOutcome
    confidence: number
    transcript_full: string
    notes?: string | null
  } | null
  turns: CallTurn[]
}

export interface WardStats {
  today: { took: number; total: number }
  week_pct: number
}
