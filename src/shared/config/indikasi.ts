import { tr } from "@/shared/lib/i18n"
/**
 * Vocabulary of the review workflow: what an AI indication is, the five status domains that are
 * never mixed, and the edge tiers an indication can come from. Labels are read from here so a
 * site can rename a category or a detector without touching a component.
 *
 * Event ≠ finding ≠ case ≠ action ≠ source health. Overdue is derived, never a stored status.
 */

// ---- Categories and detectors ----

export type Kategori = "apd" | "zona-terlarang" | "orang-tak-dikenal" | "kendaraan-tak-terdaftar" | "perubahan-objek"

/** `native` is a detector Axxon One ships with; `validasi` needs calibration or custom work on site. */
export type DetectorStatus = "native" | "validasi"

export type KategoriDef = {
  id: Kategori
  label: string
  detektor: string
  status: DetectorStatus
  /** Shown next to the status so nobody promises what the detector doesn't do. */
  catatan: string
}

export const kategoriDefs: KategoriDef[] = [
  {
    id: "apd",
    get label() { return tr("Kepatuhan APD", "PPE compliance") },
    get detektor() { return tr("Deteksi APD (neural)", "PPE detection (neural)") },
    status: "native",
    get catatan() { return tr("Kelas APD dikonfigurasi per aturan site.", "PPE classes are configured per site rule.") },
  },
  {
    id: "zona-terlarang",
    get label() { return tr("Masuk zona terlarang", "Restricted zone entry") },
    get detektor() { return tr("Gerakan di zona terlarang", "Movement in prohibited zone") },
    status: "native",
    get catatan() { return tr("Batas zona dan jam akses yang diizinkan ditetapkan bersama HSE.", "Zone boundaries and permitted access hours are set with HSE.") },
  },
  {
    id: "orang-tak-dikenal",
    get label() { return tr("Orang tak dikenal", "Unknown person") },
    get detektor() { return tr("Pengenalan wajah", "Face recognition") },
    status: "validasi",
    get catatan() { return tr("Wajah dicocokkan ke data karyawan, kontraktor, dan tamu terdaftar yang sudah memberi persetujuan.", "Faces are matched against registered employees, contractors and visitors who gave consent.") },
  },
  {
    id: "kendaraan-tak-terdaftar",
    get label() { return tr("Kendaraan tak terdaftar", "Unregistered vehicle") },
    get detektor() { return tr("Pengenalan plat nomor (TNKB)", "Licence plate recognition") },
    status: "native",
    get catatan() { return tr("Plat dibandingkan dengan daftar kendaraan site dan daftar hitam.", "Plates are checked against the site vehicle list and the blacklist.") },
  },
  {
    id: "perubahan-objek",
    get label() { return tr("Perubahan susunan objek", "Object arrangement change") },
    get detektor() { return tr("Perbandingan dengan gambar acuan", "Comparison with a reference image") },
    status: "validasi",
    get catatan() { return tr("Area acuan dan ambang perubahan diatur per kamera; perlu kalibrasi cahaya di lokasi.", "Reference areas and change thresholds are set per camera; needs on-site lighting calibration.") },
  },
]

export const kategoriDef = (id: Kategori) => kategoriDefs.find((k) => k.id === id)!
export const detectorStatusLabel: Record<DetectorStatus, string> = { native: "Native", get validasi() { return tr("Perlu validasi", "Needs validation") } }

// ---- Edge tiers ----

/** Where inference ran. Every indication carries its tier and device. */
export type Tier = "site" | "aegis" | "manpack"

export const tierLabel: Record<Tier, string> = {
  get site() { return tr("Cluster site (server Axxon One / AI edge)", "Site cluster (Axxon One / AI edge server)") },
  aegis: "Aegis Intelligence Pole",
  manpack: "Manpack Surveillance",
}

// ---- AI indication workflow ----

export type Workflow = "new" | "acknowledged" | "in-review" | "review-completed" | "case-open" | "resolved"

export const workflowMeta: Record<Workflow, { label: string; color: "danger" | "warning" | "accent" | "success" | "default" }> = {
  new: { get label() { return tr("Baru", "New") }, color: "danger" },
  acknowledged: { label: "Acknowledged", color: "warning" },
  "in-review": { get label() { return tr("Sedang direview", "In review") }, color: "warning" },
  "review-completed": { get label() { return tr("Review selesai", "Review completed") }, color: "accent" },
  "case-open": { get label() { return tr("Kasus terbuka", "Case open") }, color: "accent" },
  resolved: { get label() { return tr("Selesai", "Resolved") }, color: "success" },
}

/** States in which an indication still waits for a review outcome. */
export const pendingReview: Workflow[] = ["new", "acknowledged", "in-review"]

// ---- Finding (review outcome) ----

export type Outcome = "confirmed" | "no-violation" | "false-alarm" | "inconclusive"

export const outcomeMeta: Record<Outcome, { label: string; color: "danger" | "warning" | "accent" | "success" | "default" }> = {
  confirmed: { get label() { return tr("Terkonfirmasi", "Confirmed") }, color: "danger" },
  "no-violation": { get label() { return tr("Bukan pelanggaran", "No violation") }, color: "success" },
  "false-alarm": { get label() { return tr("Alarm palsu", "False alarm") }, color: "default" },
  inconclusive: { get label() { return tr("Tidak dapat dipastikan", "Inconclusive") }, color: "warning" },
}

// ---- Case ----

export type CaseStatus = "open" | "investigating" | "action-required" | "pending-verification" | "closed"

export const caseStatusMeta: Record<CaseStatus, { label: string; color: "danger" | "warning" | "accent" | "success" | "default" }> = {
  open: { get label() { return tr("Terbuka", "Open") }, color: "danger" },
  investigating: { get label() { return tr("Investigasi", "Investigating") }, color: "warning" },
  "action-required": { get label() { return tr("Perlu tindakan", "Action required") }, color: "warning" },
  "pending-verification": { get label() { return tr("Menunggu verifikasi", "Pending verification") }, color: "accent" },
  closed: { get label() { return tr("Ditutup", "Closed") }, color: "success" },
}

// ---- Corrective action ----

export type ActionStatus = "assigned" | "in-progress" | "pending-verification" | "verified" | "cancelled"

export const actionStatusMeta: Record<ActionStatus, { label: string; color: "danger" | "warning" | "accent" | "success" | "default" }> = {
  assigned: { get label() { return tr("Ditugaskan", "Assigned") }, color: "warning" },
  "in-progress": { get label() { return tr("Dikerjakan", "In progress") }, color: "warning" },
  "pending-verification": { get label() { return tr("Menunggu verifikasi", "Pending verification") }, color: "accent" },
  verified: { get label() { return tr("Terverifikasi/Ditutup", "Verified/Closed") }, color: "success" },
  cancelled: { get label() { return tr("Dibatalkan", "Cancelled") }, color: "default" },
}

/** An action is finished once verified or cancelled. Anything else past its due date is overdue. */
export const actionDone: ActionStatus[] = ["verified", "cancelled"]

// ---- Source health ----

export type SourceStatus = "online" | "degraded" | "offline" | "stale" | "unknown"

export const sourceStatusMeta: Record<SourceStatus, { label: string; color: "danger" | "warning" | "accent" | "success" | "default" }> = {
  online: { label: "Online", color: "success" },
  degraded: { get label() { return tr("Menurun", "Degraded") }, color: "warning" },
  offline: { label: "Offline", color: "danger" },
  stale: { get label() { return tr("Tidak melapor", "Stale") }, color: "warning" },
  unknown: { get label() { return tr("Tidak diketahui", "Unknown") }, color: "default" },
}

// ---- Evidence ----

export type ClipState = "on-edge" | "requested" | "available"

export const clipStateLabel: Record<ClipState, string> = {
  get "on-edge"() { return tr("Di edge, minta bila perlu", "On the edge, request when needed") },
  get requested() { return tr("Diminta, menunggu unggahan", "Requested, waiting for upload") },
  get available() { return tr("Tersedia", "Available") },
}
