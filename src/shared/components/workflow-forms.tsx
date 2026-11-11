/**
 * The forms of the review workflow, shared by the indication, case and action drawers. Each one
 * checks what the API will check (rationale length, required fields) so the user sees the reason
 * before pressing Simpan; the API still has the last word.
 */

import { useState } from "react"
import { Button, Description, FieldError, Input, Label, ListBox, Radio, RadioGroup, Select, TextArea, TextField } from "@heroui/react"

import { severityMeta, type Severity } from "@/shared/config/events"
import { outcomeMeta, type Outcome } from "@/shared/config/indikasi"
import { rules } from "@/shared/config/rules"
import type { Option } from "@/shared/data/filters"
import { dueOptions } from "@/shared/lib/workflow-ui"
import { tr } from "@/shared/lib/i18n"

const min = rules.rationaleMinLength
const tooShort = (text: string) => text.trim().length > 0 && text.trim().length < min

/** Reason or note field with the shared minimum length. */
function ReasonField({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <TextField value={value} onChange={onChange} isInvalid={tooShort(value)} isRequired>
      <Label>{label}</Label>
      <TextArea rows={3} placeholder={placeholder} />
      {tooShort(value) ? <FieldError>{tr(`Minimal ${min} karakter.`, `At least ${min} characters.`)}</FieldError> : <Description>{hint ?? tr(`Wajib, minimal ${min} karakter. Tersimpan di jejak audit.`, `Required, at least ${min} characters. Saved in the audit trail.`)}</Description>}
    </TextField>
  )
}

export function OptionSelect({ label, value, options, onChange, isRequired }: { label: string; value: string; options: Option[]; onChange: (v: string) => void; isRequired?: boolean }) {
  return (
    <Select value={value || null} onChange={(v) => v && onChange(String(v))} isRequired={isRequired} placeholder={tr("Pilih", "Pick")}>
      <Label>{label}</Label>
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

function useSubmit() {
  const [pending, setPending] = useState(false)
  const run = async (call: () => Promise<unknown>) => {
    setPending(true)
    try {
      await call()
    } finally {
      setPending(false)
    }
  }
  return { pending, run }
}

// ---- Review ----

/** Outcome and rationale. The outcome is stored as a finding, apart from the indication's progress. */
export function ReviewForm({ isRevision, onSubmit }: { isRevision: boolean; onSubmit: (outcome: Outcome, rationale: string) => Promise<unknown> }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [rationale, setRationale] = useState("")
  const { pending, run } = useSubmit()
  const ready = outcome && rationale.trim().length >= min
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-3"
      onSubmit={(ev) => {
        ev.preventDefault()
        if (ready) run(() => onSubmit(outcome, rationale.trim()).then(() => setRationale("")))
      }}
    >
      <h3 className="text-sm font-medium">{isRevision ? tr("Revisi hasil review", "Revise review outcome") : tr("Hasil review", "Review outcome")}</h3>
      {isRevision && <p className="text-sm text-muted">{tr("Temuan lama tidak diubah. Revisi disimpan sebagai temuan baru yang menggantikannya.", "The old finding is not edited. The revision is saved as a new finding that replaces it.")}</p>}
      <RadioGroup value={outcome} onChange={(v) => setOutcome(v as Outcome)} isRequired>
        <Label>{tr("Hasil", "Outcome")}</Label>
        {(Object.keys(outcomeMeta) as Outcome[]).map((o) => (
          <Radio key={o} value={o}>
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              {outcomeMeta[o].label}
            </Radio.Content>
          </Radio>
        ))}
      </RadioGroup>
      <ReasonField label={tr("Alasan", "Reason")} value={rationale} onChange={setRationale} placeholder={tr("Apa yang terlihat dan kenapa hasilnya begitu", "What you saw and why the outcome is what it is")} />
      <Button type="submit" isPending={pending} isDisabled={!ready} className="self-start">
        {tr("Simpan review", "Save review")}
      </Button>
    </form>
  )
}

// ---- Case ----

export type CaseDraft = { judul: string; jenis: string; prioritas: Severity; ownerId: string; ringkasan: string }

export function NewCaseForm({ initial, owners, onSubmit, onCancel }: { initial: CaseDraft; owners: Option[]; onSubmit: (d: CaseDraft) => Promise<unknown>; onCancel: () => void }) {
  const [d, setD] = useState(initial)
  const { pending, run } = useSubmit()
  const set = (patch: Partial<CaseDraft>) => setD((x) => ({ ...x, ...patch }))
  const ready = d.judul.trim() && d.ownerId
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-3"
      onSubmit={(ev) => {
        ev.preventDefault()
        if (ready) run(() => onSubmit(d))
      }}
    >
      <h3 className="text-sm font-medium">{tr("Buka kasus", "Open case")}</h3>
      <p className="text-sm text-muted">{tr("Kasus dibuka oleh orang, tidak otomatis. Temuan terkonfirmasi ini ikut ditautkan.", "A person opens a case, never automatically. This confirmed finding is linked to it.")}</p>
      <TextField value={d.judul} onChange={(judul) => set({ judul })} isRequired>
        <Label>{tr("Judul", "Title")}</Label>
        <Input />
      </TextField>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionSelect label={tr("Prioritas", "Priority")} value={d.prioritas} onChange={(v) => set({ prioritas: v as Severity })} options={(Object.keys(severityMeta) as Severity[]).map((s) => ({ id: s, label: severityMeta[s].label }))} isRequired />
        <OptionSelect label={tr("Pemilik kasus", "Case owner")} value={d.ownerId} onChange={(ownerId) => set({ ownerId })} options={owners} isRequired />
      </div>
      <TextField value={d.ringkasan} onChange={(ringkasan) => set({ ringkasan })}>
        <Label>{tr("Ringkasan", "Summary")}</Label>
        <TextArea rows={3} />
      </TextField>
      <div className="flex gap-2">
        <Button type="submit" isPending={pending} isDisabled={!ready}>
          {tr("Buka kasus", "Open case")}
        </Button>
        <Button variant="tertiary" onPress={onCancel}>
          {tr("Batal", "Cancel")}
        </Button>
      </div>
    </form>
  )
}

// ---- Corrective action ----

export type ActionDraft = { judul: string; ownerId: string; due: string; catatanAwal: string }

export function NewActionForm({ initial, owners, onSubmit, onCancel }: { initial?: Partial<ActionDraft>; owners: Option[]; onSubmit: (d: ActionDraft) => Promise<unknown>; onCancel: () => void }) {
  const [d, setD] = useState<ActionDraft>({ judul: "", ownerId: "", due: "3", catatanAwal: "", ...initial })
  const { pending, run } = useSubmit()
  const set = (patch: Partial<ActionDraft>) => setD((x) => ({ ...x, ...patch }))
  const ready = d.judul.trim() && d.ownerId
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-3"
      onSubmit={(ev) => {
        ev.preventDefault()
        if (ready) run(() => onSubmit(d))
      }}
    >
      <h3 className="text-sm font-medium">{tr("Buat tindakan korektif", "Create corrective action")}</h3>
      <TextField value={d.judul} onChange={(judul) => set({ judul })} isRequired>
        <Label>{tr("Tindakan", "Action")}</Label>
        <Input placeholder={tr("Mis. pasang barikade jarak aman", "E.g. put up a safe-distance barrier")} />
      </TextField>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionSelect label={tr("Penanggung jawab (PIC)", "Owner (PIC)")} value={d.ownerId} onChange={(ownerId) => set({ ownerId })} options={owners} isRequired />
        <OptionSelect label={tr("Tenggat", "Due")} value={d.due} onChange={(due) => set({ due })} options={dueOptions} isRequired />
      </div>
      <TextField value={d.catatanAwal} onChange={(catatanAwal) => set({ catatanAwal })}>
        <Label>{tr("Catatan awal", "Initial note")}</Label>
        <TextArea rows={2} />
      </TextField>
      <div className="flex gap-2">
        <Button type="submit" isPending={pending} isDisabled={!ready}>
          {tr("Tugaskan", "Assign")}
        </Button>
        <Button variant="tertiary" onPress={onCancel}>
          {tr("Batal", "Cancel")}
        </Button>
      </div>
    </form>
  )
}

// ---- Reason (close case, submit, verify, cancel) ----

export function ReasonForm({
  title,
  label,
  action,
  danger,
  hint,
  extra,
  onSubmit,
  onCancel,
}: {
  title: string
  label: string
  action: string
  danger?: boolean
  hint?: string
  /** An optional evidence reference field, for submitting an action. */
  extra?: { label: string }
  onSubmit: (text: string, extra?: string) => Promise<unknown>
  onCancel: () => void
}) {
  const [text, setText] = useState("")
  const [ref, setRef] = useState("")
  const { pending, run } = useSubmit()
  const ready = text.trim().length >= min
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-3"
      onSubmit={(ev) => {
        ev.preventDefault()
        if (ready) run(() => onSubmit(text.trim(), ref.trim() || undefined))
      }}
    >
      <h3 className="text-sm font-medium">{title}</h3>
      <ReasonField label={label} value={text} onChange={setText} hint={hint} />
      {extra && (
        <TextField value={ref} onChange={setRef}>
          <Label>{extra.label}</Label>
          <Input placeholder={tr("Mis. nomor foto atau dokumen", "E.g. photo or document number")} />
        </TextField>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant={danger ? "danger" : "primary"} isPending={pending} isDisabled={!ready}>
          {action}
        </Button>
        <Button variant="tertiary" onPress={onCancel}>
          {tr("Batal", "Cancel")}
        </Button>
      </div>
    </form>
  )
}
