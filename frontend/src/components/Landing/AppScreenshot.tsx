import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const SCREENSHOT_SIZES = {
  dashboard: { width: 1440, height: 900 },
  "add-ward": { width: 448, height: 482 },
  "add-routine": { width: 512, height: 488 },
  routines: { width: 1120, height: 250 },
  upcoming: { width: 1120, height: 250 },
  "call-turns": { width: 1120, height: 318 },
  calendar: { width: 1120, height: 233 },
  calls: { width: 1120, height: 470 },
  "med-ai": { width: 1120, height: 339 },
  "med-fda": { width: 1120, height: 420 },
  "ward-meds": { width: 1120, height: 422 },
} as const

export type ScreenshotName = keyof typeof SCREENSHOT_SIZES

interface AppScreenshotProps {
  name: ScreenshotName
  alt: string
  className?: string
  eager?: boolean
}

export function AppScreenshot({
  name,
  alt,
  className,
  eager = false,
}: AppScreenshotProps) {
  const { resolvedTheme } = useTheme()
  const { width, height } = SCREENSHOT_SIZES[name]

  return (
    <img
      src={`/landing/${resolvedTheme}/${name}.webp`}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cn(
        "h-auto select-none rounded-xl bg-card shadow-[0_24px_60px_-24px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10",
        className,
      )}
    />
  )
}
