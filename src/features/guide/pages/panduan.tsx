import { Alert, buttonVariants, Card, Chip } from "@heroui/react"
import { AlarmClock, Backpack, BatteryLow, BrainCircuit, CalendarX, Cctv, Check, Cpu, Gauge, Hourglass, LayoutDashboard, MapPinned, Minus, RadioTower, Repeat, Satellite, ScrollText, ShieldCheck, SlidersHorizontal, TrendingUp, WifiOff } from "lucide-react"
import { Link } from "react-router"

import { DetectorStatusChip } from "@/shared/components/status-chip"
import { IconTile, type Tone } from "@/shared/components/visual"
import { InfoTip, Widget } from "@/shared/components/widget"
import { actionStatusMeta, caseStatusMeta, kategoriDefs, outcomeMeta, workflowMeta } from "@/shared/config/indikasi"
import { can, workflowActionLabel, type WorkflowAction } from "@/shared/auth/roles"
import { rules } from "@/shared/config/rules"
import { entitasLabel, useSessionAudit } from "@/shared/data/audit"
import { currentProfil, master, useMaster } from "@/shared/data/master"
import { allRoles, roleLabel as roles } from "@/shared/auth/session"
import { tr } from "@/shared/lib/i18n"
import { locale } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"
import { fillLastRow } from "@/shared/lib/grid"

// ---- Guided scenarios ----

type Scenario = { no: string; title: string; story: string; steps: string[]; start: { label: string; to: string } }

const q = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params)}`

/** Per data profile: the mine has the full set; the factory the ones its data can tell. */
// A function, so the texts follow the interface language.
const scenarios = (): Record<"tambang" | "pabrik", Scenario[]> => ({
  tambang: [
    {
      no: "01",
      title: tr("Loading Point 02: hotspot, kamera mati, indikasi kritis", "Loading Point 02: hotspot, dark camera, critical indication"),
      story: tr("Temuan APD berulang di Loading Point 02, CAM-14 offline, dan indikasi Kritis pagi ini yang belum di-acknowledge.", "Repeat PPE findings at Loading Point 02, CAM-14 offline, and a Critical indication this morning nobody has acknowledged."),
      steps: [
        tr("Pusat Keputusan: baca kartu “Belum ditangani” dan “Gap pemantauan”", "Decision Center: read the “Unhandled” and “Monitoring gap” cards"),
        tr("Buka IND-BRU-K001, minta klip dari edge", "Open IND-BRU-K001, request the clip from the edge"),
        tr("Acknowledge, lalu simpan review Terkonfirmasi dengan alasan", "Acknowledge, then save a Confirmed review with a reason"),
        tr("Buka kasus, buat tindakan untuk Area Supervisor", "Open a case, create an action for an Area Supervisor"),
        tr("Masuk sebagai Taufik untuk mengajukan, lalu sebagai Maya untuk memverifikasi", "Sign in as Taufik to submit, then as Maya to verify"),
      ],
      start: { label: tr("Mulai di Pusat Keputusan", "Start in the Decision Center"), to: "/keputusan" },
    },
    {
      no: "02",
      title: tr("Link Starlink putus, tidak ada yang hilang", "Starlink link down, nothing lost"),
      story: tr("SAT-02 putus sekitar dua jam semalam. Sembilan indikasi ditahan di antrean edge dan terkirim saat pulih; sekarang link menurun di bawah 5 Mbps dan thumbnail menyusul.", "SAT-02 dropped for about two hours overnight. Nine indications were held in the edge queue and delivered on recovery; now the link is below 5 Mbps and thumbnails follow later."),
      steps: [tr("Kesehatan Perangkat: grafik uplink 24 jam (nol saat putus)", "Device Health: 24-hour uplink chart (zero while down)"), tr("Jeda sinkron 24 jam: lonjakan saat antrean terkirim", "24-hour sync lag: the spike when the queue was delivered"), tr("Indikasi AI: urutkan kolom Asal, lihat IND-BRU-Q001…Q009", "AI Indications: sort the Origin column, see IND-BRU-Q001…Q009"), tr("Riwayat gangguan: HLT-003 dan HLT-004", "Disruption history: HLT-003 and HLT-004")],
      start: { label: tr("Buka Kesehatan Perangkat", "Open Device Health"), to: q("/sumber", { site: "berau" }) },
    },
    {
      no: "03",
      title: tr("Alarm palsu yang jadi keputusan tuning", "A false alarm that becomes a tuning decision"),
      story: tr("Detektor zona terlarang sering terpicu oleh petugas yang punya izin atau bayangan di malam hari, karena area dan jam aksesnya belum disetel. Review sebagai Alarm palsu dengan alasan, lalu lihat panel detektor menjadikannya kandidat tuning, bukan insiden.", "The restricted-zone detector often fires on permit holders or night shadows, because its areas and access hours aren't tuned yet. Review one as a False alarm with a reason, then see the detector panel turn it into a tuning candidate, not an incident."),
      steps: [tr("Indikasi AI: filter kategori Masuk zona terlarang", "AI Indications: filter the Restricted zone entry category"), tr("Review satu indikasi berskor rendah sebagai Alarm palsu", "Review a low-score indication as a False alarm"), tr("Kualitas Deteksi: panel Sinyal kinerja detektor", "Detection Quality: the Detector performance signal panel"), tr("Pusat Keputusan: kartu “Kandidat tuning”", "Decision Center: the “Tuning candidate” card")],
      start: { label: tr("Buka indikasi", "Open indications"), to: q("/indikasi", { kategori: "zona-terlarang", periode: "7d" }) },
    },
    {
      no: "04",
      title: tr("Dari angka ke keputusan manajemen", "From numbers to a management decision"),
      story: tr("Ranking risiko zona → zona teratas → brief dalam Bahasa Indonesia, lalu Inggris → tanya asisten “apa yang harus diputuskan sekarang?” → ekspor brief.", "Zone risk ranking → top zone → the brief in Indonesian, then English → ask the assistant “what should management decide now?” → export the brief."),
      steps: [tr("Analisis Risiko: klik baris teratas untuk rinciannya", "Risk Analysis: click the top row for its breakdown"), tr("Brief manajemen: ganti ke EN, lalu “Buat draf dengan AI”", "Management brief: switch to EN, then “Draft with AI”"), tr("AI Assistant: kartu “Keputusan sekarang”", "AI Assistant: the “Decisions now” card"), tr("Ekspor brief ke .md", "Export the brief to .md")],
      start: { label: tr("Buka Analisis Risiko", "Open Risk Analysis"), to: "/analisis" },
    },
    {
      no: "05",
      title: tr("Cakupan mengikuti front (Aegis Pole + Manpack)", "Coverage follows the front (Aegis Pole + Manpack)"),
      story: tr("POLE-02 di Pit Front Timur sibuk tapi baterainya tidak akan bertahan semalam; POLE-01 di Hutan Penyangga Cilegon tidak mendeteksi apa pun selama 8 hari; MANPACK-01 sedang patroli peledakan.", "POLE-02 at Pit Front Timur is busy but its battery won't last the night; POLE-01 in the Cilegon buffer forest has detected nothing for 8 days; MANPACK-01 is on blasting patrol."),
      steps: [tr("Kesehatan Perangkat: grafik baterai 24 jam, ambang 30%", "Device Health: 24-hour battery chart, 30% threshold"), tr("Pusat Keputusan: kartu “Risiko daya” dan “Relokasi POLE-01”", "Decision Center: the “Power risk” and “Relocate POLE-01” cards"), tr("Buat tindakan perawatan untuk POLE-02 dari drawer sumbernya", "Create a maintenance action for POLE-02 from its source drawer")],
      start: { label: tr("Buka Kesehatan Perangkat", "Open Device Health"), to: q("/sumber", { jenis: "aegis" }) },
    },
  ],
  pabrik: [
    {
      no: "01",
      title: tr("Loading Dock: indikasi kritis dan kamera mati", "Loading Dock: critical indication and dark cameras"),
      story: tr("Indikasi Kritis masuk zona terlarang di Loading Dock Cikarang belum di-acknowledge, sementara CAM-07 dan CAM-14 offline.", "A Critical restricted-zone entry at the Cikarang Loading Dock is unacknowledged, while CAM-07 and CAM-14 are offline."),
      steps: [tr("Pusat Keputusan: kartu “Belum ditangani”", "Decision Center: the “Unhandled” card"), tr("Buka IND-CKR-K001, acknowledge, review Terkonfirmasi", "Open IND-CKR-K001, acknowledge, review as Confirmed"), tr("Buka kasus dan buat tindakan korektif", "Open a case and create a corrective action"), tr("Verifikasi sebagai HSE Manager (bukan PIC)", "Verify as HSE Manager (not the owner)")],
      start: { label: tr("Mulai di Pusat Keputusan", "Start in the Decision Center"), to: "/keputusan" },
    },
    {
      no: "02",
      title: tr("Alarm palsu yang jadi keputusan tuning", "A false alarm that becomes a tuning decision"),
      story: tr("Review indikasi berskor rendah sebagai Alarm palsu; Kualitas Deteksi menunjukkan detektor mana yang perlu dituning.", "Review a low-score indication as a False alarm; Detection Quality shows which detector needs tuning."),
      steps: [tr("Indikasi AI: tab Menunggu review", "AI Indications: the Awaiting review tab"), tr("Simpan review Alarm palsu dengan alasan", "Save a False alarm review with a reason"), tr("Kualitas Deteksi: skor detektor vs hasil review", "Detection Quality: detector score vs review outcome")],
      start: { label: tr("Buka indikasi", "Open indications"), to: q("/indikasi", { periode: "7d" }) },
    },
    {
      no: "03",
      title: tr("Dari angka ke keputusan manajemen", "From numbers to a management decision"),
      story: tr("Ranking risiko zona, brief ID/EN, dan pertanyaan ke asisten.", "Zone risk ranking, the ID/EN brief, and questions to the assistant."),
      steps: [tr("Analisis Risiko: zona teratas", "Risk Analysis: the top zone"), tr("Brief manajemen: ekspor .md", "Management brief: export .md"), tr("AI Assistant: “Zona paling berisiko”", "AI Assistant: “Riskiest zones”")],
      start: { label: tr("Buka Analisis Risiko", "Open Risk Analysis"), to: "/analisis" },
    },
  ],
})

// ---- Responsibility split (neutral: no vendor names except ASA's own products) ----

const layers = () => [
  { icon: Cctv, layer: tr("Kamera cluster site", "Site camera cluster"), owner: "ASA / partner", scope: tr("CCTV tetap dan tilt-down di lokasi yang punya listrik dan jaringan; masuk ke server Axxon One / AI edge di site.", "Fixed and tilt-down CCTV where there is power and network; feeds the Axxon One / AI edge server on site.") },
  { icon: RadioTower, layer: tr("Aegis Intelligence Pole (produk ASA)", "Aegis Intelligence Pole (ASA product)"), owner: "ASA", scope: tr("Tiang teleskopik 3,5 m, kamera PTZ/IR/thermal, komputer edge dengan detektor AI, surya + LiFePO₄, terminal Starlink sendiri. Untuk front, pit, disposal tanpa listrik dan sinyal; dipindah mengikuti front, riwayat tetap per perangkat.", "3.5 m telescopic mast, PTZ/IR/thermal camera, edge computer running AI detectors, solar + LiFePO₄, its own Starlink terminal. For fronts, pits and disposals with no power or signal; moved as the front moves, history kept per device.") },
  { icon: Backpack, layer: tr("Manpack Surveillance (produk ASA)", "Manpack Surveillance (ASA product)"), owner: "ASA", scope: tr("Unit ransel: body cam, power station 300 Wh, surya, Starlink/4G. Untuk patroli, zona peledakan, inspeksi; event membawa GPS dan zona mobile.", "Backpack unit: body cam, 300 Wh power station, solar, Starlink/4G. For patrols, blasting zones and inspections; events carry GPS and a mobile zone.") },
  { icon: Cpu, layer: tr("Analitik AI dasar", "Base AI analytics"), owner: "Axxon", scope: tr("Detektor dasar di server site dan di komputer edge pole. Profil deployment di pole: perlu validasi.", "Base detectors on the site server and on the pole's edge computer. Deployment profile on the pole: needs validation.") },
  { icon: BrainCircuit, layer: tr("Analitik AI custom", "Custom AI analytics"), owner: "ASA", scope: tr("Model custom, tuning per site, dan seluruh integrasi deteksi ke dashboard.", "Custom models, per-site tuning, and all integration of detections into the dashboard.") },
  { icon: Satellite, layer: tr("Konektivitas", "Connectivity"), owner: "ASA (Starlink)", scope: tr("Backhaul Starlink per site. Uplink adalah batasannya: hanya event, thumbnail, dan klip on-demand; tidak ada streaming video ke HQ.", "Starlink backhaul per site. The uplink is the constraint: events, thumbnails and on-demand clips only; no video streaming to HQ.") },
  { icon: LayoutDashboard, layer: "Platform HSE Monitoring", owner: "ASA", scope: tr("Ingest event dari API Axxon One, alur review/kasus/tindakan, lapisan keputusan manajemen, multi-site, kesehatan sumber, ekspor, dan API ke sistem klien.", "Event ingestion from the Axxon One API, the review/case/action workflow, the management decision layer, multi-site, source health, exports and an API to client systems.") },
  { icon: ScrollText, layer: tr("SOP, aturan, peran, SLA", "SOPs, rules, roles, SLAs"), owner: tr("Klien", "Client"), scope: tr("Definisi zona, aturan APD, matriks severity, eskalasi, dan kriteria penerimaan.", "Zone definitions, PPE rules, severity matrix, escalation and acceptance criteria.") },
]

/** ASA's own layers in the brand colour, the vendor in grey, the client's in amber. */
const ownerTone = (owner: string): Tone => (/klien|client/i.test(owner) ? "warning" : /vendor/i.test(owner) ? "default" : "accent")

/** The rules from config/rules.ts as name + threshold tiles. */
const demoRules = () => {
  const r = rules
  return [
    { icon: AlarmClock, name: tr("SLA acknowledge (menit)", "Acknowledgement SLA (min)"), value: `K ${r.ackSlaMinutes.kritis} · T ${r.ackSlaMinutes.tinggi} · S ${r.ackSlaMinutes.sedang} · R ${r.ackSlaMinutes.rendah}` },
    { icon: Hourglass, name: tr("Belum ditangani", "Unhandled"), value: tr("Kritis/Tinggi, belum selesai review", "Critical/High, review not done") },
    { icon: CalendarX, name: tr("Tindakan overdue", "Overdue action"), value: tr("Tenggat lewat, belum diverifikasi", "Past due, not verified") },
    { icon: Repeat, name: tr("Temuan berulang", "Repeat finding"), value: tr(`≥ ${r.repeatFinding.count} dalam ${r.repeatFinding.days} hari`, `≥ ${r.repeatFinding.count} in ${r.repeatFinding.days} days`) },
    { icon: WifiOff, name: tr("Link menurun · kamera diam", "Link degraded · camera stale"), value: tr(`< ${r.linkDegradedMbps} Mbps · ${r.cameraStaleMinutes} menit`, `< ${r.linkDegradedMbps} Mbps · ${r.cameraStaleMinutes} min`) },
    { icon: BatteryLow, name: tr("Risiko daya", "Power risk"), value: tr(`< ${r.powerRisk.socPercent}% atau < ${r.powerRisk.runtimeHours} jam`, `< ${r.powerRisk.socPercent}% or < ${r.powerRisk.runtimeHours} h`) },
    { icon: MapPinned, name: tr("Pole idle", "Idle pole"), value: tr(`0 indikasi ${r.idlePole.quietDays} hari, terpasang > ${r.idlePole.deployedDays} hari`, `0 indications ${r.idlePole.quietDays} d, deployed > ${r.idlePole.deployedDays} d`) },
    { icon: SlidersHorizontal, name: tr("Kandidat tuning", "Tuning candidate"), value: tr(`Alarm palsu ≥ ${r.tuningCandidate.share * 100}%, ≥ ${r.tuningCandidate.minReviews} review`, `False alarms ≥ ${r.tuningCandidate.share * 100}%, ≥ ${r.tuningCandidate.minReviews} reviews`) },
    { icon: TrendingUp, name: tr("Anomali", "Anomaly"), value: tr(`24 jam ≥ ${r.anomaly.ratio}× rata-rata ${r.anomaly.baselineDays} hari`, `24 h ≥ ${r.anomaly.ratio}× ${r.anomaly.baselineDays}-day mean`) },
    { icon: Gauge, name: tr("Bobot skor risiko", "Risk score weights"), value: `${r.riskWeights.volume} · ${r.riskWeights.severity} · ${r.riskWeights.repeat} · ${r.riskWeights.trend} · ${r.riskWeights.coverage} · ${r.riskWeights.lingkungan}` },
  ]
}

const actions = Object.keys(workflowActionLabel) as WorkflowAction[]

/**
 * Presenter guide: the scenarios to walk, who delivers what, what the detectors can and cannot do,
 * every rule the dashboard applies, which demo account can do what, and this session's audit
 * timeline. Turn the module off before a client goes live.
 */
export function PanduanPage() {
  // Reads the master store during render, which the React Compiler would cache once.
  "use no memo"
  useMaster()
  const audit = useSessionAudit()
  const profil = currentProfil()
  const users = master().pengguna.filter((u) => u.aktif)

  return (
    <div className="flex flex-col gap-4">

      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{tr("Data sintetis · khusus presenter", "Synthetic data · presenter only")}</Alert.Title>
          <Alert.Description>{tr("Integrasi Axxon One, link Starlink, dan telemetri daya belum tersambung. Matikan modul ini sebelum dipakai klien.", "Axxon One, Starlink links and power telemetry are not connected. Turn this module off before clients use it.")}</Alert.Description>
        </Alert.Content>
      </Alert>

      <Widget title={tr("Skenario terpandu", "Guided scenarios")} description={profil === "tambang" ? tr("Lima alur untuk demo profil Pertambangan.", "Five walkthroughs for the Mining profile demo.") : tr("Tiga alur untuk profil Pabrik. Ganti ke profil Pertambangan di Pengaturan → Profil data untuk skenario link Starlink dan Aegis Pole.", "Three walkthroughs for the Factory profile. Switch to the Mining profile in Settings → Data profile for the Starlink-link and Aegis Pole scenarios.")}>
        <ol className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-3", fillLastRow(scenarios()[profil].length))}>
          {scenarios()[profil].map((s) => (
            <li key={s.no}>
              <Card className="h-full border border-border shadow-none">
                <Card.Header className="gap-1">
                  <p className="text-xs text-muted tabular-nums">{tr("Skenario", "Scenario")} {s.no}</p>
                  <Card.Title render={(props) => <h3 {...props} />}>{s.title}</Card.Title>
                  <Card.Description>{s.story}</Card.Description>
                </Card.Header>
                <Card.Content className="flex flex-1 flex-col gap-3 text-sm">
                  <ol className="flex flex-col">
                    {s.steps.map((step, i) => (
                      <li key={step} className="relative flex gap-3 pb-3 last:pb-0">
                        {i < s.steps.length - 1 && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" aria-hidden />}
                        <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground tabular-nums">{i + 1}</span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <Link to={s.start.to} className={buttonVariants({ size: "sm", className: "mt-auto self-start" })}>
                    {s.start.label}
                  </Link>
                </Card.Content>
              </Card>
            </li>
          ))}
        </ol>
      </Widget>

      <div className="grid gap-4 xl:grid-cols-2">
        <Widget title={tr("Pembagian tanggung jawab", "Responsibility split")} description={tr("Siapa mengerjakan apa dalam arsitektur yang diusulkan.", "Who delivers what in the proposed architecture.")}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {layers().map((l) => (
              <li key={l.layer} className="flex items-start gap-3 rounded-xl bg-default/60 p-3">
                <IconTile icon={l.icon} tone={ownerTone(l.owner)} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-start gap-1 text-sm font-medium">
                    <span className="min-w-0 flex-1">{l.layer}</span>
                    <InfoTip label={l.layer}>{l.scope}</InfoTip>
                  </span>
                  <Chip size="sm" color={ownerTone(l.owner) === "warning" ? "warning" : ownerTone(l.owner) === "accent" ? "accent" : "default"} className="self-start">
                    {l.owner}
                  </Chip>
                </span>
              </li>
            ))}
          </ul>
        </Widget>

        <div className="flex flex-col gap-4">
          <Widget title={tr("Status kapabilitas detektor", "Detector capability status")} description={tr("Native = tersedia di Axxon One menurut dokumentasi publik; Perlu validasi = butuh konfigurasi, kalibrasi, atau pengembangan khusus.", "Native = available in Axxon One per public documentation; Needs validation = requires configuration, calibration or custom work.")}>
            <ul className="flex flex-col divide-y divide-border text-sm">
              {kategoriDefs.map((k) => (
                <li key={k.id} className="flex items-center gap-2 py-2 first:pt-0">
                  <span className="min-w-0 flex-1 truncate font-medium">{k.label}</span>
                  <InfoTip label={k.label}>
                    {k.detektor}. {k.catatan}
                  </InfoTip>
                  <DetectorStatusChip value={k.status} />
                </li>
              ))}
            </ul>
          </Widget>

          <Widget title={tr("Aturan demo (ilustratif)", "Demo rules (illustrative)")} description={tr("Setiap sinyal yang dihitung dashboard memakai salah satu aturan ini. Nilainya ada di src/shared/config/rules.ts, bukan di komponen.", "Every signal the dashboard computes uses one of these rules. The values live in src/shared/config/rules.ts, not in components.")}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {demoRules().map((x) => (
                <li key={x.name} className="flex items-start gap-2.5 rounded-xl bg-default/60 p-2.5">
                  <IconTile icon={x.icon} size="sm" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs text-muted">{x.name}</span>
                    <span className="text-sm font-medium tabular-nums">{x.value}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-2 text-xs text-muted">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
              {tr("Kartu keputusan = rekomendasi. Kasus tidak dibuka otomatis; verifikator ≠ PIC.", "Decision cards are recommendations. Cases never open on their own; verifier ≠ owner.")}
            </p>
          </Widget>
        </div>
      </div>

      <Widget title={tr("Akun demo dan hak akses", "Demo accounts and access")} description={tr("Semua akun memakai kata sandi demo123. Tombol tetap bisa ditekan di semua role; role yang tidak berhak mendapat pesan siapa yang boleh.", "Every account uses the password demo123. Buttons stay pressable for every role; a role that may not act is told who can.")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-normal">Akun</th>
                <th scope="col" className="py-2 pr-3 font-normal">Role</th>
                {actions.map((a) => (
                  <th key={a} scope="col" className="px-1 py-2 text-center text-xs font-normal">
                    {workflowActionLabel[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allRoles.map((role) => {
                const people = users.filter((u) => u.role === role)
                return (
                  <tr key={role}>
                    <td className="py-2 pr-3">{people.map((u) => u.email).join(", ") || <span className="text-muted">—</span>}</td>
                    <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap">
                      {roles[role]}
                    </th>
                    {actions.map((a) => {
                      const own = can(role, a) && !can(role, a, { userId: "x", ownerId: "y" })
                      return (
                        <td key={a} className="px-1 py-2 text-center">
                          {own ? <span className="text-xs">{tr("milik sendiri", "own only")}</span> : can(role, a) ? <Check className="mx-auto size-4 text-success" aria-label={tr("Boleh", "Allowed")} /> : <Minus className="mx-auto size-4 text-muted" aria-label={tr("Tidak", "Not allowed")} />}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Widget>

      <Widget title={tr("Timeline audit sesi ini", "This session's audit timeline")} description={tr("Append-only. Setiap perubahan status dari demo ini tercatat dengan aktor, waktu, dan alasannya. Hilang saat halaman dimuat ulang.", "Append-only. Every status change in this demo is recorded with actor, time and reason. Cleared on reload.")} action={<Chip size="sm">{tr("Sesi ini saja", "This session only")}</Chip>}>
        {audit.length === 0 ? (
          <p className="text-sm text-muted">{tr("Belum ada perubahan. Coba acknowledge atau review satu indikasi.", "No changes yet. Try acknowledging or reviewing an indication.")}</p>
        ) : (
          <ol className="flex flex-col gap-2 border-l border-border pl-4 text-sm">
            {audit.map((e, i) => {
              const label = { ...workflowMeta, ...outcomeMeta, ...caseStatusMeta, ...actionStatusMeta } as Record<string, { label: string }>
              const path = e.entitas === "kasus" ? "/kasus" : e.entitas === "tindakan" ? "/tindakan" : "/indikasi"
              const id = e.entitas === "temuan" ? e.id.replace(/^TMN-/, "").replace(/-r\w+$/, "") : e.id
              return (
                <li key={i}>
                  <p>
                    <span className="text-muted">{entitasLabel[e.entitas]}</span>{" "}
                    <Link to={q(path, { id, periode: "30d", status: "semua" })} className="font-medium text-link underline-offset-2 hover:underline">
                      {e.id}
                    </Link>{" "}
                    · {e.aksi} · {e.aktor}
                    {e.ke && <span className="text-muted"> → {label[e.ke]?.label ?? e.ke}</span>}
                  </p>
                  <p className="text-muted">{e.at.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
                  {e.catatan && <p className="mt-1">“{e.catatan}”</p>}
                </li>
              )
            })}
          </ol>
        )}
      </Widget>
    </div>
  )
}
