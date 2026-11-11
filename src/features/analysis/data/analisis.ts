/**
 * The analysis layer: explainable zone risk, anomalies, review quality, trends, the management
 * brief and the assistant's answers. Three tiers, as in the brief: rules and statistics compute
 * every number here; the narrative is a template filled from those numbers; a language model, when
 * one is connected, only rewrites the same facts and must cite the same record IDs.
 *
 * ponytail: the "AI draft" is the template revealed word by word. Swap `draftWithModel` for a call
 * to the narrative service; it receives `briefFacts` and nothing else (no video, no names).
 */

import { severityMeta } from "@/shared/config/events"
import { kategoriDef, kategoriDefs, type Kategori } from "@/shared/config/indikasi"
import { rules } from "@/shared/config/rules"
import { findingOf, indicationsIn, toRule, type AiEvent } from "@/features/indications/data/indikasi"
import { actionsIn, isOverdue, userName } from "@/features/cases/data/kasus"
import { decisions, kpis, zoneScoresFrom, type Decision } from "@/features/decisions/data/keputusan"
import { master, siteName } from "@/shared/data/master"
import { periodDays, type Filters, type Option } from "@/shared/data/filters"
import { respond } from "@/shared/data/mock-api"
import { placeLabel, placesIn, sitesIn } from "@/shared/data/scope"
import { envAlarms } from "@/features/environment/data/lingkungan"
import { isModuleOn } from "@/shared/data/settings"
import { sourcesIn } from "@/features/devices/data/sumber"
import { anomalies, backlogForecast, detectorSignals, isLinkDegraded, nightSlaGap, powerRisk, repeatFindings, type ZoneScore } from "@/shared/lib/rules"
import { getLang, locale } from "@/shared/lib/i18n"
import { duration } from "@/shared/lib/time"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export type Lang = "id" | "en"
const tr = (lang: Lang, id: string, en: string) => (lang === "id" ? id : en)
/** Interface labels, by the current interface language (the brief and assistant take theirs as a parameter). */

/** "12 minutes", "3 hours", "2 days": the English twin of `duration`. */
function durationEn(ms: number) {
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`
}

/** A run of text with record IDs the reader can open. */
export type Seg = string | { id: string; href: string }

const q = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params)}`
const eventRef = (e: Pick<AiEvent, "id" | "site">): Seg => ({ id: e.id, href: q("/indikasi", { site: e.site, id: e.id, periode: "30d", status: "semua" }) })
const zoneHref = (f: Filters, site: string, zona: string, extra: Record<string, string> = {}) =>
  q("/indikasi", { site, zona: f.site === "all" ? `${site}/${zona}` : zona, periode: "30d", status: "selesai", ...extra })

const recent = (f: Filters, days: number) => indicationsIn({ ...f, kategori: "all" }, { from: Date.now() - days * DAY })

// ---- Zone risk ----

export type RankedZone = ZoneScore & { label: string; previous?: number; delta?: number; cameras: number; href: string }

/** Every zone's score now, and as computed a week ago, highest first. */
export function zoneRanking(f: Filters): RankedZone[] {
  const now = Date.now()
  const events = recent(f, 35)
  const sources = sourcesIn(f)
  const before = new Map(zoneScoresFrom(f, events, [], now - 7 * DAY).map((z) => [`${z.site}/${z.zona}`, z.score]))
  return zoneScoresFrom(f, events, sources, now).map((z) => {
    const previous = before.get(`${z.site}/${z.zona}`)
    return {
      ...z,
      label: placeLabel(f, z.site, z.zona),
      previous,
      delta: previous === undefined ? undefined : z.score - previous,
      cameras: master().kamera.filter((k) => k.aktif && k.site === z.site && k.zona === z.zona).length,
      href: zoneHref(f, z.site, z.zona),
    }
  })
}

/** `confounders`: sources at the zone (or its uplink) that are not online, which could explain a jump. */
export type AnomalyRow = { site: string; zona: string; label: string; last24h: number; baselineDaily: number; ratio: number; refs: Seg[]; confounders: { id: string; status: string }[]; href: string }

/** Last 24 h against the 28-day baseline, with the coverage changes that could explain a jump. */
export function anomalyRows(f: Filters): AnomalyRow[] {
  const now = Date.now()
  const events = recent(f, rules.anomaly.baselineDays + 2)
  const sources = sourcesIn(f)
  const byId = new Map(events.map((e) => [e.id, e]))
  return anomalies(events.map(toRule), now).map((a) => ({
    ...a,
    label: placeLabel(f, a.site, a.zona),
    refs: a.ids.slice(0, 6).map((id) => eventRef(byId.get(id)!)),
    confounders: sources.filter((s) => s.site === a.site && (s.zona?.id === a.zona || s.jenis === "uplink") && s.status !== "online").map((s) => ({ id: s.id, status: s.status })),
    href: q("/indikasi", { site: a.site, zona: f.site === "all" ? `${a.site}/${a.zona}` : a.zona, periode: "today", status: "semua" }),
  }))
}

// ---- Trends ----

export type WeekRow = { kategori: string; label: string; indikasiIni: number; indikasiLalu: number; temuanIni: number; temuanLalu: number }

/** Last 7 days against the 7 before, per category. Indications and confirmed findings apart. */
export function weekCompare(f: Filters): WeekRow[] {
  const now = Date.now()
  const rows = recent(f, 14)
  const inWeek = (e: AiEvent, w: 0 | 1) => e.waktu.getTime() >= now - (w + 1) * 7 * DAY && e.waktu.getTime() < now - w * 7 * DAY
  const ok = (e: AiEvent) => findingOf(e)?.outcome === "confirmed"
  const cameras = kategoriDefs.map((k) => {
    const of = rows.filter((e) => e.kategori === k.id)
    return {
      kategori: k.id,
      label: k.label,
      indikasiIni: of.filter((e) => inWeek(e, 0)).length,
      indikasiLalu: of.filter((e) => inWeek(e, 1)).length,
      temuanIni: of.filter((e) => inWeek(e, 0) && ok(e)).length,
      temuanLalu: of.filter((e) => inWeek(e, 1) && ok(e)).length,
    }
  })
  // Sensors are not a detection category: they show with "all categories" only.
  if (!isModuleOn("environment") || (f.kategori && f.kategori !== "all")) return cameras
  // Sensors have no review: "indications" are alarms into warning or danger, "confirmed" the ones into danger.
  const ini = envAlarms(f, now - 7 * DAY, now)
  const lalu = envAlarms(f, now - 14 * DAY, now - 7 * DAY)
  return [...cameras, { kategori: "lingkungan", label: tr(getLang(), "Alarm lingkungan", "Environment alarms"), indikasiIni: ini.alarms, indikasiLalu: lalu.alarms, temuanIni: ini.danger, temuanLalu: lalu.danger }]
}

export type AreaRow = Option & { site: string; zona: string; confirmed: number; cameras: number; offline: number; href: string }

/** Confirmed findings per zone in the period, with camera count beside it: a count is not a rate. */
export function areaRanking(f: Filters): AreaRow[] {
  const rows = indicationsIn(f).filter((e) => findingOf(e)?.outcome === "confirmed")
  const sources = sourcesIn(f)
  return placesIn(f)
    .map(({ site, zona }) => ({
      id: `${site}/${zona}`,
      label: placeLabel(f, site, zona),
      site,
      zona,
      confirmed: rows.filter((e) => e.site === site && e.zona.id === zona).length,
      cameras: master().kamera.filter((k) => k.aktif && k.site === site && k.zona === zona).length,
      offline: sources.filter((s) => s.jenis === "kamera" && s.site === site && s.zona?.id === zona && s.status === "offline").length,
      href: zoneHref(f, site, zona, { periode: f.periode }),
    }))
    .sort((a, b) => b.confirmed - a.confirmed)
}

export type RepeatRow = { site: string; zona: string; label: string; kategori: string; count: number; refs: Seg[]; href: string }

export function repeatRows(f: Filters): RepeatRow[] {
  const events = recent(f, rules.repeatFinding.days + 1)
  const byId = new Map(events.map((e) => [e.id, e]))
  return repeatFindings(events.map(toRule), Date.now()).map((g) => ({
    site: g.site,
    zona: g.zona,
    label: placeLabel(f, g.site, g.zona),
    kategori: kategoriDef(g.kategori as Kategori).label,
    count: g.count,
    refs: g.ids.slice(0, 6).map((id) => eventRef(byId.get(id)!)),
    href: zoneHref(f, g.site, g.zona, { kategori: g.kategori, periode: "7d" }),
  }))
}

// ---- Facts for the brief and the assistant ----

/**
 * Everything the narrative may say, computed. The brief, the assistant and a connected model all
 * read only this: no video, no thumbnails, no personal names beyond action owners' roles.
 */
export function briefFacts(f: Filters) {
  const now = Date.now()
  const days = Math.max(7, periodDays[f.periode] ?? 7)
  const events = recent(f, days)
  const rows = events.map(toRule)
  const k = kpis(f)
  const ranking = zoneRanking(f)
  const sources = sourcesIn(f)
  const actions = actionsIn({ ...f, periode: "30d" })
  const overdue = actions.filter((a) => isOverdue(a, now))
  const night = nightSlaGap(rows, now)
  const detectors = detectorSignals(rows)
  const prevWeek = recent(f, 14).filter((e) => e.waktu.getTime() < now - 7 * DAY).length
  const thisWeek = recent(f, 7).length
  return {
    dibuat: new Date(now).toISOString(),
    periodeHari: days,
    site: sitesIn(f).map(siteName),
    indikasi: events.length,
    terkonfirmasi: events.filter((e) => findingOf(e)?.outcome === "confirmed").length,
    mingguIni: thisWeek,
    mingguLalu: prevWeek,
    belumDitangani: k.unhandled,
    lewatSla: k.unhandledBreached,
    menungguReview: k.pendingReview,
    backlog: backlogForecast(recent(f, 30).map(toRule), now),
    zonaTeratas: ranking.slice(0, 3).map((z) => ({ zona: z.label, site: z.site, id: z.zona, skor: z.score, delta: z.delta, bagian: z.parts, href: z.href })),
    anomali: anomalyRows(f).map((a) => ({ zona: a.label, last24h: a.last24h, baseline: Math.round(a.baselineDaily * 10) / 10, refs: a.refs, confounders: a.confounders })),
    berulang: repeatRows(f).slice(0, 3),
    tindakanOverdue: overdue.map((a) => ({ id: a.id, site: a.site, pic: userName(a.ownerId), lewatMs: now - a.tenggat.getTime() })),
    gap: sources.filter((s) => s.status !== "online").map((s) => ({ id: s.id, site: s.site, status: s.status, jenis: s.jenis })),
    link: sources.filter((s) => s.jenis === "uplink" && isLinkDegraded(s.telemetry.uplinkMbps)).map((s) => ({ id: s.id, site: s.site, mbps: s.telemetry.uplinkMbps })),
    daya: sources
      .filter((s) => powerRisk({ id: s.id, site: s.site, jenis: s.jenis, battery: s.telemetry.battery, runtimeHours: s.telemetry.runtimeHours }))
      .map((s) => ({ id: s.id, site: s.site, baterai: s.telemetry.battery, runtime: s.telemetry.runtimeHours })),
    tuning: detectors.filter((d) => d.candidate).map((d) => ({ detektor: d.detektor, share: Math.round(d.share * 100), n: d.reviews })),
    shiftMalam: { flagged: night.flagged, malam: Math.round(night.nightRate * 100), siang: Math.round(night.dayRate * 100) },
    keputusan: decisions(f).slice(0, 3),
  }
}

export type Facts = ReturnType<typeof briefFacts>

// ---- Brief ----

export type BriefSection = { title: string; paragraphs: Seg[][] }
export type Brief = { lang: Lang; title: string; generatedAt: Date; sections: BriefSection[] }

const sourceRef = (id: string, site: string): Seg => ({ id, href: q("/sumber", { site, id }) })
const actionRef = (id: string, site: string): Seg => ({ id, href: q("/tindakan", { site, id }) })
const pct = (n: number) => `${n}%`

/** The management brief, written from the facts only. Every claim carries the IDs behind it. */
export function writeBrief(facts: Facts, lang: Lang): Brief {
  const t = (id: string, en: string) => tr(lang, id, en)
  const sections: BriefSection[] = []
  const change = facts.mingguLalu ? Math.round(((facts.mingguIni - facts.mingguLalu) / facts.mingguLalu) * 100) : 0

  sections.push({
    title: t("Ringkasan", "Summary"),
    paragraphs: [
      [
        t(
          `Dalam ${facts.periodeHari} hari terakhir di ${facts.site.join(", ")} tercatat ${facts.indikasi} indikasi AI, ${facts.terkonfirmasi} di antaranya terkonfirmasi lewat review. `,
          `Over the last ${facts.periodeHari} days at ${facts.site.join(", ")}, ${facts.indikasi} AI indications were recorded; ${facts.terkonfirmasi} were confirmed on review. `,
        ),
        t(
          `Minggu ini ${facts.mingguIni} indikasi dibanding ${facts.mingguLalu} minggu lalu (${change >= 0 ? "+" : ""}${change}%). `,
          `This week had ${facts.mingguIni} indications against ${facts.mingguLalu} the week before (${change >= 0 ? "+" : ""}${change}%). `,
        ),
        t(
          `Saat ini ${facts.belumDitangani} indikasi Kritis/Tinggi belum ditangani, ${facts.lewatSla} sudah melewati SLA acknowledge.`,
          `Right now ${facts.belumDitangani} Critical/High indications are unhandled; ${facts.lewatSla} are past the acknowledgement SLA.`,
        ),
      ],
    ],
  })

  if (facts.zonaTeratas.length) {
    const partName: Record<string, string> = lang === "id" ? { volume: "volume temuan", severity: "porsi Kritis/Tinggi", repeat: "temuan berulang", trend: "tren naik", coverage: "gap kamera", lingkungan: "kondisi lingkungan" } : { volume: "finding volume", severity: "Critical/High share", repeat: "repeat findings", trend: "rising trend", coverage: "camera gaps", lingkungan: "environment readings" }
    sections.push({
      title: t("Zona paling berisiko", "Highest-risk zones"),
      paragraphs: facts.zonaTeratas.map((z) => {
        const drivers = Object.entries(z.bagian)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([k]) => partName[k])
          .join(t(" dan ", " and "))
        return [
          { id: z.zona, href: z.href },
          t(
            `: skor ${z.skor}${z.delta !== undefined ? ` (${z.delta >= 0 ? "+" : ""}${z.delta} dari 7 hari lalu)` : ""}, terutama karena ${drivers}.`,
            `: score ${z.skor}${z.delta !== undefined ? ` (${z.delta >= 0 ? "+" : ""}${z.delta} vs 7 days ago)` : ""}, driven mainly by ${drivers}.`,
          ),
        ]
      }),
    })
  }

  const patterns: Seg[][] = []
  for (const r of facts.berulang)
    patterns.push([t(`${r.kategori} berulang di ${r.label}: ${r.count} temuan dalam ${rules.repeatFinding.days} hari (`, `${r.kategori} repeating at ${r.label}: ${r.count} findings in ${rules.repeatFinding.days} days (`), ...joinRefs(r.refs.slice(0, 3)), ")."])
  for (const a of facts.anomali)
    patterns.push([
      t(`Lonjakan di ${a.zona}: ${a.last24h} indikasi dalam 24 jam vs rata-rata ${a.baseline} per hari (`, `Spike at ${a.zona}: ${a.last24h} indications in 24 h vs a daily mean of ${a.baseline} (`),
      ...joinRefs(a.refs.slice(0, 3)),
      ")",
      a.confounders.length ? t(`; perhatikan ${confounderText(a.confounders, "id")}.`, `; note ${confounderText(a.confounders, "en")}.`) : ".",
    ])
  if (patterns.length) sections.push({ title: t("Pola yang perlu perhatian", "Patterns to watch"), paragraphs: patterns })

  const response: Seg[][] = [
    [
      t(`${facts.menungguReview} indikasi menunggu review; dengan laju ${facts.backlog.perDay.toFixed(1)} review per hari, antrean selesai dalam ±${Number.isFinite(facts.backlog.days) ? facts.backlog.days.toFixed(1) : "—"} hari.`, `${facts.menungguReview} indications await review; at ${facts.backlog.perDay.toFixed(1)} reviews a day the queue clears in about ${Number.isFinite(facts.backlog.days) ? facts.backlog.days.toFixed(1) : "—"} days.`),
    ],
  ]
  if (facts.tindakanOverdue.length)
    response.push([t(`${facts.tindakanOverdue.length} tindakan korektif lewat tenggat: `, `${facts.tindakanOverdue.length} corrective actions are overdue: `), ...joinRefs(facts.tindakanOverdue.slice(0, 4).map((a) => actionRef(a.id, a.site))), "."])
  if (facts.shiftMalam.flagged) response.push([t(`SLA terlewat ${pct(facts.shiftMalam.malam)} di shift malam vs ${pct(facts.shiftMalam.siang)} di siang hari.`, `The SLA was missed on ${pct(facts.shiftMalam.malam)} of night-shift indications vs ${pct(facts.shiftMalam.siang)} by day.`)])
  for (const d of facts.tuning) response.push([t(`Detektor ${d.detektor}: ${d.share}% alarm palsu dari ${d.n} review, kandidat tuning (bukan angka presisi).`, `${d.detektor}: ${d.share}% false alarms over ${d.n} reviews, a tuning candidate (not a precision figure).`)])
  sections.push({ title: t("Respons dan backlog", "Response and backlog"), paragraphs: response })

  const coverage: Seg[][] = []
  if (facts.gap.length) coverage.push([t("Sumber tidak normal: ", "Sources not online: "), ...joinRefs(facts.gap.map((g) => sourceRef(g.id, g.site))), "."])
  for (const l of facts.link) coverage.push([sourceRef(l.id, l.site), t(` uplink ${l.mbps} Mbps, di bawah ambang ${rules.linkDegradedMbps} Mbps; event tetap terkirim lebih dulu.`, ` uplink at ${l.mbps} Mbps, below the ${rules.linkDegradedMbps} Mbps threshold; events still go first.`)])
  for (const p of facts.daya) coverage.push([sourceRef(p.id, p.site), t(` baterai ${p.baterai}%, perkiraan runtime ${p.runtime} jam: risiko padam.`, ` battery ${p.baterai}%, estimated runtime ${p.runtime} h: outage risk.`)])
  if (coverage.length) sections.push({ title: t("Cakupan pemantauan", "Monitoring coverage"), paragraphs: coverage })

  if (facts.keputusan.length)
    sections.push({
      title: t("Tiga keputusan minggu ini", "Three decisions this week"),
      paragraphs: facts.keputusan.map((d: Decision, i) => [`${i + 1}. ${d.title}. `, t("Rekomendasi: ", "Recommendation: "), d.recommendation, t(` Pemilik: ${d.owner}. `, ` Owner: ${d.owner}. `), ...joinRefs(d.refs.slice(0, 3))]),
    })

  return { lang, title: t("Brief manajemen", "Management brief"), generatedAt: new Date(facts.dibuat), sections }
}

export const confounderText = (list: { id: string; status: string }[], lang: Lang) =>
  list.map((c) => `${c.id} ${c.status === "offline" ? "offline" : tr(lang, "menurun", "degraded")}`).join(", ")

function joinRefs(refs: Seg[]): Seg[] {
  return refs.flatMap((r, i) => (i ? [", ", r] : [r]))
}

/** Plain text with IDs in brackets, for copy and Markdown export. */
export function briefMarkdown(b: Brief, label: string) {
  const text = (segs: Seg[]) => segs.map((s) => (typeof s === "string" ? s : `[${s.id}]`)).join("")
  return [
    `# ${b.title}`,
    `_${label} · ${b.generatedAt.toLocaleString(b.lang === "id" ? locale() : "en-GB")}_`,
    "",
    ...b.sections.flatMap((s) => [`## ${s.title}`, "", ...s.paragraphs.map(text).flatMap((p) => [p, ""])]),
    b.lang === "id" ? "_Data simulasi. Setiap angka dihitung dari record; ID di dalam kurung bisa ditelusuri._" : "_Simulated data. Every number is computed from records; bracketed IDs can be traced._",
  ].join("\n")
}

// ---- Assistant ----

export type Intent = { id: string; id_label: string; en_label: string; match: RegExp }

/**
 * The questions the assistant answers from computed data, matched in this order (so "why … risky"
 * is a why). Anything else gets these as suggestions.
 */
export const intents: Intent[] = [
  { id: "why", id_label: "Kenapa zona teratas berisiko?", en_label: "Why is the top zone risky?", match: /kenapa|mengapa|why|alasan/i },
  { id: "risk", id_label: "Zona mana paling berisiko?", en_label: "Which zone is riskiest?", match: /risiko|berisiko|rawan|riskiest|risk|hotspot/i },
  { id: "decisions", id_label: "Apa yang harus diputuskan sekarang?", en_label: "What should management decide now?", match: /putus|keputusan|decide|decision|rekomendasi|recommend/i },
  { id: "overdue", id_label: "Tindakan apa yang overdue?", en_label: "Which actions are overdue?", match: /overdue|terlambat|lewat tenggat|tenggat|late/i },
  { id: "backlog", id_label: "Berapa antrean review?", en_label: "How big is the review backlog?", match: /antrean|backlog|antri|queue|menunggu|pending/i },
  { id: "coverage", id_label: "Kamera atau sumber mana yang mati?", en_label: "Which cameras or sources are down?", match: /kamera|camera|offline|mati|down|coverage|cakupan|sumber|source/i },
  { id: "link", id_label: "Bagaimana kondisi link Starlink?", en_label: "How are the uplinks?", match: /link|starlink|satelit|satellite|uplink|jaringan|network|daya|power|baterai|battery/i },
  { id: "false", id_label: "Detektor mana yang banyak alarm palsu?", en_label: "Which detector raises most false alarms?", match: /palsu|false|tuning|detektor|detector|akurasi|accuracy/i },
  { id: "shift", id_label: "Apakah shift malam lebih lambat?", en_label: "Is the night shift slower?", match: /shift|malam|night|siang|day/i },
  { id: "week", id_label: "Apa yang berubah dari minggu lalu?", en_label: "What changed since last week?", match: /minggu|week|berubah|change|tren|trend|naik|turun/i },
]

export type Answer = { intent?: string; segments: Seg[][]; suggestions?: Intent[] }

/** Picks the intent and answers it from the facts, citing IDs. Never invents a number. */
export function answer(question: string, facts: Facts, lang: Lang, f: Filters): Answer {
  const t = (id: string, en: string) => tr(lang, id, en)
  const intent = intents.find((i) => i.match.test(question))
  if (!intent) return { segments: [[t("Saya hanya menjawab dari data yang sudah dihitung di dashboard ini. Coba salah satu pertanyaan berikut:", "I only answer from data already computed on this dashboard. Try one of these:")]], suggestions: intents.slice(0, 6) }
  const top = facts.zonaTeratas[0]
  switch (intent.id) {
    case "risk":
      return {
        intent: intent.id,
        segments: facts.zonaTeratas.length
          ? facts.zonaTeratas.map((z, i) => [`${i + 1}. `, { id: z.zona, href: z.href }, t(` — skor ${z.skor}`, ` — score ${z.skor}`), z.delta !== undefined ? t(` (${z.delta >= 0 ? "+" : ""}${z.delta} dari minggu lalu)`, ` (${z.delta >= 0 ? "+" : ""}${z.delta} vs last week)`) : ""])
          : [[t("Belum ada temuan terkonfirmasi untuk dihitung.", "No confirmed findings to score yet.")]],
      }
    case "why": {
      if (!top) return { intent: intent.id, segments: [[t("Belum ada zona dengan skor.", "No zone has a score yet.")]] }
      const p = top.bagian
      const w = rules.riskWeights
      return {
        intent: intent.id,
        segments: [
          [{ id: top.zona, href: top.href }, t(` punya skor ${top.skor} dari 100. Rinciannya:`, ` scores ${top.skor} out of 100. Breakdown:`)],
          [t(`• Volume temuan 14 hari: ${p.volume}/${w.volume}`, `• 14-day finding volume: ${p.volume}/${w.volume}`)],
          [t(`• Porsi Kritis/Tinggi: ${p.severity}/${w.severity}`, `• Critical/High share: ${p.severity}/${w.severity}`)],
          [t(`• Temuan berulang 7 hari: ${p.repeat}/${w.repeat}`, `• 7-day repeats: ${p.repeat}/${w.repeat}`)],
          [t(`• Tren 7 hari: ${p.trend}/${w.trend}`, `• 7-day trend: ${p.trend}/${w.trend}`)],
          [t(`• Ketidakpastian cakupan (kamera offline/menurun): ${p.coverage}/${w.coverage}`, `• Coverage uncertainty (offline/degraded cameras): ${p.coverage}/${w.coverage}`)],
          [t(`• Kondisi lingkungan (sensor di atas batas): ${p.lingkungan}/${w.lingkungan}`, `• Environment (sensors past their limits): ${p.lingkungan}/${w.lingkungan}`)],
        ],
      }
    }
    case "decisions":
      return {
        intent: intent.id,
        segments: facts.keputusan.length
          ? facts.keputusan.map((d, i) => [`${i + 1}. ${d.title}. `, d.recommendation, t(` (pemilik: ${d.owner}) `, ` (owner: ${d.owner}) `), ...joinRefs(d.refs.slice(0, 2))])
          : [[t("Tidak ada aturan yang terpicu saat ini.", "No rule is triggered right now.")]],
      }
    case "overdue":
      return {
        intent: intent.id,
        segments: facts.tindakanOverdue.length
          ? [[t(`${facts.tindakanOverdue.length} tindakan lewat tenggat:`, `${facts.tindakanOverdue.length} actions are overdue:`)], ...facts.tindakanOverdue.slice(0, 6).map((a) => ["• ", actionRef(a.id, a.site), t(` — PIC ${a.pic}, lewat ${duration(a.lewatMs)}`, ` — owner ${a.pic}, ${durationEn(a.lewatMs)} late`)])]
          : [[t("Tidak ada tindakan yang overdue.", "No action is overdue.")]],
      }
    case "backlog":
      return {
        intent: intent.id,
        segments: [
          [
            t(`${facts.menungguReview} indikasi menunggu review, ${facts.belumDitangani} di antaranya Kritis/Tinggi (${facts.lewatSla} lewat SLA).`, `${facts.menungguReview} indications await review; ${facts.belumDitangani} are Critical/High (${facts.lewatSla} past SLA).`),
          ],
          [t(`Laju review 7 hari: ${facts.backlog.perDay.toFixed(1)} per hari, jadi antrean selesai dalam ±${Number.isFinite(facts.backlog.days) ? facts.backlog.days.toFixed(1) : "—"} hari.`, `7-day review pace: ${facts.backlog.perDay.toFixed(1)} a day, so the queue clears in about ${Number.isFinite(facts.backlog.days) ? facts.backlog.days.toFixed(1) : "—"} days.`)],
        ],
      }
    case "coverage":
      return {
        intent: intent.id,
        segments: facts.gap.length ? [[t("Sumber yang tidak online sekarang: ", "Sources not online now: "), ...joinRefs(facts.gap.map((g) => sourceRef(g.id, g.site))), "."], [t("Indikasi dari sumber itu tidak akan muncul sampai pulih.", "No indication will arrive from them until they recover.")]] : [[t("Semua sumber online.", "Every source is online.")]],
      }
    case "link": {
      const segs: Seg[][] = facts.link.map((l) => [sourceRef(l.id, l.site), t(` ${l.mbps} Mbps, di bawah ambang ${rules.linkDegradedMbps} Mbps.`, ` ${l.mbps} Mbps, below the ${rules.linkDegradedMbps} Mbps threshold.`)])
      for (const p of facts.daya) segs.push([sourceRef(p.id, p.site), t(` baterai ${p.baterai}%, runtime ±${p.runtime} jam.`, ` battery ${p.baterai}%, about ${p.runtime} h runtime.`)])
      return { intent: intent.id, segments: segs.length ? segs : [[t("Semua uplink di atas ambang dan tidak ada risiko daya.", "All uplinks are above threshold and there is no power risk.")]] }
    }
    case "false":
      return {
        intent: intent.id,
        segments: facts.tuning.length
          ? facts.tuning.map((d) => [t(`${d.detektor}: ${d.share}% alarm palsu dari ${d.n} review selesai. Kandidat tuning bersama vendor Axxon; ini bukan angka akurasi.`, `${d.detektor}: ${d.share}% false alarms over ${d.n} completed reviews. A tuning candidate with the Axxon vendor team; not an accuracy figure.`)])
          : [[t(`Tidak ada detektor dengan alarm palsu ≥ ${rules.tuningCandidate.share * 100}% (n ≥ ${rules.tuningCandidate.minReviews}).`, `No detector has ≥ ${rules.tuningCandidate.share * 100}% false alarms (n ≥ ${rules.tuningCandidate.minReviews}).`)]],
      }
    case "shift":
      return {
        intent: intent.id,
        segments: [
          [
            t(`SLA terlewat ${pct(facts.shiftMalam.malam)} di malam hari vs ${pct(facts.shiftMalam.siang)} di siang hari. `, `The SLA was missed on ${pct(facts.shiftMalam.malam)} of night-shift indications vs ${pct(facts.shiftMalam.siang)} by day. `),
            facts.shiftMalam.flagged ? t(`Selisihnya melewati ambang ${rules.nightSlaGap.points} poin.`, `The gap exceeds the ${rules.nightSlaGap.points}-point threshold.`) : t("Selisihnya masih di bawah ambang.", "The gap is below the threshold."),
          ],
        ],
      }
    case "week": {
      const rows = weekCompare(f)
      return {
        intent: intent.id,
        segments: [
          [t(`Total ${facts.mingguIni} indikasi minggu ini vs ${facts.mingguLalu} minggu lalu.`, `${facts.mingguIni} indications this week vs ${facts.mingguLalu} last week.`)],
          ...rows.map((r) => [`• ${r.label}: ${r.indikasiLalu} → ${r.indikasiIni} ${t("indikasi", "indications")}, ${r.temuanLalu} → ${r.temuanIni} ${t("terkonfirmasi", "confirmed")}`]),
        ],
      }
    }
  }
  return { segments: [] }
}

// ---- Mock API ----

export const getZoneRanking = (f: Filters) => respond(f, () => zoneRanking(f), [] as RankedZone[])
export const getAnomalies = (f: Filters) => respond(f, () => anomalyRows(f), [] as AnomalyRow[])
export const getWeekCompare = (f: Filters) => respond(f, () => weekCompare(f), [] as WeekRow[])
export const getAreaRanking = (f: Filters) => respond(f, () => areaRanking(f), [] as AreaRow[])
export const getRepeatRows = (f: Filters) => respond(f, () => repeatRows(f), [] as RepeatRow[])
export const getBriefFacts = (f: Filters) => respond(f, () => briefFacts(f), null as Facts | null)

/** Severity label for the facts view. */
export const severityLabel = (s: keyof typeof severityMeta) => severityMeta[s].label
