import type { Filters } from "@/shared/data/filters"
import { tr } from "@/shared/lib/i18n"

/** Same seed gives the same generated values, so demo data stays stable across views. */
export function seeded(key: string) {
  let h = 2166136261
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/** Simulates the loading, empty and error states shared by mock data queries. */
export function respond<T>(f: Filters, make: () => T, empty: T): Promise<T> {
  return new Promise((resolve, reject) => {
    if (f.demo === "loading") return
    setTimeout(
      () => (f.demo === "error" ? reject(new Error(tr("Server tidak merespons. Coba beberapa saat lagi.", "The server is not responding. Try again shortly."))) : resolve(f.demo === "empty" ? empty : make())),
      300 + Math.random() * 500,
    )
  })
}
