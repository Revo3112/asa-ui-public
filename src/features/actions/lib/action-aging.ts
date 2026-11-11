import { actionDone, type ActionStatus } from "@/shared/config/indikasi"

type ActionDue = { id: string; status: ActionStatus; tenggat: number }

/** Open actions by how far past (or before) their due date they are. */
export function actionAging(actions: ActionDue[], now: number) {
  const open = actions.filter((action) => !actionDone.includes(action.status))
  const days = (action: ActionDue) => (now - action.tenggat) / 86_400_000
  return [
    { id: "belum", label: "Belum jatuh tempo", ids: open.filter((action) => days(action) < 0).map((action) => action.id) },
    { id: "1-3", label: "Lewat 0–3 hari", ids: open.filter((action) => days(action) >= 0 && days(action) < 3).map((action) => action.id) },
    { id: "3-7", label: "Lewat 3–7 hari", ids: open.filter((action) => days(action) >= 3 && days(action) < 7).map((action) => action.id) },
    { id: "7+", label: "Lewat > 7 hari", ids: open.filter((action) => days(action) >= 7).map((action) => action.id) },
  ]
}
