import { createFileRoute } from "@tanstack/react-router"

import { CallSection } from "@/components/Landing/CallSection"
import { CtaSection } from "@/components/Landing/CtaSection"
import { HeroSection } from "@/components/Landing/HeroSection"
import { HowItWorksSection } from "@/components/Landing/HowItWorksSection"
import { LandingFooter } from "@/components/Landing/LandingFooter"
import { LandingHeader } from "@/components/Landing/LandingHeader"
import { MedicationsSection } from "@/components/Landing/MedicationsSection"
import { PeaceSection } from "@/components/Landing/PeaceSection"
import { WhySection } from "@/components/Landing/WhySection"
import i18n from "@/i18n"

export const Route = createFileRoute("/welcome")({
  component: Welcome,
  head: () => ({
    meta: [
      {
        title: i18n.getFixedT(null, "landing")("metaTitle"),
      },
    ],
  }),
})

function Welcome() {
  return (
    <div data-landing className="min-h-svh overflow-x-clip">
      <LandingHeader />
      <main>
        <HeroSection />
        <WhySection />
        <HowItWorksSection />
        <CallSection />
        <MedicationsSection />
        <PeaceSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  )
}
