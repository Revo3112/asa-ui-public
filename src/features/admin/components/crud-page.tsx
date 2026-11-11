import { useState, type ReactNode } from "react"
import { parseTime } from "@internationalized/date"
import {
  Alert,
  Button,
  buttonVariants,
  Chip,
  Description,
  Drawer,
  EmptyState,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  SearchField,
  Select,
  Table,
  TextArea,
  TextField,
  TimeField,
  toast,
  type Key,
} from "@heroui/react"
import { Plus } from "lucide-react"
import { Link } from "react-router"

import { Widget } from "@/shared/components/widget"
import { deactivateBlocker, saveRecord, useMaster, type Master, type MasterKind, type Pengguna } from "@/shared/data/master"
import type { Option } from "@/shared/data/filters"
import { useRole, useSession, type Role } from "@/shared/auth/session"
import { tr } from "@/shared/lib/i18n"

type Row = { id: string; aktif: boolean }

export type Field<T> = {
  key: keyof T & string
  label: string
  kind: "text" | "email" | "url" | "textarea" | "select" | "multiselect" | "time"
  options?: (draft: T) => Option[]
  placeholder?: string
  description?: (draft: T) => string | undefined
  isRequired?: boolean
  /** Locked once the record exists, e.g. a camera code that events point to. */
  fixedAfterCreate?: boolean
  isDisabled?: (draft: T) => boolean
  /** Fixes the fields that depend on this one, e.g. clears the zone when the site changes. */
  after?: (draft: T) => T
}

export type Column<T> = { label: string; render: (row: T) => ReactNode; isRowHeader?: boolean }

export type CrudConfig<T extends Row> = {
  kind: MasterKind
  /** Lowercase, for "Tambah zona", "Zona disimpan". */
  noun: string
  description: string
  /** The records this user may see. */
  rows: (m: Master, user: Pengguna | undefined) => T[]
  columns: Column<T>[]
  fields: Field<T>[]
  blank: () => T
  /** The name in messages, e.g. `Gudang`. */
  title: (row: T) => string
  search: (row: T) => string
  canEdit: (role: Role) => boolean
  /** Field errors beyond "wajib diisi", e.g. a code that is already taken. */
  validate?: (draft: T, isNew: boolean) => Partial<Record<keyof T, string>>
  /** A rule that stops the save as a whole, e.g. removing a zone that cameras still use. */
  saveBlocker?: (draft: T, isNew: boolean, user: Pengguna | undefined) => string | undefined
  /** When the form can't be filled yet because a parent record is missing. */
  missingParent?: () => { message: string; to: string; action: string } | null
  /** More controls under the fields, e.g. the stream test. `set` edits the draft from them. */
  extra?: (draft: T, set: (draft: T) => void, readOnly: boolean) => ReactNode
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1)

function FieldInput<T extends Row>({
  field,
  draft,
  isNew,
  readOnly,
  onChange,
}: {
  field: Field<T>
  draft: T
  isNew: boolean
  readOnly: boolean
  onChange: (draft: T) => void
}) {
  const value = draft[field.key] as unknown
  const set = (v: unknown) => {
    const next = { ...draft, [field.key]: v }
    onChange(field.after ? field.after(next) : next)
  }
  const isDisabled = field.isDisabled?.(draft) ?? false
  const isReadOnly = readOnly || (!!field.fixedAfterCreate && !isNew)
  const description = field.description?.(draft)
  const common = { name: field.key, isRequired: field.isRequired, isDisabled }

  if (field.kind === "select" || field.kind === "multiselect") {
    const options = field.options?.(draft) ?? []
    const multiple = field.kind === "multiselect"
    return (
      <Select
        {...common}
        isDisabled={isDisabled || isReadOnly}
        placeholder={field.placeholder ?? tr("Pilih", "Pick")}
        selectionMode={multiple ? "multiple" : "single"}
        value={multiple ? (value as string[]) : (value as string) || null}
        onChange={(v) => set(multiple ? (v as Key[]).map(String) : String(v ?? ""))}
      >
        <Label>{field.label}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        {description && <Description>{description}</Description>}
        <FieldError />
        <Select.Popover>
          <ListBox selectionMode={multiple ? "multiple" : "single"}>
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

  if (field.kind === "time") {
    return (
      <TimeField
        {...common}
        isReadOnly={isReadOnly}
        hourCycle={24}
        value={value ? parseTime(value as string) : null}
        onChange={(t) => set(t ? t.toString().slice(0, 5) : "")}
      >
        <Label>{field.label}</Label>
        <TimeField.Group>
          <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
        </TimeField.Group>
        {description && <Description>{description}</Description>}
        <FieldError />
      </TimeField>
    )
  }

  return (
    <TextField {...common} isReadOnly={isReadOnly} type={field.kind === "textarea" ? undefined : field.kind} value={value as string} onChange={set}>
      <Label>{field.label}</Label>
      {field.kind === "textarea" ? <TextArea rows={3} placeholder={field.placeholder} /> : <Input placeholder={field.placeholder} />}
      {description && <Description>{description}</Description>}
      <FieldError />
    </TextField>
  )
}

/**
 * One master data page: a searchable table, and a drawer to add, edit, deactivate or
 * reactivate a record. Each entity only passes its columns, fields and rules.
 */
export function CrudPage<T extends Row>({ config }: { config: CrudConfig<T> }) {
  const m = useMaster()
  const { user } = useSession()
  const canEdit = config.canEdit(useRole())
  const [search, setSearch] = useState("")
  const [draft, setDraft] = useState<T | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [blocker, setBlocker] = useState<string | null>(null)
  const [pending, setPending] = useState<"save" | "status" | null>(null)

  const all = config.rows(m, user)
  const q = search.trim().toLowerCase()
  const rows = q ? all.filter((r) => config.search(r).toLowerCase().includes(q)) : all
  const missing = isNew ? config.missingParent?.() : null

  const open = (row: T, fresh: boolean) => {
    setDraft(row)
    setIsNew(fresh)
    setErrors({})
    setBlocker(null)
    setIsOpen(true)
  }

  const save = async () => {
    if (!draft) return
    setBlocker(null)
    const found: Record<string, string> = {}
    for (const f of config.fields) {
      const v = draft[f.key] as unknown
      const empty = Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim()
      if (f.isRequired && !f.isDisabled?.(draft) && empty) found[f.key] = tr(`${f.label} wajib diisi.`, `${f.label} is required.`)
    }
    Object.assign(found, Object.fromEntries(Object.entries(config.validate?.(draft, isNew) ?? {}).filter(([k, v]) => v && !found[k])))
    setErrors(found)
    if (Object.keys(found).length) return
    const stop = config.saveBlocker?.(draft, isNew, user)
    setBlocker(stop ?? null)
    if (stop) return
    setPending("save")
    await saveRecord(config.kind, draft as never)
    setPending(null)
    setIsOpen(false)
    toast.success(`${capital(config.noun)} ${config.title(draft)} ${isNew ? tr("ditambahkan", "added") : tr("disimpan", "saved")}.`)
  }

  const toggle = async () => {
    if (!draft) return
    const stop = draft.aktif ? deactivateBlocker(config.kind, draft.id, user) : undefined
    setBlocker(stop ?? null)
    if (stop) return
    setPending("status")
    const next = { ...draft, aktif: !draft.aktif }
    await saveRecord(config.kind, next as never)
    setPending(null)
    setDraft(next)
    toast.success(`${capital(config.noun)} ${config.title(draft)} ${next.aktif ? tr("diaktifkan lagi", "reactivated") : tr("dinonaktifkan", "deactivated")}.`)
  }

  const heading = isNew ? tr(`Tambah ${config.noun}`, `Add ${config.noun}`) : canEdit ? tr(`Ubah ${config.noun}`, `Edit ${config.noun}`) : tr(`Detail ${config.noun}`, `${capital(config.noun)} detail`)
  const formId = `form-${config.kind}`

  return (
    <>
      <Widget
        title={tr(`Daftar ${config.noun}`, `${capital(config.noun)} list`)}
        description={config.description}
        action={
          canEdit && (
            <Button onPress={() => open(config.blank(), true)}>
              <Plus aria-hidden />
              {tr(`Tambah ${config.noun}`, `Add ${config.noun}`)}
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-3">
          <SearchField className="w-full sm:w-72" value={search} onChange={setSearch}>
            <Label className="sr-only">{tr(`Cari ${config.noun}`, `Search ${config.noun}`)}</Label>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={tr(`Cari ${config.noun}`, `Search ${config.noun}`)} />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label={tr(`Daftar ${config.noun}`, `${capital(config.noun)} list`)}
                className="min-w-[40rem]"
                onRowAction={(id) => {
                  const row = all.find((r) => r.id === id)
                  if (row) open(row, false)
                }}
              >
                <Table.Header>
                  {config.columns.map((c) => (
                    <Table.Column key={c.label} isRowHeader={c.isRowHeader}>
                      {c.label}
                    </Table.Column>
                  ))}
                  <Table.Column>Status</Table.Column>
                </Table.Header>
                <Table.Body
                  items={rows}
                  dependencies={[m]}
                  renderEmptyState={() => (
                    <EmptyState>
                      <p>{q ? tr(`Tidak ada ${config.noun} yang cocok dengan "${search.trim()}".`, `No ${config.noun} matches "${search.trim()}".`) : tr(`Belum ada ${config.noun}.`, `No ${config.noun} yet.`)}</p>
                    </EmptyState>
                  )}
                >
                  {(row) => (
                    <Table.Row id={row.id} textValue={config.title(row)}>
                      {config.columns.map((c) => (
                        <Table.Cell key={c.label}>{c.render(row)}</Table.Cell>
                      ))}
                      <Table.Cell>
                        <Chip size="sm" color={row.aktif ? "success" : "default"}>
                          {row.aktif ? tr("Aktif", "Active") : tr("Nonaktif", "Inactive")}
                        </Chip>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      </Widget>

      <Drawer.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="sm:w-lg">
            <Drawer.CloseTrigger />
            {draft && (
              <>
                <Drawer.Header>
                  <Drawer.Heading>{heading}</Drawer.Heading>
                  {!isNew && <p className="text-sm text-muted">{config.title(draft)}</p>}
                </Drawer.Header>
                <Drawer.Body>
                  {missing ? (
                    <EmptyState>
                      <p>{missing.message}</p>
                      <Link to={missing.to} className={buttonVariants({ variant: "primary", className: "mt-3" })}>
                        {missing.action}
                      </Link>
                    </EmptyState>
                  ) : (
                    <Form
                      id={formId}
                      validationBehavior="aria"
                      validationErrors={errors}
                      className="flex flex-col gap-4"
                      onSubmit={(e) => {
                        e.preventDefault()
                        save()
                      }}
                    >
                      {!draft.aktif && (
                        <Alert status="warning">
                          <Alert.Indicator />
                          <Alert.Content>
                            <Alert.Title>{tr("Nonaktif", "Inactive")}</Alert.Title>
                            <Alert.Description>{tr("Tidak muncul di pilihan dan pemantauan, tetapi tetap ada di data lama.", "Hidden from pickers and monitoring, but kept in old records.")}</Alert.Description>
                          </Alert.Content>
                        </Alert>
                      )}
                      {blocker && (
                        <Alert status="danger">
                          <Alert.Indicator />
                          <Alert.Content>
                            <Alert.Title>{tr("Belum bisa disimpan", "Could not save yet")}</Alert.Title>
                            <Alert.Description>{blocker}</Alert.Description>
                          </Alert.Content>
                        </Alert>
                      )}
                      {config.fields.map((f) => (
                        <FieldInput key={f.key} field={f} draft={draft} isNew={isNew} readOnly={!canEdit} onChange={setDraft} />
                      ))}
                      {config.extra?.(draft, setDraft, !canEdit)}
                    </Form>
                  )}
                </Drawer.Body>
                {canEdit && !missing && (
                  <Drawer.Footer className="flex-wrap">
                    {!isNew && (
                      <Button variant={draft.aktif ? "danger-soft" : "secondary"} isPending={pending === "status"} onPress={toggle} className="sm:mr-auto">
                        {draft.aktif ? tr("Nonaktifkan", "Deactivate") : tr("Aktifkan lagi", "Reactivate")}
                      </Button>
                    )}
                    <Button slot="close" variant="tertiary">
                      {tr("Batal", "Cancel")}
                    </Button>
                    <Button type="submit" form={formId} isPending={pending === "save"}>
                      {tr("Simpan", "Save")}
                    </Button>
                  </Drawer.Footer>
                )}
              </>
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  )
}
