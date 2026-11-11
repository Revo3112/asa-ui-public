import { useEffect, useState } from "react"

import { getLang, tr } from "@/shared/lib/i18n"

const rtf = () => new Intl.RelativeTimeFormat(getLang(), { numeric: "auto" })


/** "baru saja", "5 menit yang lalu", "2 jam yang lalu". */
export function ago(date: Date, now: number) {
  const s = Math.round((date.getTime() - now) / 1000)
  if (s > -60) return tr("baru saja", "just now")
  if (s > -3600) return rtf().format(Math.round(s / 60), "minute")
  if (s > -86400) return rtf().format(Math.round(s / 3600), "hour")
  return rtf().format(Math.round(s / 86400), "day")
}

/** "12 menit", "3 jam", "2 hari". */
export function duration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return tr(`${minutes} menit`, `${minutes} min`)
  const hours = Math.round(minutes / 60)
  return hours < 48 ? tr(`${hours} jam`, `${hours} h`) : tr(`${Math.round(hours / 24)} hari`, `${Math.round(hours / 24)} days`)
}

/** The current time, refreshed on an interval, for relative labels that should age on screen. */
export function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}
