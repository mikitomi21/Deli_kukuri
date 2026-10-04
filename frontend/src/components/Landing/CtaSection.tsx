import { Link } from "@tanstack/react-router"
import { ArrowRight, PhoneCall } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Reveal } from "@/components/Landing/Reveal"
import { Button } from "@/components/ui/button"

export function CtaSection() {
  const { t } = useTranslation("landing")

  return (
    <section
      aria-labelledby="cta-title"
      className="px-4 pb-28 sm:px-6 sm:pb-36"
    >
      <Reveal className="relative isolate mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-muted/40 px-6 py-20 text-center ring-1 ring-foreground/5 sm:px-16 sm:py-24">
        <div
          aria-hidden="true"
          className="landing-glow absolute -bottom-1/2 left-1/2 -z-10 h-full w-[140%] -translate-x-1/2"
        />
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_16px_40px_-12px_var(--primary)]">
          <PhoneCall aria-hidden="true" className="size-6" />
        </span>
        <h2
          id="cta-title"
          className="mt-8 text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-5xl"
        >
          {t("cta.title")}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
          {t("cta.lead")}
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 px-7 text-base">
            <Link to="/signup">
              {t("cta.primary")}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 px-7 text-base"
          >
            <Link to="/login">{t("cta.secondary")}</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  )
}
