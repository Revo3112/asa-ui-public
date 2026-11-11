// Run with `node src/shared/lib/shift-time.check.ts` (Node 23.6+ strips the types).
import assert from "node:assert/strict"

import { isWithin, overlaps } from "./shift-time.ts"

const pagi = { mulai: "06:00", selesai: "14:00" }
const siang = { mulai: "14:00", selesai: "22:00" }
const malam = { mulai: "22:00", selesai: "06:00" }

assert.ok(isWithin(23 * 60, malam.mulai, malam.selesai), "23.00 is in the night shift")
assert.ok(isWithin(2 * 60, malam.mulai, malam.selesai), "02.00 is in the night shift")
assert.ok(!isWithin(6 * 60, malam.mulai, malam.selesai), "the night shift ends at 06.00")
assert.ok(!overlaps(pagi, siang) && !overlaps(siang, malam) && !overlaps(malam, pagi), "back-to-back shifts don't overlap")
assert.ok(overlaps(malam, { mulai: "05:00", selesai: "13:00" }), "an early shift overlaps the end of the night shift")
assert.ok(overlaps(malam, { mulai: "23:00", selesai: "01:00" }), "two shifts across midnight overlap")
assert.ok(overlaps({ mulai: "00:00", selesai: "00:00" }, pagi), "00:00–00:00 is the whole day")
console.log("shift-time ok")
