import { useState } from "react"
import {
  Alert,
  Avatar,
  buttonVariants,
  Card,
  Chip,
  Drawer,
  EmptyState,
  Label,
  ListBox,
  Pagination,
  Select,
  Skeleton,
  Table,
  Tabs,
  type SortDescriptor,
} from "@heroui/react"
import { BellRing, CalendarClock, Phone, ShieldCheck, Users } from "lucide-react"
import { useSearchParams } from "react-router"

import { FilterButton, useFilters, useSetParams } from "@/shared/components/filter-bar"
import { KpiCard, KpiGrid } from "@/shared/components/kpi-card"
import { REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { crewRoles, equipmentTypes, MIN_PERSONEL } from "@/features/ert/config/ert"
import { dueStatus, getEquipment, getPersonnel, type DueStatus, type Equipment, type Person } from "@/features/ert/data/ert"
import { activeShifts, shiftLabel, shiftOf, siteName, siteTimeZone } from "@/shared/data/master"
import { sitesIn } from "@/shared/data/scope"
import { useNow } from "@/shared/lib/time"
import { cn } from "@/shared/lib/utils"
import { locale, tr } from "@/shared/lib/i18n"

const PAGE_SIZE = 10
/** A calendar date as the site sees it. */
const date = (d: Date, site: string) => d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: siteTimeZone(site) })
const typeLabel = (id: string) => equipmentTypes.find((t) => t.id === id)?.label ?? id
const roleLabel = (id: string) => crewRoles.find((r) => r.id === id)?.label ?? id

const due = {
  lewat: { get label() { return tr("Lewat jadwal", "Overdue") }, color: "danger" },
  segera: { get label() { return tr("Segera", "Due soon") }, color: "warning" },
  ok: { label: "OK", color: "success" },
} as const

function dueText(status: DueStatus) {
  if (status.kind === "lewat") return tr(`Terlambat ${-status.days} hari`, `${-status.days} days late`)
  if (status.kind === "segera") return status.days === 0 ? tr("Jatuh tempo hari ini", "Due today") : tr(`Jatuh tempo ${status.days} hari lagi`, `Due in ${status.days} days`)
  return tr(`${status.days} hari lagi`, `in ${status.days} days`)
}

const dueChip = (status: DueStatus) => (
  <Chip size="sm" color={due[status.kind].color}>
    {due[status.kind].label}
  </Chip>
)

const offDuty = { get izin() { return tr("Izin", "On leave") }, get sakit() { return tr("Sakit", "Sick") } } as const
const telHref = (phone: string) => `tel:+62${phone.slice(1)}`
const telText = (phone: string) => phone.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3")

function PersonCard({ person, showSite }: { person: Person; showSite: boolean }) {
  const away = person.status !== "siaga"
  const initials = person.nama
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
  return (
    <Card className={cn("min-w-0", away && "opacity-70")}>
      <Card.Content className="flex-row items-center gap-3">
        <Avatar>
          <Avatar.Fallback>{initials}</Avatar.Fallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{person.nama}</p>
          <p className="text-sm text-muted">
            {roleLabel(person.peran)}
            {showSite && ` · ${siteName(person.site)}`}
            {away && ` · ${offDuty[person.status as keyof typeof offDuty]}`}
          </p>
          <p className="text-sm text-muted tabular-nums">{telText(person.telepon)}</p>
        </div>
        {!away && (
          <a
            href={telHref(person.telepon)}
            className={buttonVariants({ size: "sm", variant: "secondary", isIconOnly: true })}
            aria-label={`Telepon ${person.nama}, ${telText(person.telepon)}`}
          >
            <Phone aria-hidden />
          </a>
        )}
      </Card.Content>
    </Card>
  )
}

const roleOrder = (p: Person) => crewRoles.findIndex((r) => r.id === p.peran)
const compare: Record<string, (a: Equipment, b: Equipment) => number> = {
  jenis: (a, b) => typeLabel(a.jenis).localeCompare(typeLabel(b.jenis)),
  kode: (a, b) => a.kode.localeCompare(b.kode),
  terakhir: (a, b) => a.terakhir.getTime() - b.terakhir.getTime(),
  berikutnya: (a, b) => a.berikutnya.getTime() - b.berikutnya.getTime(),
}

function EquipmentTable({ rows, now }: { rows: Equipment[]; now: Date }) {
  // Earliest due date first, which puts the most overdue at the top.
  const [sort, setSort] = useState<SortDescriptor>({ column: "berikutnya", direction: "ascending" })
  const rowsKey = `${rows.length}|${rows[0]?.id}`
  const [paging, setPaging] = useState({ key: rowsKey, page: 1 })
  const [openId, setOpenId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const sorted = [...rows].sort((a, b) => (compare[String(sort.column)]?.(a, b) ?? 0) * (sort.direction === "descending" ? -1 : 1))
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(paging.key === rowsKey ? paging.page : 1, pages)
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const current = rows.find((e) => e.id === openId)
  const column = (id: string, label: string, isRowHeader = false) => (
    <Table.Column id={id} allowsSorting isRowHeader={isRowHeader}>
      {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>{label}</Table.SortableColumnHeader>}
    </Table.Column>
  )

  return (
    <>
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label={tr("Peralatan darurat", "Emergency equipment")}
            className="min-w-[48rem]"
            sortDescriptor={sort}
            onSortChange={setSort}
            onRowAction={(id) => {
              setOpenId(String(id))
              setIsOpen(true)
            }}
          >
            <Table.Header>
              {column("jenis", tr("Jenis", "Type"))}
              {column("kode", tr("Kode", "Code"), true)}
              <Table.Column>{tr("Lokasi", "Location")}</Table.Column>
              {column("terakhir", tr("Inspeksi terakhir", "Last inspection"))}
              {column("berikutnya", tr("Jadwal berikutnya", "Next due"))}
              <Table.Column>Status</Table.Column>
            </Table.Header>
            <Table.Body
              items={pageRows}
              dependencies={[now]}
              renderEmptyState={() => (
                <EmptyState>
                  <p>{tr("Tidak ada peralatan untuk pilihan ini.", "No equipment for this selection.")}</p>
                </EmptyState>
              )}
            >
              {(item) => {
                const status = dueStatus(item, now)
                return (
                  <Table.Row id={item.id} textValue={item.kode}>
                    <Table.Cell>{typeLabel(item.jenis)}</Table.Cell>
                    <Table.Cell className="tabular-nums">{item.kode}</Table.Cell>
                    <Table.Cell>
                      <p>{item.zona.label}</p>
                      <p className="text-sm text-muted">{item.lokasi}</p>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">{date(item.terakhir, item.site)}</Table.Cell>
                    <Table.Cell className="whitespace-nowrap">{date(item.berikutnya, item.site)}</Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap items-center gap-2">
                        {dueChip(status)}
                        {status.kind !== "ok" && <span className={cn("text-sm", status.kind === "lewat" ? "text-danger" : "text-warning-ink")}>{dueText(status)}</span>}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              }}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        {pages > 1 && (
          <Table.Footer>
            <Pagination size="sm">
              <Pagination.Summary>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} {tr("dari", "of")} {sorted.length}
              </Pagination.Summary>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous isDisabled={page === 1} onPress={() => setPaging({ key: rowsKey, page: page - 1 })}>
                    <Pagination.PreviousIcon />
                    {tr("Sebelumnya", "Previous")}
                  </Pagination.Previous>
                </Pagination.Item>
                <Pagination.Item>
                  <Pagination.Next isDisabled={page === pages} onPress={() => setPaging({ key: rowsKey, page: page + 1 })}>
                    {tr("Berikutnya", "Next")}
                    <Pagination.NextIcon />
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
          </Table.Footer>
        )}
      </Table>

      <Drawer.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            {current && (
              <>
                <Drawer.Header>
                  <Drawer.Heading>{current.kode}</Drawer.Heading>
                  <p className="text-sm text-muted">
                    {typeLabel(current.jenis)} · {current.zona.label}
                  </p>
                </Drawer.Header>
                <Drawer.Body className="flex flex-col gap-4">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted">Status</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {dueChip(dueStatus(current, now))}
                      <span>{dueText(dueStatus(current, now))}</span>
                    </dd>
                    <dt className="text-muted">{tr("Lokasi", "Location")}</dt>
                    <dd>
                      {current.zona.label}, {current.lokasi}
                    </dd>
                    <dt className="text-muted">{tr("Siklus inspeksi", "Inspection cycle")}</dt>
                    <dd>Tiap {equipmentTypes.find((t) => t.id === current.jenis)?.intervalHari} hari</dd>
                    <dt className="text-muted">{tr("Inspeksi terakhir", "Last inspection")}</dt>
                    <dd>{date(current.terakhir, current.site)}</dd>
                    <dt className="text-muted">{tr("Jadwal berikutnya", "Next due")}</dt>
                    <dd>{date(current.berikutnya, current.site)}</dd>
                  </dl>
                  <section aria-labelledby="riwayat-inspeksi" className="flex flex-col gap-2">
                    <h3 id="riwayat-inspeksi" className="text-sm font-medium">
                      {tr("Riwayat inspeksi", "Inspection history")}
                    </h3>
                    <ol className="flex flex-col gap-2 border-l border-border pl-4 text-sm">
                      {current.riwayat.map((r) => (
                        <li key={r.tanggal.getTime()}>
                          <p>
                            {date(r.tanggal, current.site)} · {r.oleh}
                          </p>
                          <p className="text-muted">{r.hasil}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                </Drawer.Body>
              </>
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  )
}

const statusFilter = [
  { id: "semua", label: tr("Semua status", "All statuses") },
  { id: "lewat", get label() { return tr("Lewat jadwal", "Overdue") } },
  { id: "segera", get label() { return tr("Segera", "Due soon") } },
  { id: "ok", label: "OK" },
]

function FilterField({ label, value, options, onChange }: { label: string; value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <Select aria-label={label} className="w-44" value={value} onChange={(v) => v && onChange(String(v))}>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function ErtPage() {
  const { filters } = useFilters()
  const [params] = useSearchParams()
  const setParams = useSetParams()
  const now = new Date(useNow(60_000))
  const sites = sitesIn(filters)
  // With several sites the first one's clock picks the running shift; shifts are the same everywhere.
  const running = shiftOf(now, sites[0] ?? "")
  // The page shows the present, so with no shift picked it follows the one running now.
  const shift = filters.shift === "all" ? running : filters.shift
  const jenis = equipmentTypes.some((t) => t.id === params.get("jenis")) ? params.get("jenis")! : "semua"
  const status = statusFilter.some((s) => s.id === params.get("status")) ? params.get("status")! : "semua"

  // Personnel belong to the site; equipment to the site and zone. Neither reloads on a shift change.
  const personnel = useWidgetData(() => getPersonnel(filters), `${filters.site}|${filters.demo}`, REFRESH_MS)
  const equipment = useWidgetData(() => getEquipment(filters), `${filters.site}|${filters.zona}|${filters.demo}`, REFRESH_MS)

  const crew = (personnel.data ?? []).filter((p) => p.shift === shift).sort((a, b) => roleOrder(a) - roleOrder(b) || Number(a.status !== "siaga") - Number(b.status !== "siaga"))
  const onDuty = crew.filter((p) => p.status === "siaga").length
  // The minimum holds per site, so with "Semua site" each site is checked on its own.
  const short = sites.map((site) => ({ site, siaga: crew.filter((p) => p.site === site && p.status === "siaga").length })).filter((s) => s.siaga < MIN_PERSONEL)
  const statuses = (equipment.data ?? []).map((e) => dueStatus(e, now).kind)
  const count = (kind: DueStatus["kind"]) => statuses.filter((s) => s === kind).length
  const rows = equipment.data?.filter((e) => (jenis === "semua" || e.jenis === jenis) && (status === "semua" || dueStatus(e, now).kind === status))
  const pending = (query: { data?: unknown; error?: Error }) => (query.error ? "–" : query.data ? null : "…")

  return (
    <div className="flex flex-col gap-4">
      <div role="toolbar" aria-label={tr("Pengaturan tampilan ERT", "ERT view settings")} className="flex flex-wrap items-end gap-3">
        <FilterButton fields={["site", "zona"]} />
        <div className="flex max-w-full min-w-0 flex-col gap-1">
          <Label id="shift-label">Shift</Label>
          <Tabs className="max-w-full min-w-0" selectedKey={shift} onSelectionChange={(id) => setParams({ shift: String(id) })}>
            <Tabs.ListContainer>
              <Tabs.List aria-labelledby="shift-label">
                {activeShifts().map((s) => (
                  <Tabs.Tab key={s.id} id={s.id} className="whitespace-nowrap">
                    {shiftLabel(s.id)}
                    {s.id === running && tr(" · berjalan", " · running")}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>
      </div>

      <KpiGrid>
        <KpiCard
          icon={Users}
          label={tr(`Personel siaga, shift ${activeShifts().find((s) => s.id === shift)?.nama.toLowerCase() ?? "ini"}`, `Personnel on standby, ${activeShifts().find((s) => s.id === shift)?.nama.toLowerCase() ?? "this"} shift`)}
          value={pending(personnel) ?? `${onDuty}/${crew.length}`}
          tone={personnel.data && short.length ? "warning" : "default"}
          progress={personnel.data ? { value: onDuty, max: Math.max(1, crew.length), target: Math.min(crew.length, MIN_PERSONEL * sites.length) } : undefined}
          note={sites.length > 1 ? tr(`Minimum ${MIN_PERSONEL} orang per site`, `Minimum ${MIN_PERSONEL} people per site`) : `Minimum ${MIN_PERSONEL} orang`}
        />
        <KpiCard icon={ShieldCheck} label={tr("Total peralatan", "Total equipment")} value={pending(equipment) ?? statuses.length} note={filters.zona === "all" ? tr("Semua zona", "All zones") : tr("Zona terpilih", "Selected zone")} />
        <KpiCard
          icon={CalendarClock}
          label={tr("Segera jatuh tempo", "Due soon")}
          value={pending(equipment) ?? count("segera")}
          tone={count("segera") ? "warning" : "default"}
          note={tr("Inspeksi dalam waktu dekat", "Inspection coming up")}
        />
        <KpiCard icon={BellRing} label={tr("Lewat jadwal", "Overdue")} value={pending(equipment) ?? count("lewat")} tone={count("lewat") ? "danger" : "default"} note={tr("Perlu diinspeksi", "Needs inspection")} />
      </KpiGrid>

      <Widget title={tr(`Personel ${shiftLabel(shift)}`, `Personnel, ${shiftLabel(shift)}`)} description={tr("Regu ERT berlaku untuk seluruh site. Filter zona hanya berlaku untuk peralatan.", "The ERT squad covers the whole site. The zone filter applies to equipment only.")}>
        <WidgetBody
          query={personnel}
          skeleton={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
          }
          isEmpty={() => crew.length === 0}
          empty={tr("Belum ada personel terdaftar untuk shift ini.", "No personnel registered for this shift yet.")}
        >
          {() => (
            <div className="flex flex-col gap-3">
              {short.length > 0 && (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>
                      {sites.length > 1 ? tr(`${short.length} site di bawah minimum ${MIN_PERSONEL} personel`, `${short.length} sites below the minimum of ${MIN_PERSONEL} personnel`) : tr(`Kurang ${MIN_PERSONEL - onDuty} personel dari minimum ${MIN_PERSONEL}`, `${MIN_PERSONEL - onDuty} personnel short of the minimum ${MIN_PERSONEL}`)}
                    </Alert.Title>
                    <Alert.Description>
                      {sites.length > 1
                        ? short.map((s) => `${siteName(s.site)}: ${s.siaga} siaga`).join(", ")
                        : tr(`${onDuty} dari ${crew.length} anggota regu siaga di shift ini.`, `${onDuty} of ${crew.length} squad members on standby this shift.`)}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {crew.map((person) => (
                  <li key={person.id} className="min-w-0">
                    <PersonCard person={person} showSite={sites.length > 1} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </WidgetBody>
      </Widget>

      <Widget
        title={tr("Peralatan darurat", "Emergency equipment")}
        description={tr("Yang paling terlambat di atas. Pilih baris untuk riwayat inspeksi.", "Most overdue first. Pick a row for its inspection history.")}
        action={
          <div className="flex flex-wrap gap-2">
            <FilterField
              label={tr("Saring jenis", "Filter type")}
              value={jenis}
              options={[{ id: "semua", label: tr("Semua jenis", "All types") }, ...equipmentTypes]}
              onChange={(id) => setParams({ jenis: id === "semua" ? null : id })}
            />
            <FilterField label={tr("Saring status", "Filter status")} value={status} options={statusFilter} onChange={(id) => setParams({ status: id === "semua" ? null : id })} />
          </div>
        }
      >
        <WidgetBody
          query={{ ...equipment, data: rows }}
          skeleton={
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          }
          isEmpty={() => (equipment.data?.length ?? 0) === 0}
          empty={tr("Belum ada peralatan terdaftar di zona ini.", "No equipment registered in this zone yet.")}
        >
          {(list) => <EquipmentTable rows={list} now={now} />}
        </WidgetBody>
      </Widget>
    </div>
  )
}
