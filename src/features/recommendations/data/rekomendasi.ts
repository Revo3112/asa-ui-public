/**
 * This week's recommendations: what to do in the coming days, worked out from the same weekly
 * analytics as the risk page (zone risk, category trends, repeat findings, response, detector
 * quality, device health). The decision page asks "what needs deciding now"; this one asks "what
 * should we change this week so it happens less".
 *
 * Every recommendation is a rule over computed numbers, with the records behind it and concrete
 * steps. Nothing is done automatically: a person turns a recommendation into a corrective action.
 *
 * ponytail: a connected language model may rewrite the wording, but receives only these objects
 * and must keep the same numbers and record IDs.
 */

import { actionDone, kategoriDef, type Kategori } from "@/shared/config/indikasi"
import { rules } from "@/shared/config/rules"
import { briefFacts, repeatRows, weekCompare, zoneRanking } from "@/features/analysis/data/analisis"
import { actionsIn, isOverdue, userName } from "@/features/cases/data/kasus"
import type { Filters } from "@/shared/data/filters"
import { respond } from "@/shared/data/mock-api"
import { tr } from "@/shared/lib/i18n"

export type RecArea = "zona" | "kepatuhan" | "respons" | "deteksi" | "perangkat"
export type RecPriority = "tinggi" | "sedang" | "rendah"

export type RecMetric = {
  value: string
  label: string
  /** `markerLabel` names what the tick on the bar is, since it differs per rule. */
  bar?: { value: number; max: number; marker?: number; markerLabel?: string }
  compare?: { a: number; b: number; aLabel: string; bLabel: string; format?: "pct" }
}

export type Rekomendasi = {
  id: string
  area: RecArea
  priority: RecPriority
  title: string
  /** One sentence: the numbers behind it. */
  why: string
  metric: RecMetric
  steps: string[]
  owner: string
  refs: { id: string; href: string }[]
  link: { label: string; href: string }
  /** Where an action made from it belongs. Unset when it spans sites; the form then asks. */
  site?: string
  zona?: string
  /** Within a priority, higher first. */
  weight: number
}

export const areaLabel: Record<RecArea, string> = {
  get zona() { return tr("Risiko zona", "Zone risk") },
  get kepatuhan() { return tr("Kepatuhan", "Compliance") },
  get respons() { return tr("Respons", "Response") },
  get deteksi() { return tr("Kualitas deteksi", "Detection quality") },
  get perangkat() { return tr("Perangkat", "Devices") },
}

export const priorityLabel: Record<RecPriority, string> = {
  get tinggi() { return tr("Prioritas tinggi", "High priority") },
  get sedang() { return tr("Prioritas sedang", "Medium priority") },
  get rendah() { return tr("Prioritas rendah", "Low priority") },
}

const priorityRank: Record<RecPriority, number> = { tinggi: 0, sedang: 1, rendah: 2 }
const q = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params)}`
const week = (f: Filters): Filters => ({ ...f, periode: "7d", kategori: "all" })

/** What to do at a zone, by what drives its score most. */
function zoneSteps(driver: string): string[] {
  switch (driver) {
    case "severity":
      return [
        tr("Wajibkan pengawas di lokasi selama pekerjaan berisiko tinggi", "Require a supervisor on site during high-risk work"),
        tr("Periksa barikade, rambu, dan jarak aman sebelum shift dimulai", "Check barriers, signs and safe distances before each shift"),
        tr("Bahas temuan Kritis minggu ini di safety talk", "Go through this week's Critical findings in the safety talk"),
      ]
    case "repeat":
      return [
        tr("Analisis akar masalah (5-why) bersama supervisor area", "Run a root-cause (5-why) review with the area supervisor"),
        tr("Tambah kontrol teknis: barikade fisik, rambu, atau jalur pejalan kaki", "Add an engineering control: physical barrier, signage or a walkway"),
        tr("Cek ulang minggu depan apakah temuan berulang berkurang", "Check next week whether the repeats went down"),
      ]
    case "trend":
      return [
        tr("Cari apa yang berubah minggu ini: kontraktor baru, lembur, atau alur kerja", "Find what changed this week: new contractors, overtime or workflow"),
        tr("Naikkan frekuensi patroli sampai tren kembali turun", "Patrol more often until the trend comes back down"),
      ]
    case "lingkungan":
      return [
        tr("Cek sumber debu, gas, atau panas di zona ini dan pasang kontrol (penyiraman, ventilasi)", "Find the dust, gas or heat source in this zone and add a control (water spraying, ventilation)"),
        tr("Pastikan APD pernapasan dan pendengaran dipakai selama sensor di atas batas", "Make sure respiratory and hearing PPE is worn while sensors are past their limits"),
        tr("Batasi lama kerja di zona ini saat alarm bahaya", "Limit time in the zone during danger alarms"),
      ]
    case "coverage":
      return [
        tr("Pulihkan kamera yang mati di zona ini dulu, karena skornya bisa bias", "Restore the zone's dead cameras first; the score may be biased"),
        tr("Sementara itu, tambah patroli manual di titik yang tidak terpantau", "Meanwhile, add manual patrols at the unwatched spots"),
      ]
    default:
      return [
        tr("Safety briefing 5 menit di awal setiap shift di zona ini", "A 5-minute safety briefing at the start of every shift here"),
        tr("Supervisor patroli dua kali per shift pada jam rawan", "Supervisor patrols twice a shift during peak hours"),
        tr("Tinjau ulang JSA untuk pekerjaan di zona ini", "Review the JSA for work in this zone"),
      ]
  }
}

const driverText: Record<string, () => string> = {
  volume: () => tr("volume temuan", "finding volume"),
  severity: () => tr("porsi Kritis/Tinggi", "Critical/High share"),
  repeat: () => tr("temuan berulang", "repeat findings"),
  trend: () => tr("tren naik", "a rising trend"),
  coverage: () => tr("gap kamera", "camera gaps"),
  lingkungan: () => tr("kondisi lingkungan", "environment readings"),
}

/** Per category: the headline and the steps when its confirmed findings go up week on week. */
const kategoriPlay: Record<Kategori, { title: () => string; steps: () => string[] }> = {
  apd: {
    title: () => tr("Kampanye kepatuhan APD minggu ini", "Run a PPE compliance push this week"),
    steps: () => [
      tr("Cek stok dan kondisi APD di setiap pintu masuk area", "Check PPE stock and condition at every area entrance"),
      tr("Briefing APD di awal shift, tekankan jenis yang paling sering dilanggar", "PPE briefing at shift start, on the most-missed items"),
      tr("Supervisor menegur langsung di lapangan, catat sebagai coaching", "Supervisors correct on the spot and log it as coaching"),
    ],
  },
  "zona-terlarang": {
    title: () => tr("Perketat akses ke zona terlarang", "Tighten access to restricted zones"),
    steps: () => [
      tr("Periksa gerbang, gembok, dan rambu di batas zona", "Inspect gates, locks and signs at the zone boundary"),
      tr("Cocokkan daftar izin kerja dengan orang yang terdeteksi masuk", "Match work permits against the people detected entering"),
      tr("Sosialisasi ulang aturan akses ke kontraktor", "Brief contractors again on the access rules"),
    ],
  },
  "orang-tak-dikenal": {
    title: () => tr("Rapikan kontrol akses orang di gerbang", "Tighten people access control at the gates"),
    steps: () => [
      tr("Cek apakah orang tak dikenal itu kontraktor atau tamu yang belum didaftarkan", "Check whether the unknown people were contractors or visitors not yet registered"),
      tr("Daftarkan wajah pekerja baru sebelum shift pertamanya", "Register new workers' faces before their first shift"),
      tr("Tamu wajib didampingi dan didaftarkan di pos", "Visitors must be escorted and registered at the gate"),
    ],
  },
  "kendaraan-tak-terdaftar": {
    title: () => tr("Lengkapi daftar kendaraan yang boleh masuk", "Complete the list of vehicles allowed in"),
    steps: () => [
      tr("Minta vendor mengirim daftar plat sebelum pengiriman", "Ask vendors for plate lists before deliveries"),
      tr("Petugas gerbang menahan kendaraan di daftar hitam dan melapor", "Gate staff hold blacklisted vehicles and report them"),
      tr("Tinjau plat yang sering muncul tapi belum terdaftar", "Review plates that appear often but are not registered"),
    ],
  },
  "perubahan-objek": {
    title: () => tr("Periksa penataan barang di gudang", "Check how goods are stacked in the store"),
    steps: () => [
      tr("Cek tumpukan yang bergeser atau roboh dan batas tinggi susunan", "Check stacks that shifted or fell and the stacking height limit"),
      tr("Ganti palet dan rak yang rusak", "Replace damaged pallets and racks"),
      tr("Perbarui gambar acuan setelah tata letak berubah resmi", "Update the reference image after an approved layout change"),
    ],
  },
}

const pctChange = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : 100)

/** Every recommendation for the week in scope, most important first. */
export function recommendations(filters: Filters): Rekomendasi[] {
  const f = week(filters)
  const now = Date.now()
  const facts = briefFacts(f)
  const out: Rekomendasi[] = []

  // 1. Zones whose risk is high or climbing.
  for (const z of zoneRanking(f)
    .filter((z) => z.score >= 50 || (z.delta ?? 0) >= 10)
    .slice(0, 2)) {
    const driver = Object.entries(z.parts).sort((a, b) => b[1] - a[1])[0][0]
    out.push({
      id: `zona-${z.site}-${z.zona}`,
      area: "zona",
      priority: z.score >= 75 ? "tinggi" : z.score >= 50 ? "sedang" : "rendah",
      title: tr(`Perketat pengawasan di ${z.label}`, `Step up supervision at ${z.label}`),
      why: tr(
        `Skor risiko ${z.score}${z.delta !== undefined ? ` (${z.delta >= 0 ? "+" : ""}${z.delta} dari minggu lalu)` : ""}, terutama karena ${driverText[driver]()}.`,
        `Risk score ${z.score}${z.delta !== undefined ? ` (${z.delta >= 0 ? "+" : ""}${z.delta} vs last week)` : ""}, driven mainly by ${driverText[driver]()}.`,
      ),
      metric: { value: String(z.score), label: tr("skor risiko dari 100", "risk score of 100"), bar: { value: z.score, max: 100, marker: z.previous, markerLabel: tr(`minggu lalu ${z.previous}`, `last week ${z.previous}`) } },
      steps: zoneSteps(driver),
      owner: "Area Supervisor",
      refs: [],
      link: { label: tr("Lihat indikasi zona", "See zone indications"), href: z.href },
      site: z.site,
      zona: z.zona,
      weight: z.score,
    })
  }

  // 2. Categories whose confirmed findings went up week on week.
  for (const r of weekCompare(f)) {
    const change = pctChange(r.temuanIni, r.temuanLalu)
    if (r.temuanIni < 3 || change < 30) continue
    const play = kategoriPlay[r.kategori as Kategori]
    out.push({
      id: `kategori-${r.kategori}`,
      area: "kepatuhan",
      // A jump from 2 to 6 is +200% but still small, so high priority needs volume too.
      priority: change >= 50 && r.temuanIni >= 10 ? "tinggi" : "sedang",
      title: play.title(),
      why: tr(
        `Temuan terkonfirmasi ${kategoriDef(r.kategori as Kategori).label} naik dari ${r.temuanLalu} ke ${r.temuanIni} (+${change}%).`,
        `Confirmed ${kategoriDef(r.kategori as Kategori).label} findings went from ${r.temuanLalu} to ${r.temuanIni} (+${change}%).`,
      ),
      metric: { value: `${r.temuanLalu} → ${r.temuanIni}`, label: tr(`temuan terkonfirmasi (+${change}%)`, `confirmed findings (+${change}%)`), compare: { a: r.temuanIni, b: r.temuanLalu, aLabel: tr("Minggu ini", "This week"), bLabel: tr("Minggu lalu", "Last week") } },
      steps: play.steps(),
      owner: "HSE Manager",
      refs: [],
      link: { label: tr("Lihat tren kategori", "See the category trend"), href: q("/analisis", { site: filters.site, kategori: r.kategori }) },
      weight: change,
    })
  }

  // 3. The same finding again and again at one place. A zone already on the list gets the repeat
  // folded into its card (root-cause steps, the records), so one place never shows up twice.
  for (const r of repeatRows(f).slice(0, 3)) {
    const refs = r.refs.filter((s): s is { id: string; href: string } => typeof s !== "string")
    const repeatWhy = tr(`${r.count} temuan ${r.kategori} sejenis dalam ${rules.repeatFinding.days} hari di tempat yang sama: teguran saja tidak cukup.`, `${r.count} similar ${r.kategori} findings in ${rules.repeatFinding.days} days at the same place: reminders alone aren't working.`)
    const zone = out.find((x) => x.area === "zona" && x.site === r.site && x.zona === r.zona)
    if (zone) {
      zone.why = `${zone.why} ${repeatWhy}`
      zone.steps = [...zoneSteps("repeat").slice(0, 2), ...zone.steps.slice(0, 1)]
      zone.refs = [...zone.refs, ...refs]
      continue
    }
    out.push({
      id: `berulang-${r.site}-${r.zona}-${r.kategori}`,
      area: "zona",
      priority: r.count >= rules.repeatFinding.count * 2 ? "tinggi" : "sedang",
      title: tr(`Hentikan temuan ${r.kategori} berulang di ${r.label}`, `Stop the repeating ${r.kategori} findings at ${r.label}`),
      why: repeatWhy,
      metric: { value: String(r.count), label: tr(`temuan dalam ${rules.repeatFinding.days} hari`, `findings in ${rules.repeatFinding.days} days`) },
      steps: zoneSteps("repeat"),
      owner: "HSE Officer",
      refs,
      link: { label: tr("Lihat temuannya", "See the findings"), href: r.href },
      site: r.site,
      zona: r.zona,
      weight: r.count * 10,
    })
  }

  // 4. Corrective actions past their due date.
  const actions = actionsIn({ ...f, periode: "30d" })
  const overdue = actions.filter((a) => isOverdue(a, now))
  if (overdue.length) {
    const open = actions.filter((a) => !actionDone.includes(a.status)).length
    const perPic = [...overdue.reduce((m, a) => m.set(a.ownerId, (m.get(a.ownerId) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])
    const [topId, topN] = perPic[0]
    out.push({
      id: "tindakan-overdue",
      area: "respons",
      priority: overdue.length >= 10 || overdue.length / Math.max(open, 1) >= 0.5 ? "tinggi" : "sedang",
      title: tr(`Tuntaskan ${overdue.length} tindakan korektif yang lewat tenggat`, `Close out ${overdue.length} overdue corrective actions`),
      why: tr(`${overdue.length} dari ${open} tindakan terbuka sudah lewat tenggat; ${userName(topId)} memegang ${topN}.`, `${overdue.length} of ${open} open actions are past due; ${userName(topId)} holds ${topN}.`),
      metric: { value: String(overdue.length), label: tr(`dari ${open} tindakan terbuka`, `of ${open} open actions`), bar: { value: overdue.length, max: Math.max(open, 1) } },
      steps: [
        tr(`Rapat singkat 15 menit dengan PIC, mulai dari ${userName(topId)} (${topN} overdue)`, `A 15-minute check-in with owners, starting with ${userName(topId)} (${topN} overdue)`),
        tr("Bagi ulang tugas bila satu PIC memegang lebih dari 4 tindakan", "Reassign work when one owner holds more than 4 actions"),
        tr("Tetapkan tenggat baru yang realistis dan catat alasannya", "Set realistic new due dates and record why"),
      ],
      owner: "HSE Manager",
      refs: overdue.slice(0, 6).map((a) => ({ id: a.id, href: q("/tindakan", { site: a.site, id: a.id }) })),
      link: { label: tr("Buka tindakan overdue", "Open overdue actions"), href: q("/tindakan", { site: filters.site, status: "overdue" }) },
      weight: overdue.length * 5,
    })
  }

  // 5. Response: the night shift and the review queue.
  if (facts.shiftMalam.flagged)
    out.push({
      id: "shift-malam",
      area: "respons",
      priority: "sedang",
      title: tr("Tambah reviewer di shift malam", "Add a reviewer on the night shift"),
      why: tr(`SLA acknowledge terlewat ${facts.shiftMalam.malam}% di shift malam, dibanding ${facts.shiftMalam.siang}% di siang hari.`, `The acknowledgement SLA is missed on ${facts.shiftMalam.malam}% of night-shift indications vs ${facts.shiftMalam.siang}% by day.`),
      metric: { value: `${facts.shiftMalam.malam}%`, label: tr("SLA terlewat di shift malam", "SLA missed at night"), compare: { a: facts.shiftMalam.malam / 100, b: facts.shiftMalam.siang / 100, aLabel: tr("Malam", "Night"), bLabel: tr("Siang", "Day"), format: "pct" } },
      steps: [
        tr("Jadwalkan satu operator control room tambahan untuk shift malam", "Schedule one more control room operator for nights"),
        tr("Aktifkan notifikasi eskalasi ke HSE Officer jaga malam", "Turn on escalation alerts to the on-call HSE Officer"),
      ],
      owner: "HSE Manager",
      refs: [],
      link: { label: tr("Lihat kualitas per shift", "See quality per shift"), href: q("/kualitas", { site: filters.site }) },
      weight: facts.shiftMalam.malam - facts.shiftMalam.siang,
    })
  const days = facts.backlog.days
  if (facts.menungguReview > 0 && (!Number.isFinite(days) || days > 2))
    out.push({
      id: "backlog-review",
      area: "respons",
      priority: !Number.isFinite(days) || days > 5 ? "tinggi" : "sedang",
      title: tr("Kurangi antrean review", "Bring the review queue down"),
      why: tr(
        `${facts.menungguReview} indikasi menunggu review; dengan laju ${facts.backlog.perDay.toFixed(1)} per hari, antrean baru habis ${Number.isFinite(days) ? `dalam ±${days.toFixed(1)} hari` : "tidak dalam waktu dekat"}.`,
        `${facts.menungguReview} indications await review; at ${facts.backlog.perDay.toFixed(1)} a day the queue clears ${Number.isFinite(days) ? `in about ${days.toFixed(1)} days` : "nowhere soon"}.`,
      ),
      metric: { value: String(facts.menungguReview), label: tr("menunggu review", "awaiting review") },
      steps: [
        tr("Sisihkan blok waktu review harian 30 menit per reviewer", "Block 30 minutes of review per reviewer each day"),
        tr("Review yang Kritis/Tinggi dulu, sisanya bisa ditinjau massal", "Review Critical/High first; the rest can be bulk-reviewed"),
      ],
      owner: "Operator Control Room",
      refs: [],
      link: { label: tr("Buka antrean review", "Open the review queue"), href: q("/indikasi", { site: filters.site, status: "menunggu", periode: "30d" }) },
      weight: facts.menungguReview,
    })

  // 6. Detectors that raise mostly false alarms.
  for (const d of facts.tuning)
    out.push({
      id: `tuning-${d.detektor}`,
      area: "deteksi",
      priority: d.share >= 50 ? "sedang" : "rendah",
      title: tr(`Setel ulang detektor ${d.detektor}`, `Retune the ${d.detektor} detector`),
      why: tr(`${d.share}% dari ${d.n} review adalah alarm palsu: operator membuang waktu dan bisa mulai mengabaikan alarm.`, `${d.share}% of ${d.n} reviews were false alarms: operators lose time and may start ignoring alerts.`),
      metric: { value: `${d.share}%`, label: tr("alarm palsu", "false alarms"), bar: { value: d.share, max: 100, marker: rules.tuningCandidate.share * 100, markerLabel: tr(`batas ${rules.tuningCandidate.share * 100}%`, `limit ${rules.tuningCandidate.share * 100}%`) } },
      steps: [
        tr("Kumpulkan contoh alarm palsu minggu ini", "Collect this week's false-alarm examples"),
        tr("Sesuaikan area deteksi atau ambang skor bersama tim AI", "Adjust the detection area or score threshold with the AI team"),
        tr("Pantau porsi alarm palsu minggu depan", "Watch the false-alarm share next week"),
      ],
      owner: "IT/OT Admin",
      refs: [],
      link: { label: tr("Lihat kualitas deteksi", "See detection quality"), href: q("/kualitas", { site: filters.site }) },
      weight: d.share,
    })

  // 7. Devices: cameras down, weak links, batteries running out.
  const steps: string[] = [
    ...facts.gap.filter((g) => g.jenis === "kamera" && g.status === "offline").map((g) => tr(`Periksa kamera ${g.id} yang offline`, `Check camera ${g.id}, offline`)),
    ...facts.daya.map((p) => tr(`Isi atau ganti baterai ${p.id} (${p.baterai}%, ±${p.runtime} jam lagi)`, `Charge or swap the battery of ${p.id} (${p.baterai}%, ~${p.runtime} h left)`)),
    ...facts.link.map((l) => tr(`Cek link ${l.id} (${l.mbps} Mbps)`, `Check link ${l.id} (${l.mbps} Mbps)`)),
  ]
  const deviceIds = [...new Set([...facts.gap.map((g) => g.id), ...facts.daya.map((p) => p.id), ...facts.link.map((l) => l.id)])]
  if (deviceIds.length) {
    const site = (id: string) => facts.gap.find((g) => g.id === id)?.site ?? facts.daya.find((p) => p.id === id)?.site ?? facts.link.find((l) => l.id === id)?.site ?? filters.site
    out.push({
      id: "perangkat",
      area: "perangkat",
      // A battery running out ends coverage within hours; the rest can wait for the next maintenance round.
      priority: facts.daya.length ? "tinggi" : "sedang",
      title: tr("Pulihkan perangkat pemantauan", "Restore monitoring devices"),
      why: tr(`${deviceIds.length} perangkat tidak normal. Selama mati, "tidak ada kejadian" di area itu belum tentu aman.`, `${deviceIds.length} devices are not healthy. While they're down, "no incidents" there doesn't mean safe.`),
      metric: { value: String(deviceIds.length), label: tr("perangkat bermasalah", "devices with issues") },
      steps: steps.length > 4 ? [...steps.slice(0, 3), tr(`dan ${steps.length - 3} perangkat lain`, `and ${steps.length - 3} more devices`)] : steps.length ? steps : [tr("Periksa perangkat yang statusnya menurun", "Check the degraded devices")],
      owner: "IT/OT Admin",
      refs: deviceIds.slice(0, 6).map((id) => ({ id, href: q("/sumber", { site: site(id), id }) })),
      link: { label: tr("Buka Kesehatan Perangkat", "Open Device Health"), href: q("/sumber", { site: filters.site }) },
      weight: deviceIds.length,
    })
  }

  return out.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.weight - a.weight)
}

/** The list as Markdown, for a meeting note or a chat. */
export function recommendationsMarkdown(list: Rekomendasi[], heading: string) {
  const lines = [`# ${heading}`, ""]
  list.forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.title}`, `${priorityLabel[r.priority]} · ${areaLabel[r.area]} · ${r.owner}`, "", r.why, "")
    r.steps.forEach((s) => lines.push(`- [ ] ${s}`))
    if (r.refs.length) lines.push("", `${tr("Rujukan", "References")}: ${r.refs.map((x) => x.id).join(", ")}`)
    lines.push("")
  })
  return lines.join("\n")
}

export const getRecommendations = (f: Filters) => respond(f, () => recommendations(f), [] as Rekomendasi[])
