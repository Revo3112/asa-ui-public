import { useState } from "react"
import { Button, Drawer } from "@heroui/react"
import { Link } from "react-router"

import { AuditTimeline } from "@/shared/components/audit-timeline"
import { ActionStatusChip } from "@/shared/components/status-chip"
import { ReasonForm } from "@/shared/components/workflow-forms"
import { auditOfAction, cancelAction, findAction, isOverdue, startAction, submitAction, userName, verifyAction } from "@/features/cases/data/kasus"
import { actionDone } from "@/shared/config/indikasi"
import type { Filters } from "@/shared/data/filters"
import { duration, useNow } from "@/shared/lib/time"
import { runWorkflow, useWorkflowVersion } from "@/shared/lib/workflow-ui"
import { locale, tr } from "@/shared/lib/i18n"

const fullTime = (d: Date) => d.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })

type Props = { filters: Pick<Filters, "site">; id?: string; isOpen: boolean; onOpenChange: (isOpen: boolean) => void }
type Form = "submit" | "verify" | "cancel"

/**
 * A corrective action's lifecycle: the owner starts and submits it with a completion note, and
 * someone else verifies it. Pending verification is not closed.
 */
export function TindakanDrawer({ filters, id, isOpen, onOpenChange }: Props) {
  useWorkflowVersion()
  const now = useNow(60_000)
  const [form, setForm] = useState<{ id?: string; kind: Form | null }>({ kind: null })
  const a = id ? findAction(filters, id) : undefined
  const open = form.id === id ? form.kind : null
  const show = (kind: Form | null) => setForm({ id, kind })
  const live = a && !actionDone.includes(a.status)
  const overdue = a ? isOverdue(a, now) : false
  const q = (params: Record<string, string>) => new URLSearchParams(params).toString()

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog>
          <Drawer.CloseTrigger />
          {!a ? (
            <Drawer.Body>{id && <p className="text-sm text-muted">{tr(`Tindakan ${id} tidak ditemukan.`, `Action ${id} not found.`)}</p>}</Drawer.Body>
          ) : (
            <>
              <Drawer.Header>
                <Drawer.Heading>{a.judul}</Drawer.Heading>
                <p className="text-sm text-muted">{tr("Tindakan korektif", "Corrective action")} · {a.id}</p>
              </Drawer.Header>
              <Drawer.Body className="flex flex-col gap-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted">Status</dt>
                  <dd>
                    <ActionStatusChip value={a.status} overdue={overdue} />
                  </dd>
                  <dt className="text-muted">PIC</dt>
                  <dd>{userName(a.ownerId)}</dd>
                  <dt className="text-muted">{tr("Tenggat", "Due")}</dt>
                  <dd className={overdue ? "text-danger" : undefined}>
                    {fullTime(a.tenggat)} · {a.tenggat.getTime() < now ? tr(`lewat ${duration(now - a.tenggat.getTime())}`, `${duration(now - a.tenggat.getTime())} late`) : tr(`${duration(a.tenggat.getTime() - now)} lagi`, `in ${duration(a.tenggat.getTime() - now)}`)}
                  </dd>
                  <dt className="text-muted">{tr("Dibuat", "Created")}</dt>
                  <dd>{fullTime(a.dibuat)}</dd>
                  {a.zona.label && (
                    <>
                      <dt className="text-muted">{tr("Zona", "Zone")}</dt>
                      <dd>{a.zona.label}</dd>
                    </>
                  )}
                  {a.caseId && (
                    <>
                      <dt className="text-muted">{tr("Kasus", "Case")}</dt>
                      <dd>
                        <Link to={`/kasus?${q({ site: a.site, id: a.caseId })}`} className="underline-offset-2 hover:underline">
                          {a.caseId}
                        </Link>
                      </dd>
                    </>
                  )}
                  {a.eventId && (
                    <>
                      <dt className="text-muted">{tr("Indikasi", "Indication")}</dt>
                      <dd>
                        <Link to={`/indikasi?${q({ site: a.site, id: a.eventId, periode: "30d", status: "semua" })}`} className="underline-offset-2 hover:underline">
                          {a.eventId}
                        </Link>
                      </dd>
                    </>
                  )}
                  {a.sumber && (
                    <>
                      <dt className="text-muted">{tr("Sumber", "Source")}</dt>
                      <dd>
                        <Link to={`/sumber?${q({ site: a.site, id: a.sumber })}`} className="underline-offset-2 hover:underline">
                          {a.sumber}
                        </Link>
                      </dd>
                    </>
                  )}
                  {a.catatanAwal && (
                    <>
                      <dt className="text-muted">{tr("Catatan awal", "Initial note")}</dt>
                      <dd>{a.catatanAwal}</dd>
                    </>
                  )}
                  {a.catatanSelesai && (
                    <>
                      <dt className="text-muted">{tr("Penyelesaian", "Completion")}</dt>
                      <dd>
                        {a.catatanSelesai}
                        {a.buktiRef && <span className="block text-muted">{tr("Bukti", "Evidence")}: {a.buktiRef}</span>}
                      </dd>
                    </>
                  )}
                  {a.verifierId && (
                    <>
                      <dt className="text-muted">{tr("Verifikator", "Verifier")}</dt>
                      <dd>
                        {userName(a.verifierId)}
                        {a.diverifikasi && ` · ${fullTime(a.diverifikasi)}`}
                      </dd>
                    </>
                  )}
                  {a.alasanBatal && (
                    <>
                      <dt className="text-muted">{tr("Dibatalkan", "Cancelled")}</dt>
                      <dd>{a.alasanBatal}</dd>
                    </>
                  )}
                </dl>

                {open === "submit" && (
                  <ReasonForm
                    title={tr("Ajukan verifikasi", "Submit for verification")}
                    label={tr("Catatan penyelesaian", "Completion note")}
                    action={tr("Ajukan", "Submit")}
                    extra={{ label: tr("Referensi bukti (opsional)", "Evidence reference (optional)") }}
                    onCancel={() => show(null)}
                    onSubmit={async (text, ref) => {
                      const done = await runWorkflow(() => submitAction(a.id, text, ref), tr("Diajukan untuk verifikasi.", "Submitted for verification."))
                      if (done) show(null)
                    }}
                  />
                )}
                {open === "verify" && (
                  <ReasonForm
                    title={tr("Verifikasi dan tutup", "Verify and close")}
                    label={tr("Hasil pengecekan", "Check result")}
                    action={tr("Verifikasi", "Verify")}
                    hint={tr(`Verifikator harus orang lain selain PIC (${userName(a.ownerId)}).`, `The verifier must be someone other than the owner (${userName(a.ownerId)}).`)}
                    onCancel={() => show(null)}
                    onSubmit={async (text) => {
                      const done = await runWorkflow(() => verifyAction(a.id, text), tr("Tindakan terverifikasi dan ditutup.", "Action verified and closed."))
                      if (done) show(null)
                    }}
                  />
                )}
                {open === "cancel" && (
                  <ReasonForm
                    title={tr("Batalkan tindakan", "Cancel action")}
                    label={tr("Alasan pembatalan", "Cancellation reason")}
                    action={tr("Batalkan tindakan", "Cancel action")}
                    danger
                    onCancel={() => show(null)}
                    onSubmit={async (text) => {
                      const done = await runWorkflow(() => cancelAction(a.id, text), tr("Tindakan dibatalkan.", "Action cancelled."))
                      if (done) show(null)
                    }}
                  />
                )}

                <AuditTimeline entries={auditOfAction(a)} />
              </Drawer.Body>
              <Drawer.Footer className="flex-wrap">
                <Button slot="close" variant="secondary">
                  {tr("Kembali", "Back")}
                </Button>
                {a.status === "assigned" && <Button onPress={() => runWorkflow(() => startAction(a.id), tr("Tindakan mulai dikerjakan.", "Work on the action started."))}>{tr("Mulai kerjakan", "Start work")}</Button>}
                {(a.status === "assigned" || a.status === "in-progress") && open !== "submit" && (
                  <Button variant={a.status === "in-progress" ? "primary" : "secondary"} onPress={() => show("submit")}>
                    {tr("Ajukan verifikasi", "Submit for verification")}
                  </Button>
                )}
                {a.status === "pending-verification" && open !== "verify" && <Button onPress={() => show("verify")}>{tr("Verifikasi", "Verify")}</Button>}
                {live && open !== "cancel" && (
                  <Button variant="tertiary" onPress={() => show("cancel")}>
                    {tr("Batalkan", "Cancel")}
                  </Button>
                )}
              </Drawer.Footer>
            </>
          )}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}
