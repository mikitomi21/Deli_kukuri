import { type RefObject, useEffect, useRef, useState } from "react"

interface InViewOptions {
  threshold?: number
  rootMargin?: string
  once?: boolean
}

export function useInView<T extends Element>({
  threshold = 0.2,
  rootMargin = "0px 0px -10% 0px",
  once = true,
}: InViewOptions = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          if (once) observer.disconnect()
          return
        }
        if (!once) setIsInView(false)
      },
      { threshold, rootMargin },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  return [ref, isInView]
}
