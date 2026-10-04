import { Reveal } from "@/components/Landing/Reveal"
import { cn } from "@/lib/utils"

interface SectionHeadingProps {
  id: string
  eyebrow: string
  title: string
  lead?: string
  align?: "start" | "center"
  className?: string
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "start",
  className,
}: SectionHeadingProps) {
  return (
    <Reveal
      className={cn(
        "max-w-3xl space-y-5",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <p className="text-sm font-semibold tracking-wide text-primary">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-5xl"
      >
        {title}
      </h2>
      {lead && (
        <p className="text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
          {lead}
        </p>
      )}
    </Reveal>
  )
}
