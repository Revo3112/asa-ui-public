import { useState } from "react"
import { Button, buttonVariants, Drawer } from "@heroui/react"
import { Link } from "react-router"

import { AuditTimeline } from "@/shared/components/audit-timeline"
import { SeverityChip } from "@/shared/components/severity-chip"
import { ActionStatusChip, CaseStatusChip, OutcomeChip } from "@/shared/components/status-chip"
import { NewActionForm, ReasonForm } from "@/shared/components/workflow-forms"
import { actionDone } from "@/shared/config/indikasi"
import { findIndication, findingById } from "@/features/indications/data/indikasi"
import { actionOwners, actionsOf, auditOfCase, closeCase, createAction, findCase, isOverdue, startInvestigation, userName } from "@/features/cases/data/kasus"
import type { Filters } from "@/shared/data/filters"
import { isModuleOn } from "@/shared/data/settings"
import { useNow } from "@/shared/lib/time"
import { dueDate, runWorkflow, useWorkflowVersion } from "@/shared/lib/workflow-ui"
import { locale, tr } from "@/shared/lib/i18n"

const fullTime = (d: Date) => d.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })
const shortDate = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

type Props = { filters: Pick<Filters, "site">; id?: string; isOpen: boolean; onOpenChange: (isOpen: boolean) => void }

/** A case: the findings it holds, its actions, and closing it once every action is done. */
export function KasusDrawer({ filters, id, isOpen, onOpenChange }: Props) {
  useWorkflowVersion()
  const now = useNow(60_000)
  const [form, setForm] = useState<{ id?: string; kind: "action" | "close" | null }>({ kind: null })
  const c = id ? findCase(filters, id) : undefined
  const open = form.id === id ? form.kind : null
  const show = (kind: "action" | "close" | null) => setForm({ id, kind })
  const actions = c ? actionsOf(c.site).filter((a) => a.caseId === c.id) : []
  const stillOpen = actions.filter((a) => !actionDone.includes(a.status))
  const q = (params: Record<string, string>) => new URLSearchParams(params).toString()

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog>
          <Drawer.CloseTrigger />
          {!c ? (
            <Drawer.Body>{id && <p className="text-sm text-muted">{tr(`Kasus ${id} tidak ditemukan.`, `Case ${id} not found.`)}</p>}</Drawer.Body>
          ) : (
            <>
              <Drawer.Header>
                <Drawer.Heading>{c.judul}</Drawer.Heading>
                <p className="text-sm text-muted">
                  {tr("Kasus", "Case")} · {c.id} · {c.jenis}
                </p>
              </Drawer.Header>
              <Drawer.Body className="flex flex-col gap-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted">Status</dt>
                  <dd>
                    <CaseStatusChip value={c.status} />
                  </dd>
                  <dt className="text-muted">{tr("Prioritas", "Priority")}</dt>
                  <dd>
                    <SeverityChip severity={c.prioritas} />
                  </dd>
                  <dt className="text-muted">{tr("Pemilik", "Owner")}</dt>
                  <dd>{userName(c.ownerId)}</dd>
                  <dt className="text-muted">{tr("Zona", "Zone")}</dt>
                  <dd>{c.zona.label}</dd>
                  <dt className="text-muted">{tr("Dibuka", "Opened")}</dt>
                  <dd>{fullTime(c.dibuka)}</dd>
                  {c.ditutup && (
                    <>
                      <dt className="text-muted">{tr("Ditutup", "Closed")}</dt>
                      <dd>
                        {fullTime(c.ditutup)}
                        {c.rationaleTutup && <span className="block">“{c.rationaleTutup}”</span>}
                      </dd>
                    </>
                  )}
                </dl>
                {c.ringkasan && <p className="text-sm">{c.ringkasan}</p>}

                <section aria-labelledby="kasus-temuan" className="flex flex-col gap-2">
                  <h3 id="kasus-temuan" className="text-sm font-medium">
                    {tr("Temuan terkait", "Linked findings")} ({c.findingIds.length})
                  </h3>
                  <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
                    {c.eventIds.map((eventId, i) => {
                      const e = findIndication(filters, eventId)
                      const f = findingById(c.findingIds[i])
                      return (
                        <li key={eventId} className="flex flex-wrap items-center gap-2 p-3">
                          <Link to={isModuleOn("indikasi") ? `/indikasi?${q({ site: c.site, id: eventId, periode: "30d", status: "semua" })}` : "#"} className="font-medium underline-offset-2 hover:underline">
                            {eventId}
                          </Link>
                          <span className="min-w-0 flex-1 text-muted">{e ? `${e.judul} · ${shortDate(e.waktu)}` : ""}</span>
                          {f && <OutcomeChip value={f.outcome} />}
                        </li>
                      )
                    })}
                  </ul>
                </section>

                <section aria-labelledby="kasus-tindakan" className="flex flex-col gap-2">
                  <h3 id="kasus-tindakan" className="text-sm font-medium">
                    {tr("Tindakan korektif", "Corrective actions")} ({actions.length})
                  </h3>
                  {actions.length ? (
                    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
                      {actions.map((a) => (
                        <li key={a.id} className="flex flex-col gap-1 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={`/tindakan?${q({ site: a.site, id: a.id })}`} className="font-medium underline-offset-2 hover:underline">
                              {a.id}
                            </Link>
                            <span className="min-w-0 flex-1">{a.judul}</span>
                            <ActionStatusChip value={a.status} overdue={isOverdue(a, now)} />
                          </div>
                          <span className="text-muted">
                            {userName(a.ownerId)} · {tr("tenggat", "due")} {shortDate(a.tenggat)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">{tr("Belum ada tindakan.", "No actions yet.")}</p>
                  )}
                </section>

                {open === "action" && (
                  <NewActionForm
                    owners={actionOwners(c.site).map((u) => ({ id: u.id, label: u.nama }))}
                    onCancel={() => show(null)}
                    onSubmit={async (d) => {
                      const done = await runWorkflow(() => createAction({ judul: d.judul, ownerId: d.ownerId, tenggat: dueDate(d.due), catatanAwal: d.catatanAwal, caseId: c.id }), tr("Tindakan ditugaskan.", "Action assigned."))
                      if (done) show(null)
                    }}
                  />
                )}
                {open === "close" && (
                  <ReasonForm
                    title={tr("Tutup kasus", "Close case")}
                    label={tr("Alasan penutupan", "Closing reason")}
                    action={tr("Tutup kasus", "Close case")}
                    hint={stillOpen.length ? tr(`Masih ada ${stillOpen.length} tindakan terbuka; kasus baru bisa ditutup setelah semuanya terverifikasi atau dibatalkan.`, `${stillOpen.length} actions are still open; the case can only close once all are verified or cancelled.`) : undefined}
                    onCancel={() => show(null)}
                    onSubmit={async (text) => {
                      const done = await runWorkflow(() => closeCase(c.id, text), tr("Kasus ditutup.", "Case closed."))
                      if (done) show(null)
                    }}
                  />
                )}

                <AuditTimeline entries={auditOfCase(c)} />
              </Drawer.Body>
              <Drawer.Footer className="flex-wrap">
                <Button slot="close" variant="secondary">
                  {tr("Kembali", "Back")}
                </Button>
                {c.status === "open" && <Button onPress={() => runWorkflow(() => startInvestigation(c.id), tr("Investigasi dimulai.", "Investigation started."))}>{tr("Mulai investigasi", "Start investigation")}</Button>}
                {c.status !== "closed" && isModuleOn("tindakan") && open !== "action" && (
                  <Button variant="secondary" onPress={() => show("action")}>
                    {tr("Buat tindakan", "Create action")}
                  </Button>
                )}
                {c.status !== "closed" && open !== "close" && (
                  <Button variant="secondary" onPress={() => show("close")}>
                    {tr("Tutup kasus", "Close case")}
                  </Button>
                )}
                {isModuleOn("tindakan") && actions.length > 0 && (
                  <Link to={`/tindakan?${q({ site: c.site, q: c.id, status: "semua" })}`} className={buttonVariants({ variant: "tertiary" })}>
                    {tr("Semua tindakan kasus ini", "All actions of this case")}
                  </Link>
                )}
              </Drawer.Footer>
            </>
          )}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}
