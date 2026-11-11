/** Shift times as "HH:MM". A shift whose end is at or before its start runs past midnight, e.g. 22:00–06:00. */

const DAY = 24 * 60

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

/** The shift as one or two [start, end) ranges inside a single day. */
function ranges(mulai: string, selesai: string): [number, number][] {
  const start = toMinutes(mulai)
  const end = toMinutes(selesai)
  return start < end ? [[start, end]] : [[start, DAY], [0, end]]
}

export const isWithin = (minute: number, mulai: string, selesai: string) => ranges(mulai, selesai).some(([a, b]) => minute >= a && minute < b)

export const overlaps = (a: { mulai: string; selesai: string }, b: { mulai: string; selesai: string }) =>
  ranges(a.mulai, a.selesai).some(([a1, a2]) => ranges(b.mulai, b.selesai).some(([b1, b2]) => a1 < b2 && b1 < a2))
