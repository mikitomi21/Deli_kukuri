import type { ReactNode } from "react"

import { useInView } from "@/hooks/useInView"
import { cn } from "@/lib/utils"

interface RevealProps {
  children: ReactNode
  className?: string
  delayMs?: number
}

export function Reveal({ children, className, delayMs = 0 }: RevealProps) {
  const [ref, isInView] = useInView<HTMLDivElement>()

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={cn(
        "transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity motion-reduce:duration-300",
        isInView
          ? "translate-y-0 opacity-100 blur-none"
          : "opacity-0 motion-safe:translate-y-6 motion-safe:blur-[2px]",
        className,
      )}
    >
      {children}
    </div>
  )
}
