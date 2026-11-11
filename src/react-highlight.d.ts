// react-highlight ships no types. It is CommonJS with `exports.default`, which dev and build unwrap differently.
declare module "react-highlight" {
  import type { ComponentType, ReactNode } from "react"

  type Highlight = ComponentType<{ className?: string; children?: ReactNode }>
  const Highlight: Highlight & { default?: Highlight }
  export default Highlight
}
