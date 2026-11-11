import { locale, tr } from "@/shared/lib/i18n"
/**
 * The event summary as a one-page A4 PDF, built in the browser with jsPDF.
 * The page only calls `generateSummaryPdf` and gets a file back, so this can move to a server
 * endpoint later without touching the page (see README).
 */

export type SummarySection = "kpi" | "harian" | "tipe" | "zona" | "teratas"

export const summarySections: { id: SummarySection; label: string }[] = [
  { id: "kpi", get label() { return tr("Angka utama", "Key figures") } },
  { id: "harian", get label() { return tr("Grafik event per hari", "Events per day chart") } },
  { id: "tipe", get label() { return tr("Grafik per tipe", "Per-type chart") } },
  { id: "zona", get label() { return tr("Zona terrawan", "Riskiest zones") } },
  { id: "teratas", get label() { return tr("Tabel event teratas", "Top events table") } },
]

type Bar = { label: string; value: number }

export type SummaryInput = {
  appName: string
  /** Any image URL; it is redrawn as PNG for the PDF. */
  logo: string
  /** Brand color for headings and bars, as a hex string. */
  accent: string
  periodLabel: string
  filterText: string
  sections: SummarySection[]
  kpi: Bar[]
  perDay: Bar[]
  perType: Bar[]
  zones: Bar[]
  top: { id: string; waktu: string; tipe: string; judul: string; zona: string; severity: string; status: string; umur: string }[]
}

async function pngDataUrl(src: string) {
  const img = new Image()
  img.src = src
  await img.decode()
  // 128 px is plenty for an 8 mm logo and keeps the file small.
  const scale = Math.min(1, 128 / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/png")
}

export async function generateSummaryPdf(input: SummaryInput): Promise<Blob> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const left = 14
  const width = 182
  const muted = "#5b6b7a"
  const ink = "#0e1d2b"
  const has = (s: SummarySection) => input.sections.includes(s)
  let y = 14

  const fit = (text: string, max: number) => {
    if (doc.getTextWidth(text) <= max) return text
    let cut = text
    while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > max) cut = cut.slice(0, -1)
    return `${cut}…`
  }
  const heading = (text: string, x = left) => {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(ink)
    doc.text(text, x, y)
  }

  // Header: logo, app name, title, period and filters.
  try {
    doc.addImage(await pngDataUrl(input.logo), "PNG", left, y - 5, 8, 8)
  } catch {
    // A missing logo should not stop the report.
  }
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(ink).text(input.appName, left + 11, y)
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(muted)
  doc.text(tr(`Dibuat ${new Date().toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })}`, `Generated ${new Date().toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })}`), left + width, y, { align: "right" })
  y += 10
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(ink).text(tr("Ringkasan Event", "Event Summary"), left, y)
  y += 6
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(muted)
  for (const line of doc.splitTextToSize(`${input.periodLabel} · ${input.filterText}`, width)) {
    doc.text(line, left, y)
    y += 4.5
  }
  doc.setDrawColor("#d5dde5").line(left, y, left + width, y)
  y += 8

  if (has("kpi")) {
    const box = width / input.kpi.length
    input.kpi.forEach((k, i) => {
      const x = left + i * box
      doc.setFillColor("#f2f5f8").roundedRect(x, y - 4, box - 3, 16, 2, 2, "F")
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(muted).text(k.label, x + 3, y + 1)
      doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(ink).text(String(k.value), x + 3, y + 9)
    })
    y += 20
  }

  if (has("harian") && input.perDay.length) {
    heading(tr("Event per hari", "Events per day"))
    y += 4
    const h = 34
    const max = Math.max(1, ...input.perDay.map((b) => b.value))
    const step = width / input.perDay.length
    const labelEvery = Math.ceil(input.perDay.length / 15)
    input.perDay.forEach((b, i) => {
      const bh = (b.value / max) * h
      doc.setFillColor(input.accent).rect(left + i * step + step * 0.15, y + h - bh, step * 0.7, bh, "F")
      if (i % labelEvery === 0) doc.setFont("helvetica", "normal").setFontSize(6).setTextColor(muted).text(b.label, left + i * step + step / 2, y + h + 4, { align: "center" })
    })
    y += h + 10
  }

  const barList = (title: string, bars: Bar[], x: number, w: number) => {
    let yy = y
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(ink).text(title, x, yy)
    yy += 5
    const max = Math.max(1, ...bars.map((b) => b.value))
    for (const b of bars) {
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(ink).text(fit(b.label, w * 0.38), x, yy + 3)
      doc.setFillColor("#e6ecf2").rect(x + w * 0.4, yy, w * 0.48, 4, "F")
      doc.setFillColor(input.accent).rect(x + w * 0.4, yy, (w * 0.48 * b.value) / max, 4, "F")
      doc.setTextColor(muted).text(String(b.value), x + w, yy + 3, { align: "right" })
      yy += 7
    }
    return yy
  }
  if (has("tipe") || has("zona")) {
    const both = has("tipe") && has("zona")
    const w = both ? width / 2 - 6 : width
    const ends = [
      has("tipe") ? barList(tr("Event per tipe", "Events per type"), input.perType, left, w) : y,
      has("zona") ? barList("Zona terrawan", input.zones, both ? left + width / 2 + 6 : left, w) : y,
    ]
    y = Math.max(...ends) + 6
  }

  if (has("teratas") && input.top.length) {
    heading(tr("Event teratas: severity tertinggi, lalu yang paling lama terbuka", "Top events: highest severity, then longest open"))
    y += 5
    const cols = [
      ["ID", 22],
      [tr("Waktu", "Time"), 22],
      [tr("Tipe", "Type"), 20],
      [tr("Kejadian", "Event"), 42],
      [tr("Zona", "Zone"), 22],
      ["Severity", 14],
      ["Status", 20],
      [tr("Umur", "Age"), 20],
    ] as const
    const row = (cells: string[], bold: boolean) => {
      let x = left
      doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(7.5).setTextColor(bold ? muted : ink)
      cells.forEach((c, i) => {
        doc.text(fit(c, cols[i][1] - 2), x, y)
        x += cols[i][1]
      })
      y += 2
      doc.setDrawColor("#e6ecf2").line(left, y, left + width, y)
      y += 4
    }
    row(
      cols.map((c) => c[0]),
      true,
    )
    for (const e of input.top) {
      if (y > 285) break
      row([e.id, e.waktu, e.tipe, e.judul, e.zona, e.severity, e.status, e.umur], false)
    }
  }

  return doc.output("blob")
}
