import { useEffect, useRef, useState } from "react"

import { BUFFER_MS, CLEAR_HOLD_MS, STALE_MS, type Threshold } from "@/shared/config/lingkungan"
import { getRecent, subscribeReadings, type Reading, type Sensor, type SensorStatus } from "@/features/environment/data/lingkungan"
import type { Filters } from "@/shared/data/filters"

const rank: Record<SensorStatus, number> = { offline: -1, aman: 0, waspada: 1, bahaya: 2 }

/** The status a reading alone would get, before hysteresis. */
export function statusOf(value: number, th: Threshold): Exclude<SensorStatus, "offline"> {
  const past = (limit: number) => (th.arah === "atas" ? value >= limit : value <= limit)
  return past(th.bahaya) ? "bahaya" : past(th.waspada) ? "waspada" : "aman"
}

export type Alarm = { id: number; sensor: Sensor; from: SensorStatus; to: SensorStatus; at: number }

export type SensorSnapshot = {
  now: number
  /** Time of the last batch from the socket; the connection indicator reads it. */
  lastBatchAt?: number
  buffers: Record<string, Reading[]>
  status: Record<string, SensorStatus>
  alarms: Alarm[]
}

/**
 * Live readings for the given sensors: an hour of backfill, then one socket batch per second.
 * Renders at most once a second and not at all while the tab is hidden. Mount its owner with
 * the filters as `key` so a filter change starts a fresh stream.
 */
export function useSensorStream(filters: Filters, sensors: Sensor[] | undefined, thresholds: Record<string, Threshold> | undefined) {
  const buffers = useRef(new Map<string, Reading[]>())
  const tracked = useRef(new Map<string, { status: SensorStatus; betterSince?: number }>())
  const alarms = useRef<Alarm[]>([])
  const lastBatchAt = useRef<number>(undefined)
  const thresholdsRef = useRef(thresholds)
  const [snapshot, setSnapshot] = useState<SensorSnapshot | null>(null)
  const [error, setError] = useState<Error>()

  useEffect(() => {
    thresholdsRef.current = thresholds
  }, [thresholds])

  const ready = !!sensors && !!thresholds

  useEffect(() => {
    if (!ready) return
    let alive = true
    let nextAlarm = 1

    /** Hysteresis: worse at once, better only after holding for CLEAR_HOLD_MS. */
    const evaluate = (now: number, quiet = false) => {
      for (const sensor of sensors) {
        const last = buffers.current.get(sensor.id)?.at(-1)
        const th = thresholdsRef.current?.[sensor.type]
        const state = tracked.current.get(sensor.id) ?? { status: "offline" }
        const raw: SensorStatus = !last || !th || now - last.t > STALE_MS ? "offline" : statusOf(last.v, th)
        let next = state.status
        if (raw === state.status) state.betterSince = undefined
        else if (raw === "offline" || state.status === "offline" || rank[raw] > rank[state.status]) next = raw
        else if (now - (state.betterSince ??= now) >= CLEAR_HOLD_MS) next = raw
        if (next !== state.status) {
          if (!quiet) alarms.current = [{ id: nextAlarm++, sensor, from: state.status, to: next, at: now }, ...alarms.current].slice(0, 30)
          state.status = next
          state.betterSince = undefined
        }
        tracked.current.set(sensor.id, state)
      }
    }

    const render = () => {
      const now = Date.now()
      evaluate(now)
      if (document.hidden) return
      setSnapshot({
        now,
        lastBatchAt: lastBatchAt.current,
        buffers: Object.fromEntries([...buffers.current].map(([id, list]) => [id, list.slice()])),
        status: Object.fromEntries([...tracked.current].map(([id, s]) => [id, s.status])),
        alarms: alarms.current,
      })
    }

    let unsubscribe = () => {}
    let timer: ReturnType<typeof setInterval> | undefined
    getRecent(filters).then(
      (recent) => {
        if (!alive) return
        for (const sensor of sensors) buffers.current.set(sensor.id, recent[sensor.id] ?? [])
        evaluate(Date.now(), true)
        render()
        unsubscribe = subscribeReadings(filters, (batch) => {
          lastBatchAt.current = Date.now()
          for (const { id, reading } of batch) {
            const list = buffers.current.get(id)
            if (!list) continue
            list.push(reading)
            while (list.length && list[0].t < reading.t - BUFFER_MS) list.shift()
          }
        })
        // Batches only fill the buffers; this timer turns them into one render per second.
        timer = setInterval(render, 1000)
      },
      (e: Error) => alive && setError(e),
    )
    document.addEventListener("visibilitychange", render)
    return () => {
      alive = false
      unsubscribe()
      clearInterval(timer)
      document.removeEventListener("visibilitychange", render)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the owner remounts on a filter change
  }, [ready])

  return { snapshot, error }
}
