import { useEffect, useState } from "react"
import { Alert, Button, buttonVariants, Checkbox, CheckboxGroup, Label, ListBox, Modal, Select, Skeleton, Spinner } from "@heroui/react"

import { useWidgetData } from "@/shared/components/widget"
import { eventStatus, eventTypes, isUrgent, severityMeta } from "@/shared/config/events"
import { eventTypeOn } from "@/shared/config/modules"
import { ageLabel, byUrgency, getEventList, type HseEvent } from "@/features/events/data/events"
import { choicesOf, type FilterKey } from "@/shared/components/filter-bar"
import { filterOptions, type Filters } from "@/shared/data/filters"
import { getSettings } from "@/shared/data/settings"
import { duration } from "@/shared/lib/time"
import { generateSummaryPdf, summarySections, type SummaryInput, type SummarySection } from "@/features/events/lib/summary-pdf"
import { locale, tr } from "@/shared/lib/i18n"

const labelOf = (field: FilterKey, f: Filters) => choicesOf(field, f).find((o) => o.id === f[field])?.label ?? f[field]

/** Turns the event list into the numbers and rows the PDF shows. */
function summarize(events: HseEvent[], f: Filters, sections: SummarySection[]): SummaryInput {
  const now = Date.now()
  const count = <K extends string>(key: (e: HseEvent) => K) => events.reduce((acc, e) => acc.set(key(e), (acc.get(key(e)) ?? 0) + 1), new Map<K, number>())
  const hourly = f.periode === "today"
  const byBucket = count((e) => (hourly ? `${e.waktu.getHours()}` : e.waktu.toDateString()))
  const days = f.periode === "30d" ? 30 : f.periode === "7d" ? 7 : 1
  const perDay = hourly
    ? Array.from({ length: new Date().getHours() + 1 }, (_, h) => ({ label: `${String(h).padStart(2, "0")}.00`, value: byBucket.get(`${h}`) ?? 0 }))
    : Array.from({ length: days }, (_, i) => {
        const d = new Date(now - (days - 1 - i) * 86_400_000)
        return { label: d.toLocaleDateString(locale(), { day: "numeric", month: "short" }), value: byBucket.get(d.toDateString()) ?? 0 }
      })
  const byType = count((e) => e.tipe)
  const byZone = count((e) => e.zona.label)
  const byStatus = count((e) => e.status)

  return {
    appName: getSettings().brand.appName,
    // No logo leaves the header with the name alone; the PDF skips an image it can't load.
    logo: getSettings().brand.logo?.url ?? "",
    accent: getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim() || "#205478",
    periodLabel: labelOf("periode", f),
    filterText: (["site", "zona", "shift", "tipe", "severity"] as const).map((k) => labelOf(k, f)).join(" · "),
    sections,
    kpi: [
      { label: "Total event", value: events.length },
      { label: "Open", value: byStatus.get("open") ?? 0 },
      { label: "Acknowledged", value: byStatus.get("acknowledged") ?? 0 },
      { label: "Closed", value: byStatus.get("closed") ?? 0 },
      { label: tr("Kritis + tinggi", "Critical + high"), value: events.filter((e) => isUrgent(e.severity)).length },
    ],
    perDay,
    perType: (Object.keys(eventTypes) as (keyof typeof eventTypes)[]).filter(eventTypeOn).map((t) => ({ label: eventTypes[t], value: byType.get(t) ?? 0 })),
    zones: [...byZone].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value })),
    top: events
      .filter((e) => e.status !== "closed")
      .sort(byUrgency)
      .slice(0, 12)
      .map((e) => ({
        id: e.id,
        waktu: e.waktu.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        tipe: eventTypes[e.tipe],
        judul: e.judul,
        zona: e.zona.label,
        severity: severityMeta[e.severity].label,
        status: eventStatus[e.status].label,
        umur: ageLabel(e, now, duration),
      })),
  }
}

/** Builds the PDF from the chosen period and sections and shows it before download. */
function SummaryBody({ filters }: { filters: Filters }) {
  const [periode, setPeriode] = useState(filters.periode)
  const [sections, setSections] = useState<SummarySection[]>(summarySections.map((s) => s.id))
  const scoped = { ...filters, periode }
  const query = useWidgetData(() => getEventList(scoped), `${periode}|${JSON.stringify(filters)}`)
  const [pdf, setPdf] = useState<{ url: string; key: string } | null>(null)
  const [error, setError] = useState<Error>()
  const key = `${periode}|${sections.join()}|${query.data?.length}`

  useEffect(() => {
    if (!query.data || !sections.length) return
    let alive = true
    let url: string | undefined
    generateSummaryPdf(summarize(query.data, scoped, sections)).then(
      (blob) => {
        url = URL.createObjectURL(blob)
        if (alive) setPdf({ url, key })
        else URL.revokeObjectURL(url)
      },
      (e: Error) => alive && setError(e),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
    // `key` already captures the inputs that change the PDF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const ready = pdf?.key === key ? pdf.url : null

  return (
    <>
      <Modal.Body className="grid content-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Select value={periode} onChange={(value) => value && setPeriode(String(value))}>
            <Label>{tr("Periode", "Period")}</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {filterOptions.periode.map((o) => (
                  <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
                    {o.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <CheckboxGroup value={sections} onChange={(value) => setSections(value as SummarySection[])}>
            <Label>{tr("Bagian yang disertakan", "Sections to include")}</Label>
            {summarySections.map((s) => (
              <Checkbox key={s.id} value={s.id}>
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  {s.label}
                </Checkbox.Content>
              </Checkbox>
            ))}
          </CheckboxGroup>
          <p className="text-sm text-muted">Filter lain mengikuti halaman: {(["site", "zona", "shift", "tipe", "severity"] as const).map((k) => labelOf(k, filters)).join(", ")}.</p>
        </div>

        <div className="min-h-[24rem]">
          {error || query.error ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{tr("Ringkasan gagal dibuat", "The summary could not be built")}</Alert.Title>
                <Alert.Description>{(error ?? query.error)?.message}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : !sections.length ? (
            <p className="text-sm text-muted">{tr("Pilih minimal satu bagian.", "Pick at least one section.")}</p>
          ) : ready ? (
            <iframe title={tr("Pratinjau ringkasan PDF", "PDF summary preview")} src={ready} className="h-[65vh] w-full rounded-lg border border-border" />
          ) : (
            <div aria-busy="true" className="relative">
              <Skeleton className="h-[65vh] rounded-lg" />
              <Spinner className="absolute inset-0 m-auto" aria-label={tr("Membuat ringkasan", "Building the summary")} />
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button slot="close" variant="secondary">
          {tr("Tutup", "Close")}
        </Button>
        {ready ? (
          <a href={ready} download={`ringkasan-event-${new Date().toLocaleDateString("sv-SE")}.pdf`} className={buttonVariants({ variant: "primary" })}>
            {tr("Unduh PDF", "Download PDF")}
          </a>
        ) : (
          <Button isDisabled>{tr("Unduh PDF", "Download PDF")}</Button>
        )}
      </Modal.Footer>
    </>
  )
}

export function SummaryReport({ isOpen, onOpenChange, filters }: { isOpen: boolean; onOpenChange: (isOpen: boolean) => void; filters: Filters }) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="cover">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{tr("Ringkasan PDF", "PDF summary")}</Modal.Heading>
            <p className="text-sm text-muted">{tr("Satu halaman A4. Periksa pratinjau sebelum mengunduh.", "One A4 page. Check the preview before downloading.")}</p>
          </Modal.Header>
          {isOpen && <SummaryBody filters={filters} />}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
