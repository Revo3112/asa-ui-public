// Run with `node src/features/actions/lib/action-aging.check.ts` (Node 23.6+ strips the types).
import assert from "node:assert/strict"

import { actionAging } from "./action-aging.ts"

const DAY = 24 * 60 * 60_000
const now = Date.UTC(2026, 9, 30, 4, 0)

assert.deepEqual(
  actionAging([{ id: "A", status: "assigned", tenggat: now - 4 * DAY }], now).map((bucket) => bucket.ids.length),
  [0, 0, 1, 0],
)
assert.deepEqual(
  actionAging([{ id: "A", status: "verified", tenggat: now - 8 * DAY }], now).map((bucket) => bucket.ids.length),
  [0, 0, 0, 0],
)

console.log("action aging ok")
