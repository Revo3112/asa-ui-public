import { useEffect, useRef, useState } from "react"
import { Button, Chip, Input, Label, ScrollShadow, TextField } from "@heroui/react"
import { Bot, SendHorizontal } from "lucide-react"

import { Segments } from "@/features/analysis/components/segments"
import { answer, intents, type Facts, type Lang, type Seg } from "@/features/analysis/data/analisis"
import type { Filters } from "@/shared/data/filters"
import { cn } from "@/shared/lib/utils"

type Message = { role: "user" | "assistant"; text?: string; segments?: Seg[][]; suggestions?: typeof intents; pending?: boolean }

/** Typed questions in English get English answers, whatever the page language is set to. */
const looksEnglish = (q: string) => /\b(what|which|how|why|is|are|the|should|show|last|week|night)\b/i.test(q)

/**
 * "Tanya Asisten": a chat over the computed facts. ponytail: intents are matched offline and the
 * answer is built from `briefFacts`; nothing goes to a model. A connected model would receive the
 * same facts and the same instruction to cite IDs and never invent a number.
 */
export function AssistantChat({ facts, lang, filters }: { facts: Facts; lang: Lang; filters: Filters }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  const ask = (question: string) => {
    const q = question.trim()
    if (!q) return
    const replyLang: Lang = looksEnglish(q) ? "en" : lang
    setDraft("")
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", pending: true }])
    // A short pause, as a real answer would take; the content is computed, not generated.
    timer.current = setTimeout(() => {
      const a = answer(q, facts, replyLang, filters)
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", segments: a.segments, suggestions: a.suggestions }])
    }, 700)
  }

  const label = (i: (typeof intents)[number]) => (lang === "id" ? i.id_label : i.en_label)

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label={lang === "id" ? "Contoh pertanyaan" : "Example questions"}>
        {intents.map((i) => (
          <Button key={i.id} size="sm" variant="secondary" onPress={() => ask(label(i))}>
            {label(i)}
          </Button>
        ))}
      </div>

      {/* The log takes the height the grid row gives it (the brief beside it sets that) and scrolls inside. */}
      <div className="relative min-h-72 flex-1">
      <ScrollShadow ref={listRef} className="absolute inset-0 flex flex-col gap-3 rounded-xl border border-border p-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="m-auto max-w-sm text-center text-sm text-muted">
            {lang === "id" ? "Pilih pertanyaan di atas atau ketik sendiri, dalam Bahasa Indonesia atau Inggris." : "Pick a question above or type your own, in English or Indonesian."}
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-accent-foreground">
              {m.text}
            </p>
          ) : (
            <div key={i} className="flex max-w-[90%] gap-2 self-start">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-default" aria-hidden>
                <Bot className="size-4" />
              </span>
              <div className={cn("flex flex-col gap-1 rounded-2xl rounded-tl-sm bg-default/60 px-3 py-2 text-sm", m.pending && "text-muted")}>
                {m.pending ? (
                  <span>{lang === "id" ? "Menghitung dari data…" : "Computing from the data…"}</span>
                ) : (
                  <>
                    {m.segments?.map((p, j) => (
                      <p key={j}>
                        <Segments segs={p} />
                      </p>
                    ))}
                    {m.suggestions && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {m.suggestions.map((s) => (
                          <Button key={s.id} size="sm" variant="tertiary" onPress={() => ask(label(s))}>
                            {label(s)}
                          </Button>
                        ))}
                      </span>
                    )}
                    <Chip size="sm" variant="soft" className="mt-1 self-start">
                      {lang === "id" ? "Dihitung dari data · tanpa LLM" : "Computed from data · no LLM"}
                    </Chip>
                  </>
                )}
              </div>
            </div>
          ),
        )}
      </ScrollShadow>
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          ask(draft)
        }}
      >
        <TextField value={draft} onChange={setDraft} className="min-w-0 flex-1">
          <Label className="sr-only">{lang === "id" ? "Pertanyaan" : "Question"}</Label>
          <Input placeholder={lang === "id" ? "Mis. zona mana paling berisiko?" : "E.g. which zone is riskiest?"} />
        </TextField>
        <Button type="submit" isIconOnly aria-label={lang === "id" ? "Kirim" : "Send"} isDisabled={!draft.trim()}>
          <SendHorizontal aria-hidden />
        </Button>
      </form>
    </div>
  )
}
