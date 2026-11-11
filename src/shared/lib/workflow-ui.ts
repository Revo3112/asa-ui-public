import { toast } from "@heroui/react"

import { useSessionAudit } from "@/shared/data/audit"
import type { Option } from "@/shared/data/filters"
import { tr } from "@/shared/lib/i18n"

/**
 * Bumps whenever anything in the review workflow changes in this session (every change writes an
 * audit entry), so widgets can reload in place with `useWidgetData(…, version)`.
 */
export const useWorkflowVersion = () => useSessionAudit().length

/**
 * Runs a workflow call and reports the outcome. Buttons stay pressable for every role: when the
 * role may not do it, the API's 403 names the roles that can, and that becomes the toast.
 */
export async function runWorkflow<T>(call: () => Promise<T>, success: string): Promise<T | undefined> {
  try {
    const result = await call()
    toast.success(success)
    return result
  } catch (e) {
    toast.danger(e instanceof Error ? e.message : tr("Belum tersimpan. Coba lagi.", "Not saved. Try again."))
    return undefined
  }
}

const DAY = 86_400_000

/** Due date choices for a new action: today at 17.00, then whole days ahead at 17.00. */
export const dueOptions: Option[] = [
  { id: "0", get label() { return tr("Hari ini 17.00", "Today 17:00") } },
  { id: "1", get label() { return tr("Besok", "Tomorrow") } },
  { id: "3", get label() { return tr("3 hari", "3 days") } },
  { id: "7", get label() { return tr("7 hari", "7 days") } },
  { id: "14", get label() { return tr("14 hari", "14 days") } },
]

export function dueDate(days: string) {
  const d = new Date(Date.now() + Number(days) * DAY)
  d.setHours(17, 0, 0, 0)
  return d
}
