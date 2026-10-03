import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * Shared list row used by dashboard routine rows, upcoming calls and ward
 * detail lists — one padding, radius and layout across the app.
 */
export function ListRow({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5",
        className,
      )}
      {...props}
    />
  )
}
