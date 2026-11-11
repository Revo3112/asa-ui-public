/**
 * Cases and corrective actions: the third and fourth workflow entities.
 *
 * A case is opened by a person from one or more confirmed findings; a confirmed finding never
 * becomes a case on its own. An action has an owner, a due date and its own lifecycle, and is only
 * closed when someone other than its owner verifies it. This module owns the shared case/action
 * store because case transitions depend on the status of linked actions. Overdue is derived from
 * the due date, never stored.
 *
 * The seeded backlog comes from data/kasus-seed.ts.
 */

import { severityMeta, type Severity } from "@/shared/config/events"
import { actionDone, type ActionStatus, type CaseStatus } from "@/shared/config/indikasi"
import { rules } from "@/shared/config/rules"
import { auditTrail, record, type AuditEntry } from "@/shared/data/audit"
import { authorize, caseSeedOf, closedWithCase, findingOf, findStoredIndication, linkToAction, linkToCase, type AiEvent } from "@/features/indications/data/indikasi"
import { userName, type Kasus, type Tindakan } from "@/features/cases/data/kasus-seed"
import { master, siteById, zonaById } from "@/shared/data/master"
import type { Filters } from "@/shared/data/filters"
import { respond } from "@/shared/data/mock-api"
import { inPlace, placed, sitesIn } from "@/shared/data/scope"
import { ApiError } from "@/shared/data/settings"
import { tr } from "@/shared/lib/i18n"
import { periodStart } from "@/shared/lib/periods"

export type { Kasus, Tindakan } from "@/features/cases/data/kasus-seed"
export { userName } from "@/features/cases/data/kasus-seed"

const storeOf = caseSeedOf

// ---- Reading ----

export const casesOf = (site: string) => storeOf(site).cases
export const actionsOf = (site: string) => storeOf(site).actions

/** Overdue: past due and not yet verified or cancelled. Derived, never stored. */
export const isOverdue = (a: Tindakan, now = Date.now()) => a.tenggat.getTime() < now && !actionDone.includes(a.status)

/** Cases opened in the period, plus every case still open whenever it was opened. */
export function casesIn(f: Filters) {
  const start = periodStart(f.periode, Date.now())
  const here = inPlace(f)
  return sitesIn(f)
    .flatMap(casesOf)
    .filter((c) => here(c.site, c.zona.id) && (c.status !== "closed" || c.dibuka.getTime() >= start) && (f.severity === "all" || c.prioritas === f.severity))
    .sort((a, b) => b.dibuka.getTime() - a.dibuka.getTime())
}

/** Actions created in the period, plus every action not yet done whenever it was created. */
export function actionsIn(f: Filters) {
  const start = periodStart(f.periode, Date.now())
  const here = inPlace(f)
  return sitesIn(f)
    .flatMap(actionsOf)
    .filter((a) => (!a.zona.id || here(a.site, a.zona.id)) && sitesIn(f).includes(a.site) && (!actionDone.includes(a.status) || a.dibuat.getTime() >= start))
    .sort((a, b) => a.tenggat.getTime() - b.tenggat.getTime())
}

export const getCases = (f: Filters) => respond(f, () => casesIn(f).map(placed(f)), [] as Kasus[])
export const getActions = (f: Filters) => respond(f, () => actionsIn(f).map((a) => (a.zona.id ? placed(f)(a) : a)), [] as Tindakan[])

function findCaseStored(id: string) {
  for (const s of master().site) {
    const c = casesOf(s.id).find((x) => x.id === id)
    if (c) return c
  }
  return undefined
}

function findActionStored(id: string) {
  for (const s of master().site) {
    const a = actionsOf(s.id).find((x) => x.id === id)
    if (a) return a
  }
  return undefined
}

export const findCase = (f: Pick<Filters, "site">, id: string) => {
  const c = findCaseStored(id)
  return c && placed(f)(c)
}
export const findAction = (f: Pick<Filters, "site">, id: string) => {
  const a = findActionStored(id)
  return a && (a.zona.id ? placed(f)(a) : a)
}

/** Cases rank by priority, then age. */
export const byCasePriority = (a: Kasus, b: Kasus) => severityMeta[a.prioritas].rank - severityMeta[b.prioritas].rank || a.dibuka.getTime() - b.dibuka.getTime()

// ---- Audit ----

function derivedCase(c: Kasus): AuditEntry[] {
  const list: AuditEntry[] = [{ at: c.dibuka, aktor: userName(c.ownerId), aksi: tr("Kasus dibuka", "Case opened"), ke: "open", catatan: c.ringkasan }]
  if (c.ditutup) list.push({ at: c.ditutup, aktor: userName(c.ownerId), aksi: tr("Kasus ditutup", "Case closed"), ke: "closed", catatan: c.rationaleTutup })
  return list
}

function derivedAction(a: Tindakan): AuditEntry[] {
  const list: AuditEntry[] = [{ at: a.dibuat, aktor: "HSE", aksi: tr(`Ditugaskan ke ${userName(a.ownerId)}`, `Assigned to ${userName(a.ownerId)}`), ke: "assigned", catatan: a.catatanAwal }]
  if (a.catatanSelesai) list.push({ at: new Date(Math.min(a.tenggat.getTime(), Date.now())), aktor: userName(a.ownerId), aksi: tr("Diajukan untuk verifikasi", "Submitted for verification"), ke: "pending-verification", catatan: a.catatanSelesai })
  if (a.diverifikasi) list.push({ at: a.diverifikasi, aktor: userName(a.verifierId ?? ""), aksi: tr("Diverifikasi dan ditutup", "Verified and closed"), ke: "verified" })
  if (a.alasanBatal) list.push({ at: a.dibuat, aktor: "HSE", aksi: tr("Dibatalkan", "Cancelled"), ke: "cancelled", catatan: a.alasanBatal })
  return list
}

export const auditOfCase = (c: Kasus) => auditTrail(c.id, () => derivedCase(c))
export const auditOfAction = (a: Tindakan) => auditTrail(a.id, () => derivedAction(a))

// ---- Workflow (mock API) ----

const delay = () => new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 300))

function needCase(id: string) {
  const c = findCaseStored(id)
  if (!c) throw new ApiError(404, tr(`Kasus ${id} tidak ditemukan.`, `Case ${id} not found.`))
  return c
}

function needAction(id: string) {
  const a = findActionStored(id)
  if (!a) throw new ApiError(404, tr(`Tindakan ${id} tidak ditemukan.`, `Action ${id} not found.`))
  return a
}

function needReason(text: string | undefined, what = tr("Alasan", "Reason")) {
  const t = (text ?? "").trim()
  if (t.length < rules.rationaleMinLength) throw new ApiError(422, tr(`${what} minimal ${rules.rationaleMinLength} karakter.`, `${what} needs at least ${rules.rationaleMinLength} characters.`))
  return t
}

/** `trail` is the history taken before the caller changed anything, so a derived entry isn't recorded twice. */
function setCaseStatus(c: Kasus, to: CaseStatus, aktor: string, aksi: string, catatan?: string, trail = auditOfCase(c)) {
  const dari = c.status
  c.status = to
  record("kasus", c.id, () => trail, { at: new Date(), aktor, aksi, dari, ke: to, catatan })
}

export type NewCase = { eventIds: string[]; judul: string; jenis: string; prioritas: Severity; ownerId: string; ringkasan: string }

/** Opens a case from confirmed findings. Every linked indication must have one. */
export async function createCase(input: NewCase) {
  const user = authorize("case.create")
  await delay()
  if (!input.eventIds.length) throw new ApiError(422, tr("Pilih minimal satu indikasi terkonfirmasi.", "Pick at least one confirmed indication."))
  if (!input.judul.trim()) throw new ApiError(422, tr("Judul kasus wajib diisi.", "A case title is required."))
  if (!input.ownerId) throw new ApiError(422, tr("Pilih pemilik kasus.", "Pick a case owner."))
  const events = input.eventIds.map((id) => {
    const e = findStoredIndication(id)
    if (!e) throw new ApiError(404, tr(`Indikasi ${id} tidak ditemukan.`, `Indication ${id} not found.`))
    if (findingOf(e)?.outcome !== "confirmed") throw new ApiError(409, tr(`${id} belum punya temuan terkonfirmasi. Kasus hanya dibuka dari temuan terkonfirmasi.`, `${id} has no confirmed finding. Cases open from confirmed findings only.`))
    return e
  })
  const first: AiEvent = events[0]
  const store = storeOf(first.site)
  const kode = siteById(first.site)?.kode ?? first.site
  const id = `KSS-${kode}-${String(store.cases.length + 1).padStart(3, "0")}`
  const kasus: Kasus = {
    id,
    site: first.site,
    zona: first.zona,
    judul: input.judul.trim(),
    jenis: input.jenis,
    prioritas: input.prioritas,
    status: "open",
    ownerId: input.ownerId,
    dibuka: new Date(),
    ringkasan: input.ringkasan.trim(),
    eventIds: events.map((e) => e.id),
    findingIds: events.map((e) => e.findingId!),
    actionIds: [],
    simulasi: true,
  }
  store.cases.unshift(kasus)
  record("kasus", id, () => [], { at: kasus.dibuka, aktor: user.nama, aksi: tr("Kasus dibuka", "Case opened"), ke: "open", catatan: kasus.ringkasan })
  for (const e of events) linkToCase(e.id, id, user.nama)
  return kasus
}

/** Open → Investigating. The other case states follow its actions. */
export async function startInvestigation(id: string) {
  const user = authorize("case.create")
  await delay()
  const c = needCase(id)
  if (c.status !== "open") throw new ApiError(409, tr("Kasus ini sudah lewat tahap terbuka.", "This case is past the open stage."))
  setCaseStatus(c, "investigating", user.nama, tr("Mulai investigasi", "Investigation started"))
  return c
}

/** Closes a case: a written reason, and no action of it still open. */
export async function closeCase(id: string, rationale: string) {
  const user = authorize("case.close")
  await delay()
  const c = needCase(id)
  if (c.status === "closed") throw new ApiError(409, tr("Kasus ini sudah ditutup.", "This case is already closed."))
  const text = needReason(rationale)
  const open = actionsOf(c.site).filter((a) => a.caseId === c.id && !actionDone.includes(a.status))
  if (open.length) throw new ApiError(409, tr(`Masih ada ${open.length} tindakan terbuka: ${open.map((a) => a.id).join(", ")}. Verifikasi atau batalkan dulu.`, `${open.length} actions are still open: ${open.map((a) => a.id).join(", ")}. Verify or cancel them first.`))
  const trail = auditOfCase(c)
  c.rationaleTutup = text
  c.ditutup = new Date()
  setCaseStatus(c, "closed", user.nama, tr("Kasus ditutup", "Case closed"), text, trail)
  for (const eventId of c.eventIds) closedWithCase(eventId, c.id, user.nama)
  return c
}

export type NewAction = { judul: string; ownerId: string; tenggat: Date; catatanAwal: string; caseId?: string; eventId?: string; sumber?: string; site?: string; zona?: string }

/** Assigns a corrective action. It shows up in the owner's backlog straight away. */
export async function createAction(input: NewAction) {
  const user = authorize("action.create")
  await delay()
  if (!input.judul.trim()) throw new ApiError(422, tr("Judul tindakan wajib diisi.", "An action title is required."))
  if (!input.ownerId) throw new ApiError(422, tr("Pilih penanggung jawab.", "Pick an owner."))
  if (!(input.tenggat instanceof Date) || Number.isNaN(input.tenggat.getTime())) throw new ApiError(422, tr("Isi tenggat.", "Set a due date."))
  const c = input.caseId ? needCase(input.caseId) : undefined
  if (c?.status === "closed") throw new ApiError(409, tr("Kasus ini sudah ditutup.", "This case is already closed."))
  const e = input.eventId ? findStoredIndication(input.eventId) : undefined
  const site = c?.site ?? e?.site ?? input.site
  if (!site) throw new ApiError(422, tr("Tindakan harus terkait kasus, indikasi, atau site.", "An action must belong to a case, an indication or a site."))
  const zonaId = c?.zona.id ?? e?.zona.id ?? input.zona ?? ""
  const store = storeOf(site)
  const kode = siteById(site)?.kode ?? site
  const a: Tindakan = {
    id: `TND-${kode}-${String(store.actions.length + 1).padStart(3, "0")}`,
    judul: input.judul.trim(),
    site,
    zona: { id: zonaId, label: zonaById(zonaId)?.nama ?? zonaId },
    caseId: c?.id,
    eventId: e?.id,
    sumber: input.sumber,
    ownerId: input.ownerId,
    dibuat: new Date(),
    tenggat: input.tenggat,
    status: "assigned",
    catatanAwal: input.catatanAwal.trim() || undefined,
    simulasi: true,
  }
  store.actions.unshift(a)
  record("tindakan", a.id, () => [], { at: a.dibuat, aktor: user.nama, aksi: tr(`Ditugaskan ke ${userName(a.ownerId)}`, `Assigned to ${userName(a.ownerId)}`), ke: "assigned", catatan: a.catatanAwal })
  if (c) {
    c.actionIds.push(a.id)
    if (c.status === "open" || c.status === "investigating") setCaseStatus(c, "action-required", user.nama, tr(`Tindakan ${a.id} ditugaskan`, `Action ${a.id} assigned`))
  }
  if (e) linkToAction(e.id, a.id)
  return a
}

function moveAction(a: Tindakan, to: ActionStatus, aktor: string, aksi: string, catatan?: string, trail = auditOfAction(a)) {
  const dari = a.status
  a.status = to
  record("tindakan", a.id, () => trail, { at: new Date(), aktor, aksi, dari, ke: to, catatan })
  // The case waits for verification once every live action of it does.
  const c = a.caseId ? findCaseStored(a.caseId) : undefined
  if (c && c.status !== "closed") {
    const live = actionsOf(c.site).filter((x) => x.caseId === c.id && x.status !== "cancelled")
    if (live.length && live.every((x) => x.status === "pending-verification" || x.status === "verified") && c.status !== "pending-verification")
      setCaseStatus(c, "pending-verification", aktor, tr("Semua tindakan menunggu verifikasi", "Every action is pending verification"))
  }
}

/** Assigned → In progress, by the owner (or anyone allowed to update every action). */
export async function startAction(id: string) {
  const a = needAction(id)
  const user = authorize("action.update", a.ownerId)
  await delay()
  if (a.status !== "assigned") throw new ApiError(409, tr("Tindakan ini sudah dikerjakan.", "This action is already in progress."))
  moveAction(a, "in-progress", user.nama, tr("Mulai dikerjakan", "Work started"))
  return a
}

/** Submits for verification with a completion note. Pending verification is not closed. */
export async function submitAction(id: string, catatanSelesai: string, buktiRef?: string) {
  const a = needAction(id)
  const user = authorize("action.update", a.ownerId)
  await delay()
  if (a.status !== "assigned" && a.status !== "in-progress") throw new ApiError(409, tr("Tindakan ini tidak sedang dikerjakan.", "This action is not in progress."))
  const note = needReason(catatanSelesai, tr("Catatan penyelesaian", "Completion note"))
  const trail = auditOfAction(a)
  a.catatanSelesai = note
  a.buktiRef = buktiRef?.trim() || undefined
  moveAction(a, "pending-verification", user.nama, tr("Diajukan untuk verifikasi", "Submitted for verification"), note, trail)
  return a
}

/** Verifies and closes. The verifier is never the owner. */
export async function verifyAction(id: string, rationale: string) {
  const user = authorize("action.verify")
  await delay()
  const a = needAction(id)
  if (a.status !== "pending-verification") throw new ApiError(409, tr("Hanya tindakan yang menunggu verifikasi yang bisa diverifikasi.", "Only actions pending verification can be verified."))
  if (a.ownerId === user.id) throw new ApiError(409, tr("Pemilik tindakan tidak boleh memverifikasi tindakannya sendiri.", "An action's owner may not verify their own action."))
  const text = needReason(rationale)
  const trail = auditOfAction(a)
  a.verifierId = user.id
  a.diverifikasi = new Date()
  moveAction(a, "verified", user.nama, tr("Diverifikasi dan ditutup", "Verified and closed"), text, trail)
  return a
}

/** Cancels from any state except verified, with a reason. */
export async function cancelAction(id: string, reason: string) {
  const user = authorize("action.verify")
  await delay()
  const a = needAction(id)
  if (a.status === "verified" || a.status === "cancelled") throw new ApiError(409, tr("Tindakan ini sudah selesai.", "This action is already finished."))
  const why = needReason(reason, tr("Alasan pembatalan", "Cancellation reason"))
  const trail = auditOfAction(a)
  a.alasanBatal = why
  moveAction(a, "cancelled", user.nama, tr("Dibatalkan", "Cancelled"), why, trail)
  return a
}

/** The people who can own an action at a site, for pickers. */
export const actionOwners = (site: string) =>
  master().pengguna.filter((u) => u.aktif && (u.site.includes(site) || u.role === "super-admin") && ["area-supervisor", "hse-officer", "it-ot", "hse-manager"].includes(u.role))

/** The people who can own a case at a site, for pickers. */
export const caseOwners = (site: string) =>
  master().pengguna.filter((u) => u.aktif && (u.site.includes(site) || u.role === "super-admin") && ["hse-manager", "hse-officer", "site-manager"].includes(u.role))
