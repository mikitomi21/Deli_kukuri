import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface BrowserFrameProps {
  children: ReactNode
  address: string
  className?: string
}

export function BrowserFrame({
  children,
  address,
  className,
}: BrowserFrameProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-card shadow-[0_40px_120px_-40px_rgb(0_0_0/0.45)] ring-1 ring-foreground/10",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-10 items-center gap-3 border-b bg-muted/60 px-4"
      >
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="mx-auto w-full max-w-xs truncate rounded-md bg-background/80 px-3 py-1 text-center text-xs text-muted-foreground ring-1 ring-foreground/5">
          {address}
        </div>
        <div className="w-10" />
      </div>
      {children}
    </div>
  )
}
