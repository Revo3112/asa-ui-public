import { useState } from "react"
import { Alert, Button, buttonVariants, Description, Drawer } from "@heroui/react"
import { Link } from "react-router"

import { AuditTimeline } from "@/shared/components/audit-timeline"
import { EvidenceViewer } from "@/features/events/components/event-drawer"
import { SeverityChip } from "@/shared/components/severity-chip"
import { DetectorStatusChip, OutcomeChip, WorkflowChip } from "@/shared/components/status-chip"
import { NewActionForm, NewCaseForm, ReviewForm } from "@/shared/components/workflow-forms"
import { severityMeta } from "@/shared/config/events"
import { clipStateLabel, kategoriDef, pendingReview, tierLabel } from "@/shared/config/indikasi"
import { rules } from "@/shared/config/rules"
import { shiftLabel } from "@/features/ppe/data/apd"
import { acknowledge, auditOfIndication, findIndication, findingById, findingOf, requestClip, startReview, submitReview } from "@/features/indications/data/indikasi"
import { actionOwners, caseOwners, createAction, createCase } from "@/features/cases/data/kasus"
import type { Filters } from "@/shared/data/filters"
import { isModuleOn } from "@/shared/data/settings"
import { slaBreached } from "@/shared/lib/rules"
import { duration, useNow } from "@/shared/lib/time"
import { dueDate, runWorkflow, useWorkflowVersion } from "@/shared/lib/workflow-ui"
import { locale, tr } from "@/shared/lib/i18n"

const fullTime = (d: Date) => d.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "medium" })
const lagText = (s: number) => (s < 120 ? tr(`${s} detik`, `${s} s`) : tr(`${Math.round(s / 60)} menit`, `${Math.round(s / 60)} min`))

type Props = {
  filters: Pick<Filters, "site">
  /** Keep passing the last id after closing so the drawer has content while it slides out. */
  id?: string
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

/**
 * One indication end to end: evidence and where it came from, the review, then a case or a
 * corrective action. Every button is pressable; a role that may not do it gets told who can.
 */
export function IndikasiDrawer({ filters, id, isOpen, onOpenChange }: Props) {
  // Reads the indication store during render (review and clip state change in place), which the React Compiler would cache.
  "use no memo"
  useWorkflowVersion()
  const now = useNow(30_000)
  // The clip lands a few seconds after the request; this re-renders when it does.
  const [, setClipTick] = useState(0)
  const [form, setForm] = useState<{ id?: string; kind: "case" | "action" | null }>({ kind: null })
  const e = id ? findIndication(filters, id) : undefined
  const finding = e && findingOf(e)
  const previous = finding?.supersedes ? findingById(finding.supersedes) : undefined
  const open = form.id === id ? form.kind : null
  const show = (kind: "case" | "action" | null) => setForm({ id, kind })

  if (!e)
    return (
      <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Body>{id && <p className="text-sm text-muted">{tr(`Indikasi ${id} tidak ditemukan.`, `Indication ${id} not found.`)}</p>}</Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    )

  const def = kategoriDef(e.kategori)
  const breached = slaBreached({ severity: e.severity, t: e.waktu.getTime(), ackAt: e.ackAt?.getTime() }, now)
  const waiting = pendingReview.includes(e.workflow)
  const canOpenCase = isModuleOn("kasus") && finding?.outcome === "confirmed" && e.workflow !== "case-open" && !e.caseIds.length
  const people = (list: { id: string; nama: string }[]) => list.map((u) => ({ id: u.id, label: u.nama }))

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog>
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading>{e.judul}</Drawer.Heading>
            <p className="text-sm text-muted">
              {tr("Indikasi AI", "AI indication")} · {e.id}
            </p>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <EvidenceViewer src={e.thumbnail === "synced" ? e.bukti : undefined} alt={`Thumbnail ${e.judul}, ${e.kamera}`} label={def.label} />
              <Description>
                {e.thumbnail === "queued" ? tr("Thumbnail masih di antrean edge, menyusul setelah event.", "The thumbnail is still in the edge queue, following the event.") : tr(`Thumbnail ≤ ${rules.thumbnailMaxKb} KB ikut bersama event.`, `A thumbnail ≤ ${rules.thumbnailMaxKb} KB rides with the event.`)} {tr("Klip", "Clip")}: {clipStateLabel[e.clip]}.
              </Description>
              {e.clip === "on-edge" && (
                <Button size="sm" variant="secondary" className="self-start" onPress={() => runWorkflow(() => requestClip(e.id, () => setClipTick((n) => n + 1)), tr("Klip diminta dari edge. Muncul di sini begitu terunggah.", "Clip requested from the edge. It shows here once uploaded.")).then(() => setClipTick((n) => n + 1))}>
                  {tr("Minta klip dari edge", "Request clip from edge")}
                </Button>
              )}
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{tr("Progres review", "Review progress")}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <WorkflowChip value={e.workflow} />
                {waiting && <span className={breached ? "text-danger" : "text-muted"}>{breached ? tr(`SLA ${e.slaMenit} menit terlewat`, `${e.slaMenit}-min SLA missed`) : tr(`SLA ${e.slaMenit} menit`, `${e.slaMenit}-min SLA`)}</span>}
              </dd>
              <dt className="text-muted">Severity</dt>
              <dd>
                <SeverityChip severity={e.severity} />
              </dd>
              <dt className="text-muted">{tr("Detektor", "Detector")}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {e.detektor} <DetectorStatusChip value={def.status} />
              </dd>
              <dt className="text-muted">{tr("Skor detektor", "Detector score")}</dt>
              <dd>
                {e.confidence.toLocaleString(locale(), { minimumFractionDigits: 2 })} <span className="text-muted">{tr("(skor model, bukan akurasi)", "(model score, not accuracy)")}</span>
              </dd>
              <dt className="text-muted">{tr("Zona", "Zone")}</dt>
              <dd>{e.zona.label}</dd>
              <dt className="text-muted">{tr("Kamera", "Camera")}</dt>
              <dd>{e.kamera}</dd>
              <dt className="text-muted">{tr("Sumber", "Source")}</dt>
              <dd>
                {tierLabel[e.tier]}
                {e.perangkat && ` · ${e.perangkat}`}
              </dd>
              <dt className="text-muted">{tr("Jalur", "Route")}</dt>
              <dd>
                {e.uplink || tr("Jaringan site", "Site network")} · {tr("jeda sinkron", "sync lag")} {lagText(e.syncLagDetik)}
                {e.syncLagDetik > 300 && <span className="block text-muted">{tr("Tertahan di antrean edge selama link putus, terkirim lengkap saat pulih.", "Held in the edge queue while the link was down, delivered in full on recovery.")}</span>}
              </dd>
              <dt className="text-muted">{tr("Terdeteksi", "Detected")}</dt>
              <dd>{fullTime(e.waktu)} {tr("(jam edge)", "(edge clock)")}</dd>
              <dt className="text-muted">{tr("Diterima", "Received")}</dt>
              <dd>{fullTime(e.diterima)} {tr("(jam HQ)", "(HQ clock)")}</dd>
              <dt className="text-muted">Shift</dt>
              <dd>{shiftLabel(e.shift)}</dd>
              {e.ackAt && (
                <>
                  <dt className="text-muted">Acknowledge</dt>
                  <dd>
                    {e.ackBy} · {duration(e.ackAt.getTime() - e.waktu.getTime())} {tr("setelah terdeteksi", "after detection")}
                  </dd>
                </>
              )}
            </dl>

            {finding && (
              <section aria-labelledby="temuan" className="flex flex-col gap-2 rounded-xl bg-default/50 p-3 text-sm">
                <h3 id="temuan" className="font-medium">
                  {tr("Temuan", "Finding")} {finding.id}
                </h3>
                <p className="flex flex-wrap items-center gap-2">
                  <OutcomeChip value={finding.outcome} /> {finding.reviewer} · {fullTime(finding.at)}
                </p>
                <p>“{finding.rationale}”</p>
                {previous && (
                  <p className="text-muted">
                    {tr("Menggantikan", "Replaces")} {previous.id} ({previous.reviewer}, {fullTime(previous.at)}).
                  </p>
                )}
              </section>
            )}

            {(e.caseIds.length > 0 || e.actionIds.length > 0) && (
              <div className="flex flex-wrap gap-2 text-sm">
                {e.caseIds.map((c) => (
                  <Link key={c} to={`/kasus?${new URLSearchParams({ site: e.site, id: c })}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
                    {tr("Kasus", "Case")} {c}
                  </Link>
                ))}
                {e.actionIds.map((a) => (
                  <Link key={a} to={`/tindakan?${new URLSearchParams({ site: e.site, id: a })}`} className={buttonVariants({ size: "sm", variant: "tertiary" })}>
                    {tr("Tindakan", "Action")} {a}
                  </Link>
                ))}
              </div>
            )}

            {e.workflow === "case-open" ? (
              <Alert status="accent">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{tr("Indikasi ini ada di kasus terbuka. Perubahan hasil review dilakukan lewat kasusnya.", "This indication is in an open case. Change the review outcome through the case.")}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : (
              <ReviewForm key={`${e.id}|${finding?.id ?? ""}`} isRevision={!!finding} onSubmit={(o, r) => runWorkflow(() => submitReview(e.id, o, r), tr("Review tersimpan.", "Review saved."))} />
            )}

            {open === "case" && (
              <NewCaseForm
                initial={{
                  judul: `${def.label} · ${e.zona.label}`,
                  jenis: def.label,
                  prioritas: e.severity,
                  ownerId: "",
                  ringkasan: tr(`Dibuka dari temuan terkonfirmasi ${finding?.id} di ${e.zona.label}.`, `Opened from confirmed finding ${finding?.id} at ${e.zona.label}.`),
                }}
                owners={people(caseOwners(e.site))}
                onCancel={() => show(null)}
                onSubmit={async (d) => {
                  const done = await runWorkflow(() => createCase({ ...d, eventIds: [e.id] }), tr("Kasus dibuka.", "Case opened."))
                  if (done) show(null)
                }}
              />
            )}
            {open === "action" && (
              <NewActionForm
                owners={people(actionOwners(e.site))}
                onCancel={() => show(null)}
                onSubmit={async (d) => {
                  const done = await runWorkflow(
                    () => createAction({ judul: d.judul, ownerId: d.ownerId, tenggat: dueDate(d.due), catatanAwal: d.catatanAwal, eventId: e.id, caseId: e.caseIds.at(-1) }),
                    tr("Tindakan ditugaskan.", "Action assigned."),
                  )
                  if (done) show(null)
                }}
              />
            )}

            <AuditTimeline entries={auditOfIndication(e)} />
            <p className="text-xs text-muted">{tr(`Data simulasi. ${severityMeta[e.severity].label} dipetakan dari kategori dan risiko zona.`, `Simulated data. ${severityMeta[e.severity].label} is mapped from the category and zone risk.`)}</p>
          </Drawer.Body>
          <Drawer.Footer className="flex-wrap">
            <Button slot="close" variant="secondary">
              {tr("Kembali", "Back")}
            </Button>
            {e.workflow === "new" && <Button onPress={() => runWorkflow(() => acknowledge([e.id]), tr("Indikasi di-acknowledge.", "Indication acknowledged."))}>Acknowledge</Button>}
            {(e.workflow === "new" || e.workflow === "acknowledged") && (
              <Button variant="secondary" onPress={() => runWorkflow(() => startReview(e.id), tr("Review dimulai.", "Review started."))}>
                {tr("Mulai review", "Start review")}
              </Button>
            )}
            {canOpenCase && open !== "case" && (
              <Button variant="secondary" onPress={() => show("case")}>
                {tr("Buka kasus", "Open case")}
              </Button>
            )}
            {isModuleOn("tindakan") && finding?.outcome === "confirmed" && open !== "action" && (
              <Button variant="secondary" onPress={() => show("action")}>
                {tr("Buat tindakan", "Create action")}
              </Button>
            )}
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}
