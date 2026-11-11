/**
 * What the decision page shows: site health, the action-led KPIs, the decision cards the rules
 * raise, the priority queue, and the panels behind them. Every number is computed from the same
 * records the registers list, with the rules in lib/rules.ts, so a card can always be traced to the
 * rows it counts. `?demo=` works as on Overview.
 */

import { severityMeta, type Severity } from "@/shared/config/events"
import { actionDone, kategoriDefs, pendingReview, type Kategori, type SourceStatus } from "@/shared/config/indikasi"
import { rules } from "@/shared/config/rules"
import { findingOf, indicationsIn, toRule, type AiEvent } from "@/features/indications/data/indikasi"
import { actionsIn, isOverdue } from "@/features/cases/data/kasus"
import { master, siteName } from "@/shared/data/master"
import { periodDays, type Filters } from "@/shared/data/filters"
import { respond } from "@/shared/data/mock-api"
import { placeLabel, placesIn, sitesIn } from "@/shared/data/scope"
import { sourcesIn, syncLagToday, type Source } from "@/features/devices/data/sumber"
import { envExposure } from "@/features/environment/data/lingkungan"
import { isModuleOn } from "@/shared/data/settings"
import {
  anomalies,
  detectorSignals,
  idlePole,
  isLinkDegraded,
  isUnhandled,
  nightSlaGap,
  powerRisk,
  repeatFindings,
  slaBreached,
  slaBySeverity,
  zoneRiskScores,
  type ZoneScore,
} from "@/shared/lib/rules"
import { tr } from "@/shared/lib/i18n"
import { duration } from "@/shared/lib/time"
import { locale } from "@/shared/lib/i18n"

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const allIn = (f: Filters, days?: number) => indicationsIn(f, days ? { from: Date.now() - days * DAY } : {})

// ---- Links ----

/** A query string for another page, carrying the site so the record is found where it lives. */
const href = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params)}`
export const indicationHref = (e: Pick<AiEvent, "id" | "site">) => href("/indikasi", { site: e.site, id: e.id, periode: "30d" })

// ---- Site cards ----

export type SiteCard = {
  site: string
  nama: string
  uplink?: Source
  edge?: Source
  devices: Source[]
  cameras: { online: number; total: number; down: string[] }
  lagP50?: number
  queue: number
  status: SourceStatus
}

const median = (xs: number[]) => {
  if (!xs.length) return undefined
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function siteCards(f: Filters): SiteCard[] {
  const sources = sourcesIn({ ...f, zona: "all" })
  const lags = syncLagToday({ ...f, zona: "all" })
  return sitesIn(f).map((site) => {
    const here = sources.filter((s) => s.site === site)
    const cams = here.filter((s) => s.jenis === "kamera")
    const devices = here.filter((s) => s.jenis === "aegis" || s.jenis === "manpack")
    const uplink = here.find((s) => s.jenis === "uplink")
    const edge = here.find((s) => s.jenis === "edge")
    const infra = [uplink, edge, ...devices].filter(Boolean) as Source[]
    const worst = infra.some((s) => s.status === "offline") ? "offline" : infra.some((s) => s.status === "degraded") || cams.some((c) => c.status !== "online") ? "degraded" : "online"
    return {
      site,
      nama: siteName(site),
      uplink,
      edge,
      devices,
      cameras: { online: cams.filter((c) => c.status === "online").length, total: cams.length, down: cams.filter((c) => c.status !== "online").map((c) => c.id) },
      lagP50: median(lags.filter((l) => l.site === site).map((l) => l.lag)),
      queue: infra.reduce((sum, s) => sum + (s.telemetry.queue ?? 0), 0),
      status: worst,
    }
  })
}

// ---- KPIs ----

export type Kpis = {
  unhandled: number
  unhandledBreached: number
  pendingReview: number
  oldestPending?: Date
  overdue: number
  openActions: number
  gaps: number
  gapIds: string[]
}

export function kpis(f: Filters): Kpis {
  const now = Date.now()
  // Snapshot KPIs: whatever is waiting now, from the last 30 days, not only what arrived in the period.
  const events = allIn(f, 30)
  const unhandled = events.filter((e) => isUnhandled(e))
  const pending = events.filter((e) => pendingReview.includes(e.workflow))
  const actions = actionsIn({ ...f, periode: "30d" })
  const open = actions.filter((a) => !actionDone.includes(a.status))
  const gaps = sourcesIn(f).filter((s) => s.status !== "online")
  return {
    unhandled: unhandled.length,
    unhandledBreached: unhandled.filter((e) => slaBreached({ severity: e.severity, t: e.waktu.getTime(), ackAt: e.ackAt?.getTime() }, now)).length,
    pendingReview: pending.length,
    oldestPending: pending.at(-1)?.waktu,
    overdue: open.filter((a) => isOverdue(a, now)).length,
    openActions: open.length,
    gaps: gaps.length,
    gapIds: gaps.map((s) => s.id),
  }
}

// ---- Zone risk ----

/** The explainable 0–100 score per zone, as of `asOf` (now, or a week ago for the comparison). */
export function zoneScores(f: Filters, asOf = Date.now()): ZoneScore[] {
  const events = allIn(f, 35).filter((e) => e.waktu.getTime() <= asOf)
  const sources = asOf === Date.now() ? sourcesIn(f) : []
  return zoneScoresFrom(f, events, sources, asOf)
}

export function zoneScoresFrom(f: Filters, events: AiEvent[], sources: Source[], asOf: number): ZoneScore[] {
  // Only what was known at `asOf`, so the score a week ago doesn't count this week's findings.
  const rows = events
    .map(toRule)
    .filter((r) => r.t <= asOf)
    .map((r) => (r.reviewedAt !== undefined && r.reviewedAt > asOf ? { ...r, outcome: undefined } : r))
  const withEnv = isModuleOn("environment")
  const inputs = placesIn(f).map(({ site, zona }) => {
    const here = rows.filter((r) => r.site === site && r.zona === zona)
    const confirmed = here.filter((r) => r.outcome === "confirmed" && r.t >= asOf - rules.riskVolumeDays * DAY)
    const week = here.filter((r) => r.outcome === "confirmed" && r.t >= asOf - rules.repeatFinding.days * DAY)
    const perCat = new Map<string, number>()
    for (const r of week) perCat.set(r.kategori, (perCat.get(r.kategori) ?? 0) + 1)
    const zoneSources = sources.filter((s) => s.site === site && s.zona?.id === zona)
    const env = withEnv ? envExposure(site, zona, asOf - 7 * DAY, asOf, rules.riskEnv.warnWeight) : { sensors: 0, exposure: 0 }
    return {
      site,
      zona,
      confirmed: confirmed.length,
      urgent: confirmed.filter((r) => r.severity === "kritis" || r.severity === "tinggi").length,
      maxSameCategory7d: Math.max(0, ...perCat.values()),
      last7: here.filter((r) => r.t >= asOf - 7 * DAY).length,
      prev7: here.filter((r) => r.t >= asOf - 14 * DAY && r.t < asOf - 7 * DAY).length,
      offlineSources: zoneSources.filter((s) => s.status === "offline").length,
      degradedSources: zoneSources.filter((s) => s.status === "degraded").length,
      envExposure: env.exposure,
      envSensors: env.sensors,
    }
  })
  return zoneRiskScores(inputs)
}

// ---- Decision cards ----

export type DecisionTone = "danger" | "warning" | "accent"

/** What raised the card, for its icon. */
export type DecisionKind = "sla" | "repeat" | "camera" | "link" | "power" | "idle" | "overdue" | "tuning" | "night" | "anomaly"

/**
 * The card's headline number. `bar` draws a filled track (value of max); `compare` draws two bars
 * side by side, such as night vs day or the last 24 h vs the baseline.
 */
export type DecisionMetric = {
  value: string
  label: string
  bar?: { value: number; max: number }
  compare?: { a: number; b: number; aLabel: string; bLabel: string; format?: "pct" }
}

export type Decision = {
  id: string
  kind: DecisionKind
  metric: DecisionMetric
  /** Short facts shown as chips: a camera, a zone, a status. */
  facts: string[]
  severity?: Severity
  /** The rule that raised it, in words, so nobody has to guess why the card is there. */
  rule: string
  tone: DecisionTone
  title: string
  evidence: string
  refs: { id: string; href: string }[]
  recommendation: string
  owner: string
  cta: { label: string; href: string }
  /** Time since detection against the acknowledgement SLA, for SLA cards. */
  sla?: { elapsedMs: number; limitMs: number }
  /** Where the source sits, for camera cards (the title carries it too). */
  place?: string
  /** A count of more cards like the ones before it, not a decision of its own. */
  rollup?: boolean
}

const toneRank: Record<DecisionTone, number> = { danger: 0, warning: 1, accent: 2 }
/** Detector names start capitalised; mid-sentence they shouldn't. */
/** One decimal in the UI language: 2,4 in Indonesian, 2.4 in English. */
const dec1 = (n: number) => n.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1)
const kategoriLabel = (k: string) => kategoriDefs.find((d) => d.id === k)?.label ?? k

/**
 * Every card the rules raise right now, most urgent first. Recommendations, never automatic
 * actions. Repeating rules are capped so one busy site can't push everything else off the page.
 */
export function decisions(f: Filters): Decision[] {
  const now = Date.now()
  const events = allIn(f, 35)
  const rows = events.map(toRule)
  const sources = sourcesIn(f)
  const cards: Decision[] = []
  const place = (site: string, zona: string) => placeLabel(f, site, zona)

  // 1. Kritis/Tinggi past its acknowledgement SLA with nobody on it.
  const breached = events
    .filter((e) => isUnhandled(e) && slaBreached({ severity: e.severity, t: e.waktu.getTime(), ackAt: e.ackAt?.getTime() }, now))
    .sort((a, b) => severityMeta[a.severity].rank - severityMeta[b.severity].rank || a.waktu.getTime() - b.waktu.getTime())
  for (const e of breached.slice(0, 2)) {
    cards.push({
      id: `sla-${e.id}`,
      kind: "sla",
      severity: e.severity,
      metric: { value: duration(now - e.waktu.getTime()), label: tr(`sejak deteksi · SLA ${rules.ackSlaMinutes[e.severity]} menit`, `since detection · SLA ${rules.ackSlaMinutes[e.severity]} min`), bar: { value: 1, max: 1 } },
      facts: [e.kamera, e.workflow === "new" ? tr("Belum di-acknowledge", "Not acknowledged") : tr("Belum direview", "Not reviewed")],
      rule: tr(`Belum ditangani: ${severityMeta[e.severity].label} melewati SLA acknowledge ${rules.ackSlaMinutes[e.severity]} menit`, `Unhandled: ${severityMeta[e.severity].label} past the ${rules.ackSlaMinutes[e.severity]}-min acknowledgement SLA`),
      tone: "danger",
      title: tr(`${e.judul} di ${place(e.site, e.zona.id)}`, `${e.judul} at ${place(e.site, e.zona.id)}`),
      evidence: tr(`${severityMeta[e.severity].label}, terdeteksi ${duration(now - e.waktu.getTime())} lalu oleh ${e.kamera}, status ${e.workflow === "new" ? "belum di-acknowledge" : "belum direview"}.`, `${severityMeta[e.severity].label}, detected ${duration(now - e.waktu.getTime())} ago by ${e.kamera}, ${e.workflow === "new" ? "not yet acknowledged" : "not yet reviewed"}.`),
      refs: [{ id: e.id, href: indicationHref(e) }],
      recommendation: tr("Acknowledge dan review sekarang; minta klip bila thumbnail tidak cukup.", "Acknowledge and review now; request the clip if the thumbnail isn't enough."),
      owner: tr("Operator Control Room", "Control Room Operator"),
      cta: { label: tr("Buka indikasi", "Open indication"), href: indicationHref(e) },
      sla: { elapsedMs: now - e.waktu.getTime(), limitMs: rules.ackSlaMinutes[e.severity] * MINUTE },
    })
  }
  if (breached.length > 2)
    cards.push({
      id: "sla-more",
      kind: "sla",
      metric: { value: String(breached.length), label: tr("indikasi Kritis/Tinggi lewat SLA", "Critical/High indications past SLA") },
      facts: [tr(`${breached.filter((e) => e.severity === "kritis").length} Kritis`, `${breached.filter((e) => e.severity === "kritis").length} Critical`), tr(`${breached.filter((e) => e.severity === "tinggi").length} Tinggi`, `${breached.filter((e) => e.severity === "tinggi").length} High`)],
      rule: tr("Belum ditangani: Kritis/Tinggi melewati SLA acknowledge", "Unhandled: Critical/High past the acknowledgement SLA"),
      tone: "danger",
      title: tr(`${breached.length - 2} indikasi Kritis/Tinggi lain melewati SLA`, `${breached.length - 2} more Critical/High indications past SLA`),
      evidence: tr(`Total ${breached.length} indikasi Kritis/Tinggi menunggu melewati SLA.`, `${breached.length} Critical/High indications in total are waiting past SLA.`),
      refs: breached.slice(2, 7).map((e) => ({ id: e.id, href: indicationHref(e) })),
      recommendation: tr("Tambah reviewer di shift ini atau eskalasi ke HSE Manager.", "Add a reviewer this shift or escalate to the HSE Manager."),
      owner: "HSE Manager",
      cta: { label: tr("Lihat antrean", "See the queue"), href: href("/indikasi", { status: "sla", periode: "30d" }) },
      rollup: true,
    })

  // 2. Repeat findings.
  const repeats = repeatFindings(rows, now)
  for (const g of repeats.slice(0, 2)) {
    cards.push({
      id: `repeat-${g.site}-${g.zona}-${g.kategori}`,
      kind: "repeat",
      metric: { value: String(g.count), label: tr(`temuan terkonfirmasi · ${rules.repeatFinding.days} hari`, `confirmed findings · ${rules.repeatFinding.days} days`), bar: { value: g.count, max: Math.max(g.count, rules.repeatFinding.count * 4) } },
      facts: [kategoriLabel(g.kategori), tr(`ambang ${rules.repeatFinding.count}`, `threshold ${rules.repeatFinding.count}`)],
      rule: tr(`Temuan berulang: ≥ ${rules.repeatFinding.count} terkonfirmasi, site + zona + kategori sama, ${rules.repeatFinding.days} hari`, `Repeat finding: ≥ ${rules.repeatFinding.count} confirmed, same site + zone + category, ${rules.repeatFinding.days} days`),
      tone: "warning",
      title: tr(`${kategoriLabel(g.kategori)} berulang di ${place(g.site, g.zona)}`, `${kategoriLabel(g.kategori)} repeating at ${place(g.site, g.zona)}`),
      evidence: tr(`${g.count} temuan terkonfirmasi dalam ${rules.repeatFinding.days} hari terakhir.`, `${g.count} confirmed findings in the last ${rules.repeatFinding.days} days.`),
      refs: g.ids.slice(0, 5).map((id) => ({ id, href: href("/indikasi", { site: g.site, id, periode: "30d" }) })),
      recommendation: tr("Buka kasus dan tetapkan tindakan korektif dengan PIC dan tenggat; cek apakah rambu atau barikade perlu diperbarui.", "Open a case and set corrective actions with an owner and due date; check whether signs or barriers need renewing."),
      owner: "HSE Manager",
      cta: { label: tr("Lihat temuan", "See findings"), href: href("/indikasi", { site: g.site, zona: f.site === "all" ? `${g.site}/${g.zona}` : g.zona, kategori: g.kategori, periode: "7d", status: "selesai" }) },
    })
  }
  if (repeats.length > 2)
    cards.push({
      id: "repeat-more",
      kind: "repeat",
      metric: { value: String(repeats.length - 2), label: tr("pola berulang lain", "more repeating patterns") },
      facts: repeats.slice(2, 5).map((g) => `${kategoriLabel(g.kategori)} · ${g.count}`),
      rule: tr(`Temuan berulang: ≥ ${rules.repeatFinding.count} terkonfirmasi dalam ${rules.repeatFinding.days} hari`, `Repeat finding: ≥ ${rules.repeatFinding.count} confirmed within ${rules.repeatFinding.days} days`),
      tone: "warning",
      title: tr(`${repeats.length - 2} pola berulang lain`, `${repeats.length - 2} more repeating patterns`),
      evidence: repeats
        .slice(2, 6)
        .map((g) => tr(`${kategoriLabel(g.kategori)} di ${place(g.site, g.zona)} (${g.count})`, `${kategoriLabel(g.kategori)} at ${place(g.site, g.zona)} (${g.count})`))
        .join(", "),
      refs: [],
      recommendation: tr("Tinjau di Analisis dan prioritaskan zona dengan skor risiko tertinggi.", "Review in Analysis and prioritise the zones with the highest risk score."),
      owner: "HSE Manager",
      cta: { label: tr("Lihat indikasi", "See indications"), href: href("/indikasi", { periode: "7d", status: "selesai" }) },
      rollup: true,
    })

  // 3. Monitoring gaps: a dark camera where findings repeat matters more than one in an office.
  for (const s of sources.filter((x) => x.jenis === "kamera" && x.status === "offline")) {
    const busy = repeats.some((g) => g.site === s.site && g.zona === s.zona?.id)
    cards.push({
      id: `cam-${s.id}`,
      kind: "camera",
      metric: { value: duration(now - s.lastSeen.getTime()), label: tr("offline", "offline") },
      facts: [s.id, ...(busy ? [tr("Zona temuan berulang", "Repeat-finding zone")] : [])],
      rule: tr("Gap pemantauan: kamera offline", "Monitoring gap: camera offline") + (busy ? tr(" di zona dengan temuan berulang", " in a zone with repeat findings") : ""),
      tone: busy ? "danger" : "warning",
      title: tr(`${s.id} offline di ${s.zona ? place(s.site, s.zona.id) : siteName(s.site)}`, `${s.id} offline at ${s.zona ? place(s.site, s.zona.id) : siteName(s.site)}`),
      evidence: tr(`Offline sejak ${duration(now - s.lastSeen.getTime())} lalu. ${s.alasan ?? ""} Indikasi dari kamera ini tidak akan muncul sampai pulih.`, `Offline for ${duration(now - s.lastSeen.getTime())}. ${s.alasan ?? ""} No indication will come from this camera until it recovers.`),
      refs: [{ id: s.id, href: href("/sumber", { site: s.site, id: s.id }) }],
      recommendation: busy
        ? sources.some((x) => x.site === s.site && (x.jenis === "manpack" || x.jenis === "aegis"))
          ? tr("Pulihkan hari ini atau pindahkan pengawasan sementara (Manpack/pole) ke zona ini.", "Restore it today or move temporary coverage (Manpack/pole) to this zone.")
          : tr("Pulihkan hari ini; sementara itu tambah patroli pengawas di zona ini.", "Restore it today; meanwhile add supervisor patrols in this zone.")
        : tr("Jadwalkan pemeriksaan daya dan stream.", "Schedule a power and stream check."),
      owner: "IT/OT Admin",
      cta: { label: tr("Buka sumber", "Open source"), href: href("/sumber", { site: s.site, id: s.id }) },
      place: s.zona ? place(s.site, s.zona.id) : siteName(s.site),
    })
  }
  for (const s of sources.filter((x) => x.jenis === "uplink" && (x.status !== "online" || isLinkDegraded(x.telemetry.uplinkMbps)))) {
    cards.push({
      id: `link-${s.id}`,
      kind: "link",
      metric: { value: `${s.telemetry.uplinkMbps ?? 0} Mbps`, label: tr(`uplink · ambang ${rules.linkDegradedMbps} Mbps`, `uplink · threshold ${rules.linkDegradedMbps} Mbps`), bar: { value: s.telemetry.uplinkMbps ?? 0, max: rules.linkDegradedMbps * 4 } },
      facts: [`${s.telemetry.latencyMs ?? "?"} ms`, tr(`${s.telemetry.queue ?? 0} di antrean edge`, `${s.telemetry.queue ?? 0} in edge queue`)],
      rule: tr(`Gap pemantauan: uplink di bawah ${rules.linkDegradedMbps} Mbps atau putus`, `Monitoring gap: uplink below ${rules.linkDegradedMbps} Mbps or down`),
      tone: s.status === "offline" ? "danger" : "warning",
      title: tr(`Link ${s.id} ${s.status === "offline" ? "putus" : "menurun"} di ${siteName(s.site)}`, `Link ${s.id} ${s.status === "offline" ? "down" : "degraded"} at ${siteName(s.site)}`),
      evidence: tr(`Uplink ${s.telemetry.uplinkMbps ?? "?"} Mbps, latensi ${s.telemetry.latencyMs ?? "?"} ms, ${s.telemetry.queue ?? 0} item di antrean edge. Event tetap terkirim lebih dulu, thumbnail menyusul.`, `Uplink ${s.telemetry.uplinkMbps ?? "?"} Mbps, latency ${s.telemetry.latencyMs ?? "?"} ms, ${s.telemetry.queue ?? 0} items in the edge queue. Events still go first, thumbnails follow.`),
      refs: [{ id: s.id, href: href("/sumber", { site: s.site, id: s.id }) }],
      recommendation: tr("Pantau jeda sinkron; tunda permintaan klip yang tidak mendesak sampai link pulih.", "Watch the sync lag; hold non-urgent clip requests until the link recovers."),
      owner: "IT/OT Admin",
      cta: { label: tr("Buka sumber", "Open source"), href: href("/sumber", { site: s.site, id: s.id }) },
    })
  }

  // 4. Poles and Manpacks: power and placement.
  const scores = zoneScoresFrom(f, events, sources, now)
  for (const s of sources.filter((x) => x.jenis === "aegis" || x.jenis === "manpack")) {
    const d = { id: s.id, site: s.site, jenis: s.jenis, battery: s.telemetry.battery, runtimeHours: s.telemetry.runtimeHours, dipasang: s.dipasang?.getTime(), lastIndication: s.lastIndication?.getTime() }
    if (powerRisk(d))
      cards.push({
        id: `power-${s.id}`,
        kind: "power",
        metric: { value: `${s.telemetry.battery ?? 0}%`, label: tr(`baterai · runtime ${s.telemetry.runtimeHours ?? "?"} jam`, `battery · ${s.telemetry.runtimeHours ?? "?"} h runtime`), bar: { value: s.telemetry.battery ?? 0, max: 100 } },
        facts: [s.id, tr(`Surya ${s.telemetry.solarW ?? 0} W`, `Solar ${s.telemetry.solarW ?? 0} W`)],
        rule: tr(`Risiko daya: baterai < ${rules.powerRisk.socPercent}% atau runtime pole < ${rules.powerRisk.runtimeHours} jam`, `Power risk: battery < ${rules.powerRisk.socPercent}% or pole runtime < ${rules.powerRisk.runtimeHours} h`),
        tone: "danger",
        title: tr(`${s.id} diperkirakan padam sebelum pagi`, `${s.id} expected to go dark before morning`),
        evidence: tr(
          `Baterai ${s.telemetry.battery}%, surya ${s.telemetry.solarW} W, perkiraan runtime ${s.telemetry.runtimeHours} jam. ${s.zona ? `Zona ${place(s.site, s.zona.id)} kehilangan pengawasan bila padam.` : ""}`,
          `Battery ${s.telemetry.battery}%, solar ${s.telemetry.solarW} W, estimated runtime ${s.telemetry.runtimeHours} h. ${s.zona ? `${place(s.site, s.zona.id)} loses coverage if it goes dark.` : ""}`,
        ),
        refs: [{ id: s.id, href: href("/sumber", { site: s.site, id: s.id }) }],
        recommendation: tr("Kirim baterai cadangan atau genset portabel sebelum gelap; Edge Agent sudah masuk mode hemat daya.", "Send a spare battery or portable generator before dark; the Edge Agent is already in power-saving mode."),
        owner: "IT/OT Admin",
        cta: { label: tr("Buka sumber", "Open source"), href: href("/sumber", { site: s.site, id: s.id }) },
      })
    if (idlePole(d, now)) {
      const covered = new Set(sources.filter((x) => x.jenis === "aegis" && x.zona).map((x) => `${x.site}/${x.zona!.id}`))
      const target = scores.find((z) => z.site === s.site && !covered.has(`${z.site}/${z.zona}`))
      cards.push({
        id: `idle-${s.id}`,
        kind: "idle",
        metric: { value: duration(now - (s.lastIndication?.getTime() ?? now)), label: tr("tanpa indikasi", "without an indication") },
        facts: [s.id, ...(target ? [tr(`Tujuan: skor ${target.score}`, `Target: score ${target.score}`)] : [])],
        rule: tr(`Pole idle: 0 indikasi ${rules.idlePole.quietDays} hari dan terpasang > ${rules.idlePole.deployedDays} hari`, `Idle pole: 0 indications in ${rules.idlePole.quietDays} days and deployed > ${rules.idlePole.deployedDays} days`),
        tone: "accent",
        title: tr(`Relokasi ${s.id}${target ? ` ke ${place(target.site, target.zona)}` : ""}`, `Relocate ${s.id}${target ? ` to ${place(target.site, target.zona)}` : ""}`),
        evidence: tr(
          `Tidak ada indikasi sejak ${duration(now - (s.lastIndication?.getTime() ?? now))} lalu di ${s.zona ? place(s.site, s.zona.id) : siteName(s.site)}.${target ? ` ${place(target.site, target.zona)} punya skor risiko ${target.score} dan belum dijaga pole.` : ""}`,
          `No indication for ${duration(now - (s.lastIndication?.getTime() ?? now))} at ${s.zona ? place(s.site, s.zona.id) : siteName(s.site)}.${target ? ` ${place(target.site, target.zona)} has a risk score of ${target.score} and no pole yet.` : ""}`,
        ),
        refs: [{ id: s.id, href: href("/sumber", { site: s.site, id: s.id }) }],
        recommendation: tr("Pindahkan pole mengikuti front kerja; riwayat tetap tersimpan per perangkat.", "Move the pole with the working front; history stays kept per device."),
        owner: "Site Manager",
        cta: { label: tr("Buka sumber", "Open source"), href: href("/sumber", { site: s.site, id: s.id }) },
      })
    }
  }

  // 5. Overdue corrective actions.
  const overdue = actionsIn({ ...f, periode: "30d" }).filter((a) => isOverdue(a, now))
  if (overdue.length)
    cards.push({
      id: "overdue",
      kind: "overdue",
      metric: { value: String(overdue.length), label: tr("tindakan lewat tenggat", "actions past due") },
      facts: overdue.slice(0, 3).map((a) => `${a.id} · ${duration(now - a.tenggat.getTime())}`),
      rule: tr("Tindakan overdue: tenggat lewat dan belum terverifikasi atau dibatalkan", "Overdue action: past due and not verified or cancelled"),
      tone: "warning",
      title: tr(`${overdue.length} tindakan korektif lewat tenggat`, `${overdue.length} corrective actions past due`),
      evidence: overdue
        .slice(0, 3)
        .map((a) => `${a.id} (${duration(now - a.tenggat.getTime())})`)
        .join(", "),
      refs: overdue.slice(0, 5).map((a) => ({ id: a.id, href: href("/tindakan", { site: a.site, id: a.id }) })),
      recommendation: tr("Minta update dari PIC hari ini atau tetapkan ulang tenggat dengan alasan.", "Ask the owner for an update today, or reset the due date with a reason."),
      owner: "Area Supervisor",
      cta: { label: tr("Buka tindakan", "Open actions"), href: href("/tindakan", { status: "overdue" }) },
    })

  // 6. Detector tuning, night SLA gap, anomalies.
  for (const d of detectorSignals(rows).filter((x) => x.candidate)) {
    const def = kategoriDefs.find((k) => k.detektor === d.detektor)
    cards.push({
      id: `tuning-${d.detektor}`,
      kind: "tuning",
      metric: { value: `${Math.round(d.share * 100)}%`, label: tr(`alarm palsu · ${d.falseAlarms}/${d.reviews} review`, `false alarms · ${d.falseAlarms}/${d.reviews} reviews`), bar: { value: d.share, max: 1 } },
      facts: [d.detektor],
      rule: tr(`Kandidat tuning: alarm palsu ≥ ${rules.tuningCandidate.share * 100}% dengan ≥ ${rules.tuningCandidate.minReviews} review`, `Tuning candidate: false alarms ≥ ${rules.tuningCandidate.share * 100}% with ≥ ${rules.tuningCandidate.minReviews} reviews`),
      tone: "accent",
      title: tr(`Tuning detektor ${lowerFirst(d.detektor)}`, `Tune detector: ${lowerFirst(d.detektor)}`),
      evidence: tr(`${d.falseAlarms} dari ${d.reviews} review selesai adalah alarm palsu (${Math.round(d.share * 100)}%). Ini sinyal tuning, bukan angka presisi.`, `${d.falseAlarms} of ${d.reviews} completed reviews were false alarms (${Math.round(d.share * 100)}%). A tuning signal, not a precision figure.`),
      refs: [],
      recommendation: tr("Tinjau aturan dan zona deteksi bersama vendor Axxon; jangan dijadikan insiden.", "Review the detection rule and zones with the Axxon vendor team; don't treat it as an incident."),
      owner: "HSE Manager",
      cta: { label: tr("Lihat alarm palsu", "See false alarms"), href: href("/indikasi", { kategori: def?.id ?? "all", periode: "30d", status: "selesai" }) },
    })
  }
  const night = nightSlaGap(rows, now)
  if (night.flagged)
    cards.push({
      id: "night",
      kind: "night",
      metric: { value: `+${Math.round((night.nightRate - night.dayRate) * 100)}`, label: tr("poin SLA terlewat, malam vs siang", "points of SLA missed, night vs day"), compare: { a: night.nightRate, b: night.dayRate, aLabel: tr("Malam", "Night"), bLabel: tr("Siang", "Day"), format: "pct" } },
      facts: [tr(`${night.nightCount} vs ${night.dayCount} indikasi`, `${night.nightCount} vs ${night.dayCount} indications`)],
      rule: tr(`Selisih SLA malam: breach malam − siang ≥ ${rules.nightSlaGap.points} poin, n ≥ ${rules.nightSlaGap.minEvents}`, `Night SLA gap: night − day breach ≥ ${rules.nightSlaGap.points} points, n ≥ ${rules.nightSlaGap.minEvents}`),
      tone: "warning",
      title: tr("Respons shift malam lebih lambat", "The night shift responds slower"),
      evidence: tr(`SLA terlewat ${Math.round(night.nightRate * 100)}% di malam hari vs ${Math.round(night.dayRate * 100)}% di siang hari (${night.nightCount} vs ${night.dayCount} indikasi).`, `SLA missed on ${Math.round(night.nightRate * 100)}% at night vs ${Math.round(night.dayRate * 100)}% by day (${night.nightCount} vs ${night.dayCount} indications).`),
      refs: [],
      recommendation: tr("Tinjau jumlah operator control room di shift malam.", "Review control room staffing on the night shift."),
      owner: "Site Manager",
      cta: { label: tr("Lihat shift malam", "See the night shift"), href: href("/indikasi", { shift: master().shift.find((s) => /malam/i.test(s.nama))?.id ?? "all", periode: "30d" }) },
    })
  for (const a of anomalies(rows, now).slice(0, 2)) {
    const changed = sources.filter((s) => s.site === a.site && s.zona?.id === a.zona && s.status !== "online")
    cards.push({
      id: `anomaly-${a.site}-${a.zona}`,
      kind: "anomaly",
      metric: { value: Number.isFinite(a.ratio) ? `${dec1(a.ratio)}×` : tr("baru", "new"), label: tr("dari rata-rata harian", "of the daily mean"), compare: { a: a.last24h, b: a.baselineDaily, aLabel: tr("24 jam", "24 h"), bLabel: tr(`Rata-rata ${rules.anomaly.baselineDays} hari`, `${rules.anomaly.baselineDays}-day mean`) } },
      facts: changed.length ? [tr(`Sumber tidak normal: ${changed.map((x) => x.id).join(", ")}`, `Sources not normal: ${changed.map((x) => x.id).join(", ")}`)] : [],
      rule: tr(`Anomali: 24 jam ≥ ${rules.anomaly.ratio}× rata-rata harian ${rules.anomaly.baselineDays} hari dan ≥ ${rules.anomaly.min}`, `Anomaly: 24 h ≥ ${rules.anomaly.ratio}× the ${rules.anomaly.baselineDays}-day daily mean and ≥ ${rules.anomaly.min}`),
      tone: "accent",
      title: tr(`Lonjakan indikasi di ${place(a.site, a.zona)}`, `Spike in indications at ${place(a.site, a.zona)}`),
      evidence: tr(
        `${a.last24h} indikasi dalam 24 jam vs rata-rata ${dec1(a.baselineDaily)} per hari.${changed.length ? ` Perhatikan: ${changed.map((s) => s.id).join(", ")} sedang tidak normal.` : ""}`,
        `${a.last24h} indications in 24 h vs a daily mean of ${dec1(a.baselineDaily)}.${changed.length ? ` Note: ${changed.map((s) => s.id).join(", ")} not normal right now.` : ""}`,
      ),
      refs: a.ids.slice(0, 5).map((id) => ({ id, href: href("/indikasi", { site: a.site, id, periode: "today" }) })),
      recommendation: tr("Cek apakah ada perubahan pekerjaan di area itu sebelum menyimpulkan.", "Check whether the work in that area changed before drawing conclusions."),
      owner: "HSE Manager",
      cta: { label: tr("Lihat indikasi", "See indications"), href: href("/indikasi", { site: a.site, zona: f.site === "all" ? `${a.site}/${a.zona}` : a.zona, periode: "today" }) },
    })
  }

  return cards.map((c, i) => ({ c, i })).sort((a, b) => toneRank[a.c.tone] - toneRank[b.c.tone] || a.i - b.i).map(({ c }) => c)
}

// ---- Priority queue ----

export type QueueItem = { event: AiEvent; reason: string; breached: boolean; waitedMs: number; slaMs: number; acknowledged: boolean }

/** Ranked by severity, then unhandled, then age; the rank reason is written out. */
export function priorityQueue(f: Filters, limit = 10): QueueItem[] {
  const now = Date.now()
  return allIn(f, 30)
    .filter((e) => pendingReview.includes(e.workflow))
    .map((e) => {
      const breached = slaBreached({ severity: e.severity, t: e.waktu.getTime(), ackAt: e.ackAt?.getTime() }, now)
      const unhandled = isUnhandled(e)
      return { e, breached, unhandled }
    })
    .sort((a, b) => severityMeta[a.e.severity].rank - severityMeta[b.e.severity].rank || Number(b.unhandled) - Number(a.unhandled) || a.e.waktu.getTime() - b.e.waktu.getTime())
    .slice(0, limit)
    .map(({ e, breached }) => ({
      event: e,
      breached,
      waitedMs: now - e.waktu.getTime(),
      slaMs: rules.ackSlaMinutes[e.severity] * MINUTE,
      acknowledged: e.workflow !== "new",
      reason: [
        severityMeta[e.severity].label,
        e.workflow === "new" ? tr("belum di-acknowledge", "not acknowledged") : tr("belum direview", "not reviewed"),
        tr(`menunggu ${duration(now - e.waktu.getTime())}`, `waiting ${duration(now - e.waktu.getTime())}`),
        breached ? tr(`SLA ${rules.ackSlaMinutes[e.severity]} menit terlewat`, `${rules.ackSlaMinutes[e.severity]}-min SLA missed`) : tr(`SLA ${rules.ackSlaMinutes[e.severity]} menit`, `${rules.ackSlaMinutes[e.severity]}-min SLA`),
      ].join(" · "),
    }))
}

// ---- Panels ----

export type DayPoint = { hari: string; t: number; indikasi: number; terkonfirmasi: number }

/** Indications and confirmed findings per day. Two measures, never added together. At least 7 days. */
export function dailyTrend(f: Filters): DayPoint[] {
  const days = Math.max(7, periodDays[f.periode] ?? 1)
  const events = allIn(f, days)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: days }, (_, i) => {
    const from = start.getTime() - (days - 1 - i) * DAY
    const inDay = events.filter((e) => e.waktu.getTime() >= from && e.waktu.getTime() < from + DAY)
    return {
      hari: new Date(from).toLocaleDateString(locale(), { day: "numeric", month: "short" }),
      t: from,
      indikasi: inDay.length,
      terkonfirmasi: inDay.filter((e) => findingOf(e)?.outcome === "confirmed").length,
    }
  })
}

export type Hotspot = { zones: { id: string; label: string }[]; kategori: Kategori[]; counts: Record<string, Record<string, number>>; max: number }

/** Confirmed findings per zone × category in the period. */
export function hotspot(f: Filters): Hotspot {
  const events = indicationsIn(f).filter((e) => findingOf(e)?.outcome === "confirmed")
  const zones = placesIn(f).map((p) => ({ id: `${p.site}/${p.zona}`, label: placeLabel(f, p.site, p.zona) }))
  const counts: Record<string, Record<string, number>> = {}
  for (const z of zones) counts[z.id] = {}
  for (const e of events) {
    const row = counts[`${e.site}/${e.zona.id}`]
    if (row) row[e.kategori] = (row[e.kategori] ?? 0) + 1
  }
  const max = Math.max(0, ...Object.values(counts).flatMap((r) => Object.values(r)))
  return { zones, kategori: kategoriDefs.map((k) => k.id), counts, max }
}

export type SlaRow = { severity: Severity; label: string; total: number; breached: number; rate: number; limitMinutes: number }

export function slaPanel(f: Filters): SlaRow[] {
  return slaBySeverity(indicationsIn(f).map(toRule), Date.now()).map((r) => ({ ...r, label: severityMeta[r.severity].label }))
}

export type CoverageRow = { jenis: Source["jenis"]; online: number; degraded: number; offline: number; total: number }

export function coverage(f: Filters): CoverageRow[] {
  const sources = sourcesIn(f)
  const kinds = [...new Set(sources.map((s) => s.jenis))]
  return kinds.map((jenis) => {
    const of = sources.filter((s) => s.jenis === jenis)
    return {
      jenis,
      online: of.filter((s) => s.status === "online").length,
      degraded: of.filter((s) => s.status === "degraded" || s.status === "stale").length,
      offline: of.filter((s) => s.status === "offline").length,
      total: of.length,
    }
  })
}

// ---- Mock API ----

export const getSiteCards = (f: Filters) => respond(f, () => siteCards(f), [] as SiteCard[])
export const getKpis = (f: Filters) => respond(f, () => kpis(f), null as Kpis | null)
export const getDecisions = (f: Filters) => respond(f, () => decisions(f), [] as Decision[])
export const getPriorityQueue = (f: Filters) => respond(f, () => priorityQueue(f), [] as QueueItem[])
export const getDailyTrend = (f: Filters) => respond(f, () => dailyTrend(f), [] as DayPoint[])
export const getHotspot = (f: Filters) => respond(f, () => hotspot(f), { zones: [], kategori: [], counts: {}, max: 0 } as Hotspot)
export const getSlaPanel = (f: Filters) => respond(f, () => slaPanel(f), [] as SlaRow[])
export const getCoverage = (f: Filters) => respond(f, () => coverage(f), [] as CoverageRow[])

