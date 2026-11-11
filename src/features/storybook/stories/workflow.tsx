// #region import
import { ActionStatusChip, CaseStatusChip, DetectorStatusChip, OutcomeChip, SourceStatusChip, WorkflowChip } from "@/shared/components/status-chip"
import { AuditTimeline } from "@/shared/components/audit-timeline"
import { RegisterTable, type Column } from "@/shared/components/register-table"
import { ReasonForm, ReviewForm } from "@/shared/components/workflow-forms"
import { actionDone, actionStatusMeta, caseStatusMeta, outcomeMeta, sourceStatusMeta, workflowMeta, type ActionStatus, type CaseStatus, type Outcome, type SourceStatus, type Workflow } from "@/shared/config/indikasi"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./workflow.tsx?raw"

// #region chips
function StatusDomains() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted">Progres review</span>
        {(Object.keys(workflowMeta) as Workflow[]).map((w) => (
          <WorkflowChip key={w} value={w} />
        ))}
      </p>
      <p className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted">Hasil review</span>
        {(Object.keys(outcomeMeta) as Outcome[]).map((o) => (
          <OutcomeChip key={o} value={o} />
        ))}
      </p>
      <p className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted">Kasus</span>
        {(Object.keys(caseStatusMeta) as CaseStatus[]).map((c) => (
          <CaseStatusChip key={c} value={c} />
        ))}
      </p>
      <p className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted">Tindakan</span>
        {(Object.keys(actionStatusMeta) as ActionStatus[]).map((a) => (
          <ActionStatusChip key={a} value={a} />
        ))}
        <ActionStatusChip value="in-progress" overdue />
      </p>
      <p className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted">Sumber</span>
        {(Object.keys(sourceStatusMeta) as SourceStatus[]).map((s) => (
          <SourceStatusChip key={s} value={s} />
        ))}
      </p>
      <p className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted">Detektor</span>
        <DetectorStatusChip value="native" />
        <DetectorStatusChip value="validasi" />
      </p>
    </div>
  )
}
// #endregion

// #region timeline
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000)

function Timeline() {
  return (
    <AuditTimeline
      entries={[
        { at: minutesAgo(48), aktor: "Sistem", aksi: "Terdeteksi oleh Gerakan di zona terlarang di EDGE-02" },
        { at: minutesAgo(47), aktor: "Sistem", aksi: "Diterima di control room lewat SAT-02, jeda 10 detik" },
        { at: minutesAgo(40), aktor: "Oki Pratama", aksi: "Acknowledge", dari: "new", ke: "acknowledged" },
        { at: minutesAgo(31), aktor: "Oki Pratama", aksi: "Review selesai", dari: "acknowledged", ke: "review-completed", catatan: "Pekerja masuk jalur kendaraan tanpa izin." },
        { at: minutesAgo(12), aktor: "Maya Putri", aksi: "Masuk kasus KSS-BRU-007", dari: "review-completed", ke: "case-open" },
      ]}
    />
  )
}
// #endregion

// #region table
type Row = { id: string; judul: string; status: ActionStatus; tenggat: Date }
const rows: Row[] = [
  { id: "TND-001", judul: "Pasang barikade jarak aman", status: "in-progress", tenggat: minutesAgo(-600) },
  { id: "TND-002", judul: "Briefing ulang aturan akses zona", status: "assigned", tenggat: minutesAgo(1500) },
  { id: "TND-003", judul: "Periksa daya CAM-14", status: "pending-verification", tenggat: minutesAgo(-60) },
]
const columns: Column<Row>[] = [
  { id: "id", label: "ID", render: (r) => <span className="text-muted">{r.id}</span>, compare: (a, b) => a.id.localeCompare(b.id) },
  { id: "judul", label: "Tindakan", isRowHeader: true, render: (r) => r.judul },
  { id: "status", label: "Status", render: (r) => <ActionStatusChip value={r.status} overdue={r.tenggat.getTime() < Date.now() && !actionDone.includes(r.status)} /> },
  { id: "tenggat", label: "Tenggat", render: (r) => r.tenggat.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), compare: (a, b) => a.tenggat.getTime() - b.tenggat.getTime() },
]

function Register() {
  return <RegisterTable label="Contoh register" rows={rows} columns={columns} rowId={(r) => r.id} rowText={(r) => r.judul} defaultSort={{ column: "tenggat", direction: "ascending" }} minWidth="min-w-[36rem]" onOpen={() => {}} />
}
// #endregion

// #region forms
function Forms() {
  const wait = () => new Promise((resolve) => setTimeout(resolve, 600))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ReviewForm isRevision={false} onSubmit={wait} />
      <ReasonForm title="Verifikasi dan tutup" label="Hasil pengecekan" action="Verifikasi" onSubmit={wait} onCancel={() => {}} />
    </div>
  )
}
// #endregion

export function WorkflowStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Komponen alur review: lima domain status yang tidak pernah dicampur, jejak audit, tabel register, dan form yang wajib alasan. Label dan warna dibaca dari <Code>src/shared/config/indikasi.ts</Code>.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example title="Chip status" description="Progres review ≠ hasil review ≠ status kasus ≠ status tindakan ≠ status sumber. Overdue tampil di samping status tindakan karena ia turunan dari tenggat." code={snippet(source, "chips")}>
        <StatusDomains />
      </Example>
      <Example title="Jejak audit" description="Urut kronologis: aksi, aktor, perpindahan status, dan alasan." code={snippet(source, "timeline")}>
        <Timeline />
      </Example>
      <Props
        title="Props AuditTimeline"
        rows={[
          ["entries", "AuditEntry[]", "{ at, aktor, aksi, dari?, ke?, catatan? }. dari/ke berisi id status dari domain mana pun."],
          ["title?", "string", "Judul bagian. Bawaan “Jejak audit”."],
        ]}
      />
      <Example title="Tabel register" description="Kolom bisa diurutkan bila punya compare; baris membuka drawer lewat onOpen; selectable + bulk menambah aksi massal." code={snippet(source, "table")}>
        <Register />
      </Example>
      <Example title="Form review dan alasan" description="Tombol simpan aktif setelah isian memenuhi aturan yang sama dengan API (alasan minimal 10 karakter)." code={snippet(source, "forms")}>
        <Forms />
      </Example>
    </>
  )
}
