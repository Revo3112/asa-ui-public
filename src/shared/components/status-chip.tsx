import { Chip } from "@heroui/react"

import { actionStatusMeta, caseStatusMeta, detectorStatusLabel, outcomeMeta, sourceStatusMeta, workflowMeta, type ActionStatus, type CaseStatus, type DetectorStatus, type Outcome, type SourceStatus, type Workflow } from "@/shared/config/indikasi"

type Meta = { label: string; color: "danger" | "warning" | "accent" | "success" | "default" }

function MetaChip({ meta, className }: { meta: Meta; className?: string }) {
  return (
    <Chip size="sm" color={meta.color} className={className}>
      {meta.label}
    </Chip>
  )
}

/** Review progress of an indication. Never the same chip as the review outcome. */
export const WorkflowChip = ({ value }: { value: Workflow }) => <MetaChip meta={workflowMeta[value]} />
export const OutcomeChip = ({ value }: { value: Outcome }) => <MetaChip meta={outcomeMeta[value]} />
export const CaseStatusChip = ({ value }: { value: CaseStatus }) => <MetaChip meta={caseStatusMeta[value]} />
export const SourceStatusChip = ({ value }: { value: SourceStatus }) => <MetaChip meta={sourceStatusMeta[value]} />

/** Action status, with Overdue shown beside it: overdue is derived from the due date, not a status of its own. */
export function ActionStatusChip({ value, overdue }: { value: ActionStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <MetaChip meta={actionStatusMeta[value]} />
      {overdue && <MetaChip meta={{ label: "Overdue", color: "danger" }} />}
    </span>
  )
}

export const DetectorStatusChip = ({ value }: { value: DetectorStatus }) => <MetaChip meta={{ label: detectorStatusLabel[value], color: value === "native" ? "success" : "warning" }} />
