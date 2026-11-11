import { actionStatusMeta, caseStatusMeta, outcomeMeta, workflowMeta } from "@/shared/config/indikasi"
import type { AuditEntry } from "@/shared/data/audit"
import { locale, tr } from "@/shared/lib/i18n"

const fullTime = (d: Date) => d.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })

/** Status ids from any of the workflow domains, in words. */
const labelOf = (v?: string) =>
  v && ((workflowMeta as Record<string, { label: string }>)[v] ?? (outcomeMeta as Record<string, { label: string }>)[v] ?? (caseStatusMeta as Record<string, { label: string }>)[v] ?? (actionStatusMeta as Record<string, { label: string }>)[v])?.label

/** A record's audit trail, oldest first: who did what, when, from which status to which, and why. */
export function AuditTimeline({ entries, title = tr("Jejak audit", "Audit trail") }: { entries: AuditEntry[]; title?: string }) {
  const id = `audit-${title.replace(/\W+/g, "-").toLowerCase()}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-sm font-medium">
        {title}
      </h3>
      <ol className="flex flex-col gap-2 border-l border-border pl-4 text-sm">
        {entries.map((h, i) => {
          const from = labelOf(h.dari)
          const to = labelOf(h.ke)
          return (
            <li key={i}>
              <p>
                {h.aksi} · {h.aktor}
              </p>
              {(from || to) && (
                <p className="text-muted">
                  {from ? `${from} → ` : "→ "}
                  {to ?? h.ke}
                </p>
              )}
              <p className="text-muted">{fullTime(h.at)}</p>
              {h.catatan && <p className="mt-1">“{h.catatan}”</p>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
