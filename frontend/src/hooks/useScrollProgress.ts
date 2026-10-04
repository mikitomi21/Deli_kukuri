import { type RefObject, useEffect, useRef } from "react"

interface ScrollProgressOptions {
  startAt?: number
  endAt?: number
}

const PROGRESS_PROPERTY = "--scroll-progress"

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function useScrollProgress<T extends HTMLElement>({
  startAt = 1,
  endAt = 0.2,
}: ScrollProgressOptions = {}): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reducedMotion.matches) {
      element.style.setProperty(PROGRESS_PROPERTY, "1")
      return
    }

    let frame = 0
    const update = () => {
      frame = 0
      const viewportHeight = window.innerHeight
      const top = element.getBoundingClientRect().top
      const start = viewportHeight * startAt
      const end = viewportHeight * endAt
      const progress = clamp((start - top) / (start - end))
      element.style.setProperty(PROGRESS_PROPERTY, progress.toFixed(4))
    }
    const scheduleUpdate = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", scheduleUpdate)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", scheduleUpdate)
    }
  }, [startAt, endAt])

  return ref
}
