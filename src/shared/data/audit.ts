/**
 * Append-only audit trail for indications, findings, cases and actions. Every status change goes
 * through `record`, with actor, time, old and new value.
 *
 * A record's history is derived from its own timestamps until the first change in this session;
 * from then on the derived entries are kept and new ones appended, the same way event histories
 * work in data/events.ts.
 *
 * ponytail: memory only, gone on reload. The real one is the `audit_log` table, append-only.
 */

import { useSyncExternalStore } from "react"
import { tr } from "@/shared/lib/i18n"

export type Entitas = "indikasi" | "temuan" | "kasus" | "tindakan"

export const entitasLabel: Record<Entitas, string> = { get indikasi() { return tr("Indikasi", "Indication") }, get temuan() { return tr("Temuan", "Finding") }, get kasus() { return tr("Kasus", "Case") }, get tindakan() { return tr("Tindakan", "Action") } }

export type AuditEntry = { at: Date; aktor: string; aksi: string; dari?: string; ke?: string; catatan?: string }
export type SessionEntry = AuditEntry & { entitas: Entitas; id: string }

const stored = new Map<string, AuditEntry[]>()
let session: SessionEntry[] = []
const listeners = new Set<() => void>()

/** The record's trail: stored once it has changed, otherwise derived from its fields. */
export const auditTrail = (id: string, derive: () => AuditEntry[]) => stored.get(id) ?? derive()

/** Appends one entry to the record's trail and to the session timeline. */
export function record(entitas: Entitas, id: string, derive: () => AuditEntry[], entry: AuditEntry) {
  stored.set(id, [...auditTrail(id, derive), entry])
  session = [{ ...entry, entitas, id }, ...session]
  listeners.forEach((l) => l())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Everything changed in this browser session, newest first. */
export const getSessionAudit = () => session
export const useSessionAudit = () => useSyncExternalStore(subscribe, getSessionAudit)
