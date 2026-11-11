import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Button, Chip, Drawer, Label, ScrollShadow, TextArea, TextField, toast } from "@heroui/react"
import { Bot, Copy, History, MessageSquarePlus, RotateCcw, Sparkles, Square, ThumbsDown, ThumbsUp, Trash2, ArrowUp } from "lucide-react"
import { Link } from "react-router"

import { EvidencePanel, EvidenceStrip } from "@/features/assistant/components/evidence-panel"
import { FilterSelect, useFilters } from "@/shared/components/filter-bar"
import { Segments } from "@/features/analysis/components/segments"
import { detectLang, getReply, starters, type Block, type Reply } from "@/features/assistant/data/asisten"
import type { Lang, Seg } from "@/features/analysis/data/analisis"
import { useSession } from "@/shared/auth/session"
import { getLang, tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"

type Message = { id: string; role: "user" | "assistant"; text?: string; reply?: Reply; stopped?: boolean; feedback?: "up" | "down"; lang?: Lang }
type Conversation = { id: string; title: string; at: string; messages: Message[] }

// ---- Per-viewer history (a convenience: lost in a private window, never shared) ----

const storeKey = (userId: string) => `hse-asisten:${userId}`
function loadHistory(userId: string): Conversation[] {
  try {
    return JSON.parse(localStorage.getItem(storeKey(userId)) ?? "[]") as Conversation[]
  } catch {
    return []
  }
}
function saveHistory(userId: string, list: Conversation[]) {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(list.slice(0, 30)))
  } catch {
    // Storage blocked or full: the conversation lives until reload.
  }
}

const newId = () => Math.random().toString(36).slice(2, 10)
const nowIso = () => new Date().toISOString()

// ---- Streaming ----

/** The reply as words, so it can be revealed a few at a time like a model's output. */
const tokenCount = (blocks: Block[]) =>
  blocks.reduce((n, b) => n + (b.kind === "h" ? 1 : b.kind === "p" ? segTokens(b.segs) : b.items.reduce((m, i) => m + segTokens(i), 0)), 0)
const segTokens = (segs: Seg[]) => segs.reduce((n, s) => n + (typeof s === "string" ? Math.max(1, s.split(/(?<=\s)/).length) : 1), 0)

/** The first `n` words of the reply. */
function firstTokens(blocks: Block[], n: number): Block[] {
  let left = n
  const cut = (segs: Seg[]) => {
    const out: Seg[] = []
    for (const s of segs) {
      if (left <= 0) break
      if (typeof s !== "string") {
        out.push(s)
        left--
        continue
      }
      const words = s.split(/(?<=\s)/)
      out.push(words.slice(0, left).join(""))
      left -= Math.min(words.length, left)
    }
    return out
  }
  const out: Block[] = []
  for (const b of blocks) {
    if (left <= 0) break
    if (b.kind === "h") {
      out.push(b)
      left--
    } else if (b.kind === "p") out.push({ kind: "p", segs: cut(b.segs) })
    else {
      const items: (typeof b.items)[number][] = []
      for (const item of b.items) {
        if (left <= 0) break
        items.push(cut(item))
      }
      out.push({ kind: "list", items })
    }
  }
  return out
}

/** The viewer sits beside the chat from this width; below it, it slides in as a drawer. */
const wideQuery = "(min-width: 80rem)"
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(wideQuery)
  m.addEventListener("change", cb)
  return () => m.removeEventListener("change", cb)
}
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches)

function ReplyBlocks({ blocks, onRef }: { blocks: Block[]; onRef?: (id: string) => boolean }) {
  return (
    <div className="flex flex-col gap-2.5 leading-relaxed">
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <h3 key={i} className="pt-1 font-semibold">
            {b.text}
          </h3>
        ) : b.kind === "p" ? (
          <p key={i}>
            <Segments segs={b.segs} onRef={onRef} />
          </p>
        ) : b.ordered ? (
          <ol key={i} className="flex list-decimal flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <Segments segs={item} onRef={onRef} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <Segments segs={item} onRef={onRef} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}

const plainText = (blocks: Block[]) =>
  blocks
    .map((b) => {
      const text = (segs: Seg[]) => segs.map((s) => (typeof s === "string" ? s : s.id)).join("")
      return b.kind === "h" ? `## ${b.text}` : b.kind === "p" ? text(b.segs) : b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : "-"} ${text(i)}`).join("\n")
    })
    .join("\n\n")

// ---- Page ----

/**
 * AI Assistant: a full chat page over the dashboard's computed data. ponytail: answers come from
 * data/asisten.ts (intents + facts, no model) and are revealed word by word; swapping in a real model
 * only changes `getReply`. The scope (site, period) is the page's filter, shown above the composer.
 */
export function AsistenPage() {
  const { filters } = useFilters()
  const { user } = useSession()
  const userId = user?.id ?? "anon"
  const [history, setHistory] = useState<Conversation[]>(() => loadHistory(userId))
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [thinking, setThinking] = useState(false)
  // The message being streamed and how many words of it are shown.
  const [stream, setStream] = useState<{ id: string; shown: number; total: number } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  // The evidence viewer: the indication shown and the evidence list of its reply, for previous/next.
  const [viewer, setViewer] = useState<{ id: string; ids: string[] } | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const wide = useWide()
  const openEvidence = (id: string, ids: string[]) => {
    setViewer({ id, ids: ids.includes(id) ? ids : [id] })
    setViewerOpen(true)
  }
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  const listRef = useRef<HTMLDivElement>(null)

  const current = history.find((c) => c.id === currentId)
  const messages = current?.messages ?? []
  const busy = thinking || !!stream
  const lang: Lang = messages.findLast((m) => m.role === "user")?.lang ?? "id"
  const firstName = user?.nama.split(" ")[0] ?? ""

  useEffect(() => saveHistory(userId, history), [userId, history])
  useEffect(() => () => clearInterval(timer.current), [])
  const shown = stream?.shown
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: shown === undefined ? "smooth" : "auto" })
  }, [messages.length, shown, thinking])

  const update = (id: string, fn: (c: Conversation) => Conversation) => setHistory((list) => list.map((c) => (c.id === id ? fn(c) : c)))

  const streamReply = (convId: string, msgId: string, reply: Reply) => {
    const total = tokenCount(reply.blocks)
    setStream({ id: msgId, shown: 0, total })
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      setStream((s) => {
        if (!s) return s
        const next = s.shown + 3
        if (next >= s.total) {
          clearInterval(timer.current)
          return null
        }
        return { ...s, shown: next }
      })
    }, 35)
    update(convId, (c) => ({ ...c, messages: [...c.messages, { id: msgId, role: "assistant", reply }] }))
    // Asked for evidence: the first one opens beside the chat. On a narrow screen the cards are enough.
    if (reply.showEvidence && reply.evidence?.length && window.matchMedia(wideQuery).matches) openEvidence(reply.evidence[0], reply.evidence)
  }

  const ask = async (question: string, convId = currentId) => {
    const q = question.trim()
    if (!q || busy) return
    const qLang = detectLang(q)
    const at = nowIso()
    let id = convId
    if (!id) {
      id = newId()
      const conv: Conversation = { id, title: q.length > 48 ? `${q.slice(0, 48)}…` : q, at, messages: [] }
      setHistory((list) => [conv, ...list])
      setCurrentId(id)
    }
    const target = id
    setDraft("")
    setHistory((list) => list.map((c) => (c.id === target ? { ...c, at, messages: [...c.messages, { id: newId(), role: "user", text: q, lang: qLang }] } : c)))
    setThinking(true)
    try {
      const reply = await getReply(q, qLang, filters)
      streamReply(target, newId(), reply)
    } catch {
      toast.danger(tr("Asisten tidak merespons. Coba lagi.", "The assistant is not responding. Try again."))
    } finally {
      setThinking(false)
    }
  }

  const stop = () => {
    if (!stream || !current) return
    clearInterval(timer.current)
    const { id, shown } = stream
    update(current.id, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === id && m.reply ? { ...m, reply: { ...m.reply, blocks: firstTokens(m.reply.blocks, shown) }, stopped: true } : m)) }))
    setStream(null)
  }

  const regenerate = async (msgId: string) => {
    if (!current || busy) return
    const i = current.messages.findIndex((m) => m.id === msgId)
    const question = current.messages.slice(0, i).findLast((m) => m.role === "user")
    if (!question?.text) return
    update(current.id, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== msgId) }))
    setThinking(true)
    try {
      streamReply(current.id, newId(), await getReply(question.text, question.lang ?? "id", filters))
    } finally {
      setThinking(false)
    }
  }

  const startNew = () => {
    stop()
    setViewerOpen(false)
    setCurrentId(null)
    setHistoryOpen(false)
  }

  const historyList = (
    <div className="flex h-full flex-col gap-3">
      <Button variant="secondary" onPress={startNew}>
        <MessageSquarePlus aria-hidden />
        {tr("Percakapan baru", "New conversation")}
      </Button>
      <ScrollShadow className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 px-1">
        {history.length === 0 && <p className="px-2 text-sm text-muted">{tr("Belum ada percakapan.", "No conversations yet.")}</p>}
        {history.map((c) => (
          <div key={c.id} className={cn("group flex items-center gap-1 rounded-lg hover:bg-default", c.id === currentId && "bg-default")}>
            <button
              type="button"
              className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
              aria-current={c.id === currentId}
              onClick={() => {
                stop()
                setViewerOpen(false)
                setCurrentId(c.id)
                setHistoryOpen(false)
              }}
            >
              {c.title}
            </button>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              aria-label={tr(`Hapus percakapan ${c.title}`, `Delete conversation ${c.title}`)}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              onPress={() => {
                setHistory((list) => list.filter((x) => x.id !== c.id))
                if (c.id === currentId) setCurrentId(null)
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
      </ScrollShadow>
      <p className="text-xs text-muted">{tr("Riwayat disimpan di browser ini saja.", "History is kept in this browser only.")}</p>
    </div>
  )

  return (
    <div className={cn("grid h-[calc(100dvh-11rem)] min-h-[34rem] gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]", viewer && viewerOpen && wide && "xl:grid-cols-[15rem_minmax(0,1fr)_24rem]")}>
      <aside className="hidden min-h-0 rounded-2xl bg-surface p-3 lg:block" aria-label={tr("Riwayat percakapan", "Conversation history")}>
        {historyList}
      </aside>

      <section className="flex min-h-0 flex-col rounded-2xl bg-surface" aria-label={tr("Percakapan", "Conversation")}>
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Button isIconOnly size="sm" variant="tertiary" className="lg:hidden" aria-label={tr("Riwayat percakapan", "Conversation history")} onPress={() => setHistoryOpen(true)}>
            <History aria-hidden />
          </Button>
          <span className="flex items-center gap-2 font-medium">
            <Sparkles className="size-4 text-accent" aria-hidden />
            HSE Assistant
          </span>
          <Chip size="sm" color="warning">
            {tr("Mode demo · tanpa LLM", "Demo mode · no LLM")}
          </Chip>
          <span className="ms-auto text-xs text-muted max-sm:hidden">{tr("Menjawab dari data dashboard dalam cakupan di bawah.", "Answers from the dashboard data in the scope below.")}</span>
        </header>

        <ScrollShadow ref={listRef} className="min-h-0 flex-1 px-4 py-6" aria-live="polite">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
                <Bot className="size-6" aria-hidden />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold font-display">{tr("Halo", "Hi")}
                  {firstName && `, ${firstName}`}. {tr("Apa yang ingin Anda ketahui?", "What would you like to know?")}</h2>
                <p className="text-sm text-muted">{tr("Tanya tentang risiko, antrean review, tindakan, kasus, atau kondisi perangkat. Bahasa Indonesia atau Inggris.", "Ask about risk, the review backlog, actions, cases or device health. In English or Indonesian.")}</p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {starters(getLang()).map((s) => (
                  <button key={s.title} type="button" onClick={() => ask(s.prompt)} className="flex flex-col gap-0.5 rounded-xl border border-border p-3 text-left hover:bg-default">
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="text-xs text-muted">{s.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <li key={m.id} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-default px-4 py-2.5 text-sm whitespace-pre-wrap">
                    {m.text}
                  </li>
                ) : (
                  <li key={m.id} className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground" aria-hidden>
                      <Bot className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                      {m.reply && (
                        <ReplyBlocks
                          blocks={stream?.id === m.id ? firstTokens(m.reply.blocks, stream.shown) : m.reply.blocks}
                          onRef={(id) => {
                            if (!id.startsWith("IND-")) return false
                            openEvidence(id, m.reply?.evidence ?? [])
                            return true
                          }}
                        />
                      )}
                      {m.stopped && <p className="text-xs text-muted italic">{tr("Dihentikan.", "Stopped.")}</p>}
                      {stream?.id !== m.id && m.reply && (
                        <>
                          {!!m.reply.evidence?.length && <EvidenceStrip ids={m.reply.evidence} site={filters.site} activeId={viewerOpen ? viewer?.id : undefined} onOpen={(id) => openEvidence(id, m.reply!.evidence!)} />}
                          {m.reply.cites.length > 0 && (
                            <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted">
                              <span>{tr("Sumber data:", "Data sources:")}</span>
                              {m.reply.cites.slice(0, 10).map((c) => (
                                <Link key={c.id} to={c.href} className="rounded bg-default px-1.5 py-0.5 text-foreground hover:underline">
                                  {c.id}
                                </Link>
                              ))}
                              {m.reply.cites.length > 10 && <span>+{m.reply.cites.length - 10}</span>}
                            </p>
                          )}
                          <div className="flex items-center gap-0.5 text-muted">
                            <Button isIconOnly size="sm" variant="tertiary" aria-label={tr("Salin jawaban", "Copy answer")} onPress={() => navigator.clipboard?.writeText(plainText(m.reply!.blocks)).then(() => toast.success(tr("Jawaban disalin.", "Answer copied.")))}>
                              <Copy aria-hidden />
                            </Button>
                            {i === messages.length - 1 && (
                              <Button isIconOnly size="sm" variant="tertiary" aria-label={tr("Buat ulang jawaban", "Regenerate answer")} onPress={() => regenerate(m.id)}>
                                <RotateCcw aria-hidden />
                              </Button>
                            )}
                            {(["up", "down"] as const).map((v) => (
                              <Button
                                key={v}
                                isIconOnly
                                size="sm"
                                variant="tertiary"
                                aria-label={v === "up" ? tr("Jawaban membantu", "Helpful answer") : tr("Jawaban kurang membantu", "Unhelpful answer")}
                                aria-pressed={m.feedback === v}
                                className={cn(m.feedback === v && "text-accent")}
                                onPress={() => current && update(current.id, (c) => ({ ...c, messages: c.messages.map((x) => (x.id === m.id ? { ...x, feedback: x.feedback === v ? undefined : v } : x)) }))}
                              >
                                {v === "up" ? <ThumbsUp aria-hidden /> : <ThumbsDown aria-hidden />}
                              </Button>
                            ))}
                          </div>
                          {i === messages.length - 1 && m.reply.follow.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {m.reply.follow.map((f) => (
                                <Button key={f} size="sm" variant="secondary" onPress={() => ask(f)}>
                                  {f}
                                </Button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ),
              )}
              {thinking && (
                <li className="flex items-center gap-3 text-sm text-muted">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground" aria-hidden>
                    <Bot className="size-4" />
                  </span>
                  <span className="flex gap-1" aria-label={lang === "id" ? "Menyusun jawaban" : "Composing an answer"}>
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="size-1.5 rounded-full bg-muted motion-safe:animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />
                    ))}
                  </span>
                </li>
              )}
            </ol>
          )}
        </ScrollShadow>

        <div className="border-t border-border px-4 pt-3 pb-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <div className="grid max-w-md grid-cols-2 gap-2 [&_label]:text-xs" aria-label={tr("Cakupan data", "Data scope")}>
              <FilterSelect field="site" />
              <FilterSelect field="periode" />
            </div>
            <form
              className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:ring-2 focus-within:ring-focus"
              onSubmit={(e) => {
                e.preventDefault()
                ask(draft)
              }}
            >
              <TextField value={draft} onChange={setDraft} className="min-w-0 flex-1">
                <Label className="sr-only">{tr("Pesan untuk asisten", "Message to the assistant")}</Label>
                <TextArea
                  rows={1}
                  placeholder={tr("Tanya tentang data HSE…", "Ask about the HSE data…")}
                  className="max-h-40 min-h-10 resize-none border-0 bg-transparent shadow-none focus:ring-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      ask(draft)
                    }
                  }}
                />
              </TextField>
              {stream ? (
                <Button isIconOnly aria-label={tr("Hentikan", "Stop")} onPress={stop}>
                  <Square aria-hidden className="fill-current" />
                </Button>
              ) : (
                <Button type="submit" isIconOnly aria-label={tr("Kirim", "Send")} isDisabled={!draft.trim() || thinking}>
                  <ArrowUp aria-hidden />
                </Button>
              )}
            </form>
            <p className="text-center text-xs text-muted">{tr("Enter untuk kirim, Shift+Enter untuk baris baru. Jawaban disusun dari data simulasi; periksa ID sumbernya sebelum bertindak.", "Enter to send, Shift+Enter for a new line. Answers are built from simulated data; check the source IDs before acting.")}</p>
          </div>
        </div>
      </section>

      {viewer && viewerOpen && wide && (
        <EvidencePanel id={viewer.id} ids={viewer.ids} site={filters.site} onNavigate={(id) => setViewer({ ...viewer, id })} onClose={() => setViewerOpen(false)} className="max-xl:hidden" />
      )}

      <Drawer.Backdrop isOpen={!!viewer && viewerOpen && !wide} onOpenChange={setViewerOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog aria-label={tr("Penampil bukti", "Evidence viewer")} className="p-0">
            {viewer && <EvidencePanel id={viewer.id} ids={viewer.ids} site={filters.site} onNavigate={(id) => setViewer({ ...viewer, id })} onClose={() => setViewerOpen(false)} className="h-full rounded-none" />}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      <Drawer.Backdrop isOpen={historyOpen} onOpenChange={setHistoryOpen}>
        <Drawer.Content placement="left">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>{tr("Riwayat percakapan", "Conversation history")}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>{historyList}</Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  )
}
