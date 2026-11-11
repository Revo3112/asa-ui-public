import { useState } from "react"
import { Button, Drawer, Label, Meter, SearchField, Skeleton, Tabs } from "@heroui/react"
import { Download, Plus } from "lucide-react"
import { useSearchParams } from "react-router"

import { FilterButton, useFilters, useSetParams } from "@/shared/components/filter-bar"
import { RegisterTable, type Column } from "@/shared/components/register-table"
import { ActionStatusChip } from "@/shared/components/status-chip"
import { TindakanDrawer } from "@/features/actions/components/tindakan-drawer"
import { REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { NewActionForm } from "@/shared/components/workflow-forms"
import { actionDone, actionStatusMeta } from "@/shared/config/indikasi"
import { actionOwners, createAction, getActions, isOverdue, userName, type Tindakan } from "@/features/cases/data/kasus"
import { sitesIn } from "@/shared/data/scope"
import { actionAging } from "@/features/actions/lib/action-aging"
import { downloadCsv } from "@/shared/lib/csv"
import { duration, useNow } from "@/shared/lib/time"
import { OwnerBadge } from "@/shared/components/visual"
import { cn } from "@/shared/lib/utils"
import { dueDate, runWorkflow, useWorkflowVersion } from "@/shared/lib/workflow-ui"
import { locale, tr } from "@/shared/lib/i18n"

const isOpenAction = (a: Tindakan) => !actionDone.includes(a.status)

/** Bucket names in the interface language; lib/rules.ts stays free of UI text. */
const agingLabel: Record<string, string> = {
  get belum() {
    return tr("Belum jatuh tempo", "Not yet due")
  },
  get "1-3"() {
    return tr("Lewat 0–3 hari", "0–3 days late")
  },
  get "3-7"() {
    return tr("Lewat 3–7 hari", "3–7 days late")
  },
  get "7+"() {
    return tr("Lewat > 7 hari", "> 7 days late")
  },
}

const tabs = [
  { id: "terbuka", get label() { return tr("Terbuka", "Open") }, match: (a: Tindakan) => isOpenAction(a) },
  { id: "overdue", label: "Overdue", match: (a: Tindakan, now: number) => isOverdue(a, now) },
  { id: "verifikasi", get label() { return tr("Menunggu verifikasi", "Pending verification") }, match: (a: Tindakan) => a.status === "pending-verification" },
  { id: "selesai", get label() { return tr("Selesai", "Done") }, match: (a: Tindakan) => !isOpenAction(a) },
  { id: "semua", get label() { return tr("Semua", "All") }, match: () => true },
] as const
type Tab = (typeof tabs)[number]["id"]

const shortDate = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const matches = (a: Tindakan, q: string) => !q || [a.id, a.judul, a.zona.label, userName(a.ownerId), a.caseId ?? "", a.eventId ?? "", a.sumber ?? ""].some((x) => x.toLowerCase().includes(q))

function exportCsv(rows: Tindakan[], now: number) {
  const at = new Date()
  downloadCsv(
    `tindakan-${at.toLocaleDateString("sv-SE")}.csv`,
    ["ID", tr("Tindakan", "Action"), "PIC", "Status", "Overdue", tr("Tenggat", "Due"), tr("Dibuat", "Created"), tr("Kasus", "Case"), tr("Indikasi", "Indication"), tr("Sumber", "Source"), tr("Zona", "Zone"), tr("Verifikator", "Verifier"), tr("Simulasi", "Simulated"), tr("Diekspor", "Exported")],
    rows.map((a) => [
      a.id,
      a.judul,
      userName(a.ownerId),
      actionStatusMeta[a.status].label,
      isOverdue(a, now) ? tr("ya", "yes") : tr("tidak", "no"),
      a.tenggat.toLocaleString("sv-SE"),
      a.dibuat.toLocaleString("sv-SE"),
      a.caseId ?? "",
      a.eventId ?? "",
      a.sumber ?? "",
      a.zona.label,
      a.verifierId ? userName(a.verifierId) : "",
      tr("ya", "yes"),
      at.toLocaleString("sv-SE"),
    ]),
  )
}

function TindakanContent() {
  const { filters, key } = useFilters()
  const [params] = useSearchParams()
  const setParams = useSetParams()
  const version = useWorkflowVersion()
  const now = useNow(60_000)
  const tab: Tab = tabs.find((t) => t.id === params.get("status"))?.id ?? "terbuka"
  const search = params.get("q") ?? ""
  const owner = params.get("pic")
  const bucket = params.get("aging")
  const query = useWidgetData(() => getActions(filters), key, REFRESH_MS, version)
  const [openId, setOpenId] = useState(params.get("id") ?? undefined)
  const [isOpen, setIsOpen] = useState(!!params.get("id"))
  const [isNewOpen, setIsNewOpen] = useState(false)

  const all = query.data
  const aging = all ? actionAging(all.map((a) => ({ id: a.id, status: a.status, tenggat: a.tenggat.getTime() })), now) : []
  const inBucket = bucket ? new Set(aging.find((b) => b.id === bucket)?.ids ?? []) : null
  const counts = Object.fromEntries(tabs.map((t) => [t.id, all?.filter((a) => t.match(a, now)).length ?? 0])) as Record<Tab, number>
  const rows = all?.filter(
    (a) => tabs.find((t) => t.id === tab)!.match(a, now) && matches(a, search.trim().toLowerCase()) && (!owner || a.ownerId === owner) && (!inBucket || inBucket.has(a.id)),
  )

  const workload = all
    ? [...new Set(all.filter(isOpenAction).map((a) => a.ownerId))]
        .map((id) => {
          const open = all.filter((a) => isOpenAction(a) && a.ownerId === id)
          return { id, nama: userName(id), open: open.length, overdue: open.filter((a) => isOverdue(a, now)).length }
        })
        .sort((a, b) => b.open - a.open)
    : undefined
  const site = sitesIn(filters)[0] ?? ""

  const columns: Column<Tindakan>[] = [
    { id: "id", label: "ID", render: (a) => <span className="whitespace-nowrap text-muted tabular-nums">{a.id}</span>, compare: (x, y) => x.id.localeCompare(y.id) },
    {
      id: "judul",
      label: tr("Tindakan", "Action"),
      isRowHeader: true,
      render: (a) => (
        <>
          <p>{a.judul}</p>
          <p className="text-sm text-muted">{[a.caseId, a.eventId ?? a.sumber, a.zona.label].filter(Boolean).join(" · ")}</p>
        </>
      ),
    },
    { id: "pic", label: "PIC", render: (a) => userName(a.ownerId), compare: (x, y) => userName(x.ownerId).localeCompare(userName(y.ownerId)) },
    { id: "status", label: "Status", render: (a) => <ActionStatusChip value={a.status} overdue={isOverdue(a, now)} /> },
    {
      id: "tenggat",
      label: tr("Tenggat", "Due"),
      render: (a) => (
        <span className="flex flex-col">
          <span className="whitespace-nowrap">{shortDate(a.tenggat)}</span>
          {isOpenAction(a) && (
            <span className={cn("text-xs", isOverdue(a, now) ? "text-danger" : "text-muted")}>
              {a.tenggat.getTime() < now ? tr(`lewat ${duration(now - a.tenggat.getTime())}`, `${duration(now - a.tenggat.getTime())} late`) : tr(`${duration(a.tenggat.getTime() - now)} lagi`, `in ${duration(a.tenggat.getTime() - now)}`)}
            </span>
          )}
        </span>
      ),
      compare: (x, y) => x.tenggat.getTime() - y.tenggat.getTime(),
    },
  ]

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title={tr("Tindakan terbuka menurut tenggat", "Open actions by due date")} description={tr("Overdue dihitung dari tenggat, bukan status. Pilih baris untuk memfilter register.", "Overdue is derived from the due date, not a status. Pick a row to filter the register.")}>
          <WidgetBody query={{ ...query, data: all && aging }} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(b) => b.every((x) => !x.ids.length)} empty={tr("Tidak ada tindakan terbuka.", "No open actions.")}>
            {(buckets) => {
              const max = Math.max(1, ...buckets.map((b) => b.ids.length))
              return (
                <ol className="flex flex-col gap-1">
                  {buckets.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        aria-pressed={bucket === b.id}
                        onClick={() => setParams({ aging: bucket === b.id ? null : b.id, status: null })}
                        className={cn("block w-full rounded-lg p-2 text-left hover:bg-default", bucket === b.id && "bg-default")}
                      >
                        <Meter value={b.ids.length} maxValue={max} valueLabel={String(b.ids.length)} size="sm" color={b.id === "belum" ? "accent" : b.id === "1-3" ? "warning" : "danger"}>
                          <Label>{agingLabel[b.id] ?? b.label}</Label>
                          <Meter.Output />
                          <Meter.Track>
                            <Meter.Fill />
                          </Meter.Track>
                        </Meter>
                      </button>
                    </li>
                  ))}
                </ol>
              )
            }}
          </WidgetBody>
        </Widget>
        <Widget title={tr("Beban kerja per PIC", "Workload per owner")} description={tr("Tindakan terbuka per orang; overdue ditulis di sampingnya. Pilih untuk memfilter.", "Open actions per person, overdue beside it. Pick one to filter.")}>
          <WidgetBody query={{ ...query, data: workload }} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(w) => !w.length} empty={tr("Tidak ada tindakan terbuka.", "No open actions.")}>
            {(list) => (
              <ol className="flex flex-col gap-1">
                {list.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      aria-pressed={owner === w.id}
                      onClick={() => setParams({ pic: owner === w.id ? null : w.id })}
                      className={cn("block w-full rounded-lg p-2 text-left hover:bg-default", owner === w.id && "bg-default")}
                    >
                      <Meter value={w.open} maxValue={list[0].open} valueLabel={`${w.open} ${tr("terbuka", "open")}${w.overdue ? ` · ${w.overdue} overdue` : ""}`} size="sm" color={w.overdue ? "danger" : "accent"}>
                        <Label className="flex items-center gap-2">
                          <OwnerBadge name={w.nama} className="text-sm text-foreground" />
                        </Label>
                        <Meter.Output />
                        <Meter.Track>
                          <Meter.Fill />
                        </Meter.Track>
                      </Meter>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </WidgetBody>
        </Widget>
      </div>

      <Widget
        title={tr("Register tindakan korektif", "Corrective action register")}
        description={tr("Setiap tindakan punya PIC, tenggat, dan siklusnya sendiri. Menunggu verifikasi belum dihitung selesai; verifikator harus orang lain selain PIC.", "Each action has an owner, a due date and its own lifecycle. Pending verification isn't done yet; the verifier must be someone other than the owner.")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onPress={() => setIsNewOpen(true)}>
              <Plus aria-hidden />
              {tr("Tindakan baru", "New action")}
            </Button>
            <Button size="sm" variant="secondary" isDisabled={!rows?.length} onPress={() => rows && exportCsv(rows, now)}>
              <Download aria-hidden />
              Export CSV
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Tabs className="max-w-full min-w-0" selectedKey={tab} onSelectionChange={(t) => setParams({ status: t === "terbuka" ? null : String(t) })}>
              <Tabs.ListContainer>
                <Tabs.List aria-label={tr("Status tindakan", "Action status")}>
                  {tabs.map((t) => (
                    <Tabs.Tab key={t.id} id={t.id} className="whitespace-nowrap">
                      {t.label} ({counts[t.id]})
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
            <SearchField className="w-full sm:w-72" value={search} onChange={(q) => setParams({ q: q || null })}>
              <Label className="sr-only">{tr("Cari tindakan", "Search actions")}</Label>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={tr("Cari ID, tindakan, PIC, kasus", "Search ID, action, owner, case")} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
          {(owner || bucket) && (
            <Button size="sm" variant="tertiary" className="self-start" onPress={() => setParams({ pic: null, aging: null })}>
              {tr("Hapus filter PIC/tenggat", "Clear owner/due filter")}
            </Button>
          )}
          <WidgetBody
            query={{ ...query, data: rows }}
            skeleton={
              <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            }
            isEmpty={() => (all?.length ?? 0) === 0}
            empty={tr("Belum ada tindakan untuk filter ini.", "No actions for these filters yet.")}
          >
            {(list) => (
              <RegisterTable
                label={tr("Register tindakan korektif", "Corrective action register")}
                rows={list}
                columns={columns}
                rowId={(a) => a.id}
                rowText={(a) => a.judul}
                defaultSort={{ column: "tenggat", direction: "ascending" }}
                dependencies={[now, version]}
                minWidth="min-w-[48rem]"
                onOpen={(id) => {
                  setOpenId(id)
                  setIsOpen(true)
                  setParams({ id })
                }}
              />
            )}
          </WidgetBody>
        </div>
      </Widget>

      <TindakanDrawer
        filters={filters}
        id={openId}
        isOpen={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open)
          if (!open) setParams({ id: null })
        }}
      />
      <Drawer.Backdrop isOpen={isNewOpen} onOpenChange={setIsNewOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>{tr("Tindakan baru", "New action")}</Drawer.Heading>
              <p className="text-sm text-muted">{tr("Untuk tindakan tanpa indikasi, mis. perawatan perangkat. Tindakan dari temuan dibuat di detail indikasi atau kasus.", "For actions without an indication, e.g. device maintenance. Actions from findings are created in the indication or case detail.")}</p>
            </Drawer.Header>
            <Drawer.Body>
              <NewActionForm
                owners={actionOwners(site).map((u) => ({ id: u.id, label: u.nama }))}
                onCancel={() => setIsNewOpen(false)}
                onSubmit={async (d) => {
                  const done = await runWorkflow(() => createAction({ judul: d.judul, ownerId: d.ownerId, tenggat: dueDate(d.due), catatanAwal: d.catatanAwal, site }), tr("Tindakan ditugaskan.", "Action assigned."))
                  if (done) setIsNewOpen(false)
                }}
              />
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  )
}

export function TindakanPage() {
  const { key } = useFilters()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["periode", "site", "zona", "shift"]} />
      </div>
      <TindakanContent key={key} />
    </div>
  )
}
