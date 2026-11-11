import { periodDays } from "@/shared/data/filters"

const DAY = 86_400_000

/** Start timestamp for the selected reporting period, using local midnight for today. */
export function periodStart(periode: string, now: number) {
  if (periode !== "today") return now - (periodDays[periode] ?? 1) * DAY
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  return midnight.getTime()
}
