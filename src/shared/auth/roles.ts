/**
 * Who may do what in the review → case → corrective action workflow. The mock API checks the same
 * table before it changes a record, so a hidden button is never the only guard.
 *
 * From the role matrix in the developer brief, to be validated with the customer. The template's
 * own roles are mapped onto it: Super Admin may do everything, HSE Officer triages like Control
 * Room and raises actions, Admin Site and Viewer read and export.
 */

import type { Role } from "@/shared/auth/session"
import { tr } from "@/shared/lib/i18n"

export type WorkflowAction =
  | "acknowledge"
  | "review"
  | "case.create"
  | "case.close"
  | "action.create"
  | "action.update"
  | "action.verify"
  | "clip.request"
  | "export"

export const workflowActionLabel: Record<WorkflowAction, string> = {
  get acknowledge() { return tr("Acknowledge indikasi", "Acknowledge indications") },
  get review() { return tr("Simpan hasil review", "Save review outcomes") },
  get "case.create"() { return tr("Buka kasus", "Open cases") },
  get "case.close"() { return tr("Tutup kasus", "Close cases") },
  get "action.create"() { return tr("Buat tindakan korektif", "Create corrective actions") },
  get "action.update"() { return tr("Perbarui tindakan", "Update actions") },
  get "action.verify"() { return tr("Verifikasi atau batalkan tindakan", "Verify or cancel actions") },
  get "clip.request"() { return tr("Minta klip dari edge", "Request clips from the edge") },
  get export() { return tr("Ekspor", "Export") },
}

/** `own` means only on records the user owns (an action assigned to them). */
type Grant = true | "own"

const matrix: Record<Role, Partial<Record<WorkflowAction, Grant>>> = {
  "super-admin": {
    acknowledge: true,
    review: true,
    "case.create": true,
    "case.close": true,
    "action.create": true,
    "action.update": true,
    "action.verify": true,
    "clip.request": true,
    export: true,
  },
  "hse-manager": {
    acknowledge: true,
    review: true,
    "case.create": true,
    "case.close": true,
    "action.create": true,
    "action.update": true,
    "action.verify": true,
    "clip.request": true,
    export: true,
  },
  "site-manager": { "case.create": true, "case.close": true, "action.create": true, export: true },
  "control-room": { acknowledge: true, review: true, "clip.request": true, export: true },
  "hse-officer": { acknowledge: true, review: true, "action.create": true, "action.update": "own", "clip.request": true, export: true },
  "area-supervisor": { "action.create": true, "action.update": "own", export: true },
  "it-ot": { "action.create": true, "action.update": "own", "clip.request": true, export: true },
  "admin-site": { export: true },
  viewer: { export: true },
}

/** Whether the role may do this at all. With `owner`, an "own only" grant also needs the user to be the owner. */
export function can(role: Role, action: WorkflowAction, owner?: { userId: string; ownerId: string }) {
  const grant = matrix[role][action]
  if (grant === "own") return owner ? owner.userId === owner.ownerId : true
  return grant === true
}

/** The roles that may do this, for the message shown when someone else presses the button. */
export const rolesThatCan = (action: WorkflowAction) => (Object.keys(matrix) as Role[]).filter((r) => matrix[r][action])
