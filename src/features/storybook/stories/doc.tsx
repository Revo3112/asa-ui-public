import { useId, useState, type ReactNode } from "react"
import { Button } from "@heroui/react"
import { Check, Copy } from "lucide-react"
import HighlightModule from "react-highlight"

import { cn } from "@/shared/lib/utils"

const Highlight = HighlightModule.default ?? HighlightModule

/**
 * The code between `// #region name` and `// #endregion` in a story's own source (imported with `?raw`),
 * so the code shown is always the code that renders the preview above it.
 */
export function snippet(source: string, region: string) {
  const match = source.match(new RegExp(`// #region ${region}\\r?\\n([\\s\\S]*?)\\r?\\n// #endregion`))
  if (!match) throw new Error(`Region "${region}" tidak ada di sumber story.`)
  return match[1]
}

// Token colors from the brand palette on the ink frame, the same dark ground as the camera wall.
const tokens =
  "[&_.hljs-keyword]:text-tape [&_.hljs-literal]:text-tape [&_.hljs-built_in]:text-tape [&_.hljs-string]:text-tape-hi [&_.hljs-number]:text-tape-hi [&_.hljs-title]:text-[#8cc3de] [&_.hljs-name]:text-[#8cc3de] [&_.hljs-attr]:text-[#b5d0df] [&_.hljs-tag]:text-on-ink-muted [&_.hljs-comment]:text-on-ink-muted [&_.hljs-comment]:italic"

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  return (
    <div className={cn("relative rounded-xl border border-border bg-ink text-[13px] text-on-ink", tokens, className)}>
      {/* The clipboard API exists only on https and localhost, not on a plain-http site network. */}
      {window.isSecureContext && (
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={copied ? "Kode disalin" : "Salin kode"}
          className="absolute top-2 right-2 z-10 text-on-ink hover:bg-white/10"
          onPress={copy}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      )}
      <div tabIndex={0} role="region" aria-label="Contoh kode" className="overflow-x-auto rounded-xl [&_pre]:w-max [&_pre]:min-w-full [&_pre]:p-4 [&_pre]:pr-14 [&_pre]:leading-relaxed">
        <Highlight className="typescript">{code}</Highlight>
      </div>
    </div>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-default px-1 font-mono text-[13px]">{children}</code>
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-xl">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** A live preview on the dashboard's own background, with its source attached underneath. */
export function Example({ title, description, code, children }: { title: string; description?: ReactNode; code: string; children: ReactNode }) {
  return (
    <Section title={title}>
      {description && <p className="max-w-prose text-muted">{description}</p>}
      <div>
        <div className="rounded-t-xl border border-b-0 border-border bg-background p-4 sm:p-6">{children}</div>
        <CodeBlock code={code} className="rounded-t-none" />
      </div>
    </Section>
  )
}

/** One row per prop: name, type, and what it does. */
export function Props({ title = "Props", rows }: { title?: string; rows: [name: string, type: string, description: string][] }) {
  return (
    <Section title={title}>
      <div tabIndex={0} role="region" aria-label={`Tabel ${title}`} className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-xl text-left text-sm">
          <thead className="bg-default">
            <tr>
              <th className="px-3 py-2 font-medium">Prop</th>
              <th className="px-3 py-2 font-medium">Tipe</th>
              <th className="px-3 py-2 font-medium">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, type, description]) => (
              <tr key={name} className="border-t border-border align-top">
                <td className="px-3 py-2 font-mono text-[13px] whitespace-nowrap">{name}</td>
                <td className="px-3 py-2 font-mono text-[13px] text-muted">{type}</td>
                <td className="px-3 py-2">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
