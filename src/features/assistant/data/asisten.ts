/**
 * The AI Assistant page's answers. ponytail: there is no model behind it. Each question is matched
 * to an intent and answered from `briefFacts`, the same computed facts a connected model would get,
 * and laid out as a chat reply (headings, paragraphs, lists) with every record ID cited. To connect
 * a real model, replace `reply` with a call to the narrative service that sends the facts and the
 * question, and keep the rule that it cites IDs and never invents numbers.
 */

import { caseStatusMeta, kategoriDef, workflowMeta, type Kategori } from "@/shared/config/indikasi"
import { answer, briefFacts, intents, writeBrief, zoneRanking, type Facts, type Lang, type Seg } from "@/features/analysis/data/analisis"
import { byPriority, indicationsIn } from "@/features/indications/data/indikasi"
import { casesIn, userName } from "@/features/cases/data/kasus"
import { master, siteName } from "@/shared/data/master"
import type { Filters } from "@/shared/data/filters"
import { respond } from "@/shared/data/mock-api"
import { severityMeta } from "@/shared/config/events"
import { locale } from "@/shared/lib/i18n"

export type Block = { kind: "h"; text: string } | { kind: "p"; segs: Seg[] } | { kind: "list"; items: Seg[][]; ordered?: boolean }

export type Reply = {
  blocks: Block[]
  /** Every record the reply cites, once, for the "Sumber data" line. */
  cites: { id: string; href: string }[]
  /** Questions that follow naturally from this one. */
  follow: string[]
  /** Indications whose thumbnail and clip the reply shows as evidence, most important first. */
  evidence?: string[]
  /** The question asked for evidence, so the page opens the first one in the viewer. */
  showEvidence?: boolean
}

const tr = (lang: Lang, id: string, en: string) => (lang === "id" ? id : en)

/** English if the question reads English; otherwise Indonesian. */
export const detectLang = (q: string): Lang => (/\b(what|which|how|why|is|are|the|should|show|me|give|tell|about|summary|summarize|cases?|hello|hi)\b/i.test(q) ? "en" : "id")

/** Answer paragraphs as blocks: "• …" and "1. …" lines become one list. */
function toBlocks(paragraphs: Seg[][]): Block[] {
  const blocks: Block[] = []
  for (const p of paragraphs) {
    const head = typeof p[0] === "string" ? p[0] : ""
    const ordered = /^\d+\.\s/.test(head)
    if (ordered || /^•\s/.test(head)) {
      const item = [head.replace(/^(•|\d+\.)\s/, ""), ...p.slice(1)]
      const last = blocks.at(-1)
      if (last?.kind === "list" && !!last.ordered === ordered) last.items.push(item)
      else blocks.push({ kind: "list", items: [item], ordered })
    } else blocks.push({ kind: "p", segs: p })
  }
  return blocks
}

function citesOf(blocks: Block[]) {
  const seen = new Map<string, string>()
  const walk = (segs: Seg[]) => segs.forEach((s) => typeof s !== "string" && !seen.has(s.id) && seen.set(s.id, s.href))
  for (const b of blocks) {
    if (b.kind === "p") walk(b.segs)
    if (b.kind === "list") b.items.forEach(walk)
  }
  // Record IDs only (IND-…, TND-…, SAT-02); zone names and "see findings" links stay in the text.
  return [...seen].filter(([id]) => /^[A-Z][A-Z0-9]*-[A-Z0-9-]+$/.test(id)).map(([id, href]) => ({ id, href }))
}

const label = (lang: Lang, id: string) => {
  const i = intents.find((x) => x.id === id)!
  return lang === "id" ? i.id_label : i.en_label
}

const followFor: Record<string, string[]> = {
  risk: ["why", "decisions", "week"],
  why: ["risk", "overdue", "coverage"],
  decisions: ["overdue", "backlog", "risk"],
  overdue: ["decisions", "backlog"],
  backlog: ["shift", "false"],
  coverage: ["link", "decisions"],
  link: ["coverage", "backlog"],
  false: ["backlog", "week"],
  shift: ["backlog", "decisions"],
  week: ["risk", "false"],
}

const categoryWords: [RegExp, Kategori][] = [
  [/apd|ppe|helm|helmet|rompi|vest|sepatu|boots/i, "apd"],
  [/terlarang|restricted|intrusi|intrud|penyusup|masuk zona|alat berat|heavy|excavator/i, "zona-terlarang"],
  [/wajah|face|tak dikenal|tidak dikenal|unknown|orang asing|stranger/i, "orang-tak-dikenal"],
  [/plat|nopol|tnkb|kendaraan|vehicle|plate|truk|truck/i, "kendaraan-tak-terdaftar"],
  [/tumpukan|susunan|palet|pallet|rak|rack|roboh|bergeser|objek|object/i, "perubahan-objek"],
]

/**
 * Builds the reply. Same question, same data, same answer: nothing is generated. A reply that cites
 * indications also carries them as evidence, so the page shows the frame and the clip without
 * leaving the conversation.
 */
export function reply(question: string, lang: Lang, f: Filters, facts: Facts = briefFacts(f)): Reply {
  const r = compose(question, lang, f, facts)
  return r.evidence ? r : { ...r, evidence: r.cites.filter((c) => c.id.startsWith("IND-")).slice(0, 4).map((c) => c.id) }
}

function compose(question: string, lang: Lang, f: Filters, facts: Facts): Reply {
  const t = (id: string, en: string) => tr(lang, id, en)
  const q = question.trim()

  // Greeting or "what can you do".
  if (/^(halo|hai|hi|hello|hey)\b|bisa apa|bisa bantu|what can you|help|bantuan/i.test(q)) {
    const blocks: Block[] = [
      { kind: "p", segs: [t(`Halo! Saya asisten HSE untuk ${facts.site.join(" dan ")}. Saya menjawab dari data yang sudah dihitung dashboard ini, jadi setiap angka bisa ditelusuri ke record-nya.`, `Hi! I'm the HSE assistant for ${facts.site.join(" and ")}. I answer from data this dashboard has already computed, so every number traces back to its records.`)] },
      { kind: "h", text: t("Yang bisa saya bantu", "What I can help with") },
      {
        kind: "list",
        items: [
          [t("Ringkasan atau brief manajemen untuk periode ini", "A summary or management brief for this period")],
          [t("Zona paling berisiko dan alasannya", "The riskiest zones and why")],
          [t("Keputusan yang perlu diambil sekarang", "Decisions needed now")],
          [t("Antrean review, tindakan overdue, kasus terbuka", "Review backlog, overdue actions, open cases")],
          [t("Kamera, link Starlink, dan daya perangkat", "Cameras, Starlink links and device power")],
          [t("Detail satu zona, mis. “ceritakan tentang Loading Point 02”", "One zone in detail, e.g. “tell me about Loading Point 02”")],
        ],
      },
    ]
    return { blocks, cites: [], follow: [t("Buatkan brief minggu ini", "Write this week's brief"), label(lang, "risk"), label(lang, "decisions")] }
  }

  // The management brief, as a chat reply.
  if (/brief|ringkas|rangkum|ringkasan|summary|summari[sz]e|laporan|report/i.test(q)) {
    const b = writeBrief(facts, lang)
    const blocks: Block[] = [{ kind: "p", segs: [t("Berikut brief untuk cakupan dan periode yang sedang dipilih.", "Here is the brief for the scope and period selected.")] }]
    for (const s of b.sections) blocks.push({ kind: "h", text: s.title }, ...toBlocks(s.paragraphs))
    return { blocks, cites: citesOf(blocks), follow: [label(lang, "why"), label(lang, "overdue"), label(lang, "coverage")] }
  }

  // Open cases.
  if (/\bkasus\b|\bcases?\b/i.test(q)) {
    const open = casesIn({ ...f, periode: "30d" }).filter((c) => c.status !== "closed")
    const blocks: Block[] = open.length
      ? [
          { kind: "p", segs: [t(`Ada ${open.length} kasus terbuka:`, `There are ${open.length} open cases:`)] },
          {
            kind: "list",
            items: open.slice(0, 8).map((c) => [
              { id: c.id, href: `/kasus?${new URLSearchParams({ site: c.site, id: c.id })}` },
              ` — ${c.judul} · ${severityMeta[c.prioritas].label} · ${caseStatusMeta[c.status].label} · ${t("pemilik", "owner")} ${userName(c.ownerId)}`,
            ]),
          },
        ]
      : [{ kind: "p", segs: [t("Tidak ada kasus terbuka.", "There are no open cases.")] }]
    return { blocks, cites: citesOf(blocks), follow: [label(lang, "overdue"), label(lang, "decisions")] }
  }

  // A zone named in the question narrows the violations below, or gets its own answer.
  const zone = master()
    .zona.filter((z) => z.aktif)
    .sort((a, b) => b.nama.length - a.nama.length)
    .find((z) => q.toLowerCase().includes(z.nama.toLowerCase()) || new RegExp(`\\b${z.kode}\\b`, "i").test(q))
  // Violations with their evidence: "what critical violations happened today?"
  if (/pelanggaran|violations?|bukti|evidence|rekaman|recording|video|klip|\bclips?\b|capture|tangkapan|kritis|critical|insiden|incident/i.test(q)) {
    const today = /hari ini|today|tadi|barusan/i.test(q)
    const criticalOnly = /kritis|critical/i.test(q)
    const kategori = categoryWords.find(([re]) => re.test(q))?.[1]
    const scope = { ...f, zona: zone?.id ?? f.zona, kategori: kategori ?? "all", periode: today ? "today" : f.periode }
    const urgent = (e: { severity: keyof typeof severityMeta }) => (criticalOnly ? e.severity === "kritis" : severityMeta[e.severity].rank <= severityMeta.tinggi.rank)
    let list = indicationsIn(scope).filter(urgent)
    // Nothing today: say so, then show the period instead of an empty answer.
    const widened = today && !list.length
    if (widened) list = indicationsIn({ ...scope, periode: f.periode === "today" ? "7d" : f.periode }).filter(urgent)
    list = [...list].sort(byPriority)
    const level = criticalOnly ? t("kritis", "critical") : t("kritis/tinggi", "critical/high")
    const where = [kategori && kategoriDef(kategori).label, zone?.nama].filter(Boolean).join(" · ")
    const forWhere = where ? t(` untuk ${where}`, ` for ${where}`) : ""
    const sameDay = today && !widened
    const time = (d: Date) => d.toLocaleString(lang === "id" ? "id-ID" : locale(), sameDay ? { timeStyle: "short" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    if (!list.length)
      return {
        blocks: [{ kind: "p", segs: [t(`Tidak ada indikasi ${level}${forWhere} ${sameDay ? "hari ini" : "dalam periode ini"}.`, `No ${level} indications${forWhere} ${sameDay ? "today" : "in this period"}.`)] }],
        cites: [],
        follow: [label(lang, "backlog"), label(lang, "risk")],
        evidence: [],
      }
    const shown = list.slice(0, 6)
    const blocks: Block[] = [
      {
        kind: "p",
        segs: [
          widened
            ? t(`Hari ini belum ada indikasi ${level}${forWhere}. Yang terbaru dalam periode filter ada ${list.length}, diurutkan dari yang paling mendesak:`, `No ${level} indications${forWhere} today yet. The period has ${list.length}, most urgent first:`)
            : t(`Ada ${list.length} indikasi ${level}${forWhere} ${today ? "hari ini" : "dalam periode ini"}, diurutkan dari yang paling mendesak:`, `There are ${list.length} ${level} indications${forWhere} ${today ? "today" : "in this period"}, most urgent first:`),
        ],
      },
      {
        kind: "list",
        ordered: true,
        items: shown.map((e) => [
          { id: e.id, href: `/indikasi?${new URLSearchParams({ site: e.site, id: e.id, periode: "30d", status: "semua" })}` },
          ` — ${e.judul} · ${severityMeta[e.severity].label} · ${e.zona.label} · ${e.kamera} · ${time(e.waktu)} · ${workflowMeta[e.workflow].label}`,
        ]),
      },
      {
        kind: "p",
        segs: [
          list.length > shown.length ? t(`${list.length - shown.length} lainnya ada di halaman Indikasi AI. `, `${list.length - shown.length} more on the AI Indications page. `) : "",
          t("Bukti tiap indikasi ada di bawah. Buka satu untuk melihat thumbnail-nya dan memutar atau meminta klipnya. Indikasi tetap perlu direview orang sebelum dihitung sebagai pelanggaran.", "The evidence for each one is below. Open it to see the thumbnail and play or request the clip. A person still has to review an indication before it counts as a violation."),
        ],
      },
    ]
    return { blocks, cites: citesOf(blocks), follow: [label(lang, "backlog"), t("Pelanggaran APD hari ini", "PPE violations today"), label(lang, "risk")], evidence: shown.map((e) => e.id), showEvidence: true }
  }

  if (zone) {
    const scored = zoneRanking({ ...f, zona: "all" }).filter((z) => z.zona === zone.id)
    if (scored.length) {
      const blocks: Block[] = []
      for (const z of scored) {
        const p = z.parts
        blocks.push(
          { kind: "h", text: `${zone.nama} · ${siteName(z.site)}` },
          {
            kind: "p",
            segs: [
              t(`Skor risiko ${z.score} dari 100`, `Risk score ${z.score} out of 100`),
              z.delta !== undefined ? t(` (${z.delta >= 0 ? "+" : ""}${z.delta} dari 7 hari lalu)`, ` (${z.delta >= 0 ? "+" : ""}${z.delta} vs 7 days ago)`) : "",
              t(`, ${z.cameras} kamera di zona ini. `, `, ${z.cameras} cameras in the zone. `),
              { id: t("Lihat temuan", "See findings"), href: z.href },
            ],
          },
          {
            kind: "list",
            items: [
              [t(`Volume temuan 14 hari: ${p.volume}/35`, `14-day finding volume: ${p.volume}/35`)],
              [t(`Porsi Kritis/Tinggi: ${p.severity}/20`, `Critical/High share: ${p.severity}/20`)],
              [t(`Temuan berulang 7 hari: ${p.repeat}/15`, `7-day repeats: ${p.repeat}/15`)],
              [t(`Tren 7 hari: ${p.trend}/15`, `7-day trend: ${p.trend}/15`)],
              [t(`Ketidakpastian cakupan: ${p.coverage}/15`, `Coverage uncertainty: ${p.coverage}/15`)],
            ],
          },
        )
        const repeats = facts.berulang.filter((r) => r.label.startsWith(zone.nama))
        for (const r of repeats) blocks.push({ kind: "p", segs: [t(`${r.kategori} berulang: ${r.count} temuan dalam 7 hari (`, `${r.kategori} repeating: ${r.count} findings in 7 days (`), ...r.refs.slice(0, 3).flatMap((s, i) => (i ? [", ", s] : [s])), ")."] })
      }
      return { blocks, cites: citesOf(blocks), follow: [label(lang, "decisions"), label(lang, "coverage")] }
    }
  }

  // Everything else the dashboard has an intent for.
  const a = answer(q, facts, lang, f)
  if (!a.intent)
    return {
      blocks: [
        { kind: "p", segs: [t("Maaf, pertanyaan itu di luar data yang saya pegang. Saya hanya menjawab dari indikasi, temuan, kasus, tindakan, dan sumber pemantauan di dashboard ini, supaya tidak ada angka yang dikarang.", "Sorry, that's outside the data I hold. I only answer from the indications, findings, cases, actions and monitoring sources on this dashboard, so no number is ever made up.")] },
        { kind: "p", segs: [t("Coba salah satu pertanyaan di bawah.", "Try one of the questions below.")] },
      ],
      cites: [],
      follow: [t("Buatkan brief minggu ini", "Write this week's brief"), label(lang, "risk"), label(lang, "backlog")],
    }
  const blocks = toBlocks(a.segments)
  return { blocks, cites: citesOf(blocks), follow: (followFor[a.intent] ?? []).map((id) => label(lang, id)) }
}

/** Starter prompts for an empty conversation. */
export const starters = (lang: Lang) => [
  { title: tr(lang, "Brief minggu ini", "This week's brief"), prompt: tr(lang, "Buatkan brief manajemen minggu ini", "Write this week's management brief") },
  { title: tr(lang, "Zona paling berisiko", "Riskiest zones"), prompt: label(lang, "risk") },
  { title: tr(lang, "Keputusan sekarang", "Decisions now"), prompt: label(lang, "decisions") },
  { title: tr(lang, "Tindakan overdue", "Overdue actions"), prompt: label(lang, "overdue") },
  { title: tr(lang, "Kondisi link & daya", "Links & power"), prompt: label(lang, "link") },
  { title: tr(lang, "Kasus terbuka", "Open cases"), prompt: tr(lang, "Kasus apa saja yang masih terbuka?", "Which cases are still open?") },
  { title: tr(lang, "Pelanggaran kritis + bukti", "Critical violations + evidence"), prompt: tr(lang, "Pelanggaran kritis apa saja hari ini? Tunjukkan buktinya.", "What critical violations happened today? Show the evidence.") },
]

/** The mock API: a short wait like a model's first token, then the whole reply. */
export const getReply = (question: string, lang: Lang, f: Filters) => respond({ ...f, demo: undefined }, () => reply(question, lang, f), { blocks: [], cites: [], follow: [], evidence: [] } as Reply)
