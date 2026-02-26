"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Reveal } from "@/components/marketing/Reveal";

const principles = [
  {
    title: "Atoms over abstractions",
    detail: "We optimize for real-world manufacturing outcomes, not dashboard vanity metrics.",
  },
  {
    title: "Execution over ideation",
    detail: "Ideas are cheap. We focus on the path from concept to supplier-validated reality.",
  },
  {
    title: "Visibility over black boxes",
    detail: "Every AI action is inspectable, editable, and tied to evidence.",
  },
  {
    title: "Human judgment for ambiguity",
    detail: "Automation handles repetition; humans handle commercial and legal edge cases.",
  },
];

const timeline = [
  {
    stage: "Problem",
    detail: "Physical product teams lose most time in fragmented pre-manufacturing coordination.",
  },
  {
    stage: "Insight",
    detail: "The real bottleneck is communication bandwidth across suppliers, not engineering intent.",
  },
  {
    stage: "Approach",
    detail: "Turn manufacturing preparation into an AI-run execution graph with confidence gates.",
  },
  {
    stage: "Outcome",
    detail: "Compress time-to-reality from months of uncertainty to structured days of progress.",
  },
];

const whatWeBuild = [
  "Product intent parser and requirement structuring",
  "Supplier discovery and capability mapping",
  "Structured RFQ drafting and dispatch",
  "Inbox reply parsing and term extraction",
  "Negotiation memory and escalation routing",
  "Decision dashboards with confidence and risk signals",
];

export default function AboutUsPage() {
  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="panel overflow-hidden relative">
        <div className="pointer-events-none absolute -top-24 right-[-60px] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(31,122,140,0.2)_0%,_rgba(31,122,140,0)_72%)]" />
        <Reveal>
          <p className="chip chip-progress">About Manufacture AI</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
            We build the execution layer for physical product creation.
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-subtle sm:text-lg">
            Our mission is straightforward: make it possible for an individual founder to do what previously required
            an entire manufacturing team. We focus on the period where most ideas die: before a factory-ready brief exists.
          </p>
        </Reveal>
      </section>

      <section className="panel">
        <Reveal>
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted">Our Principles</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">How we make decisions</h2>
        </Reveal>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {principles.map((item, idx) => (
            <Reveal key={item.title} delay={idx * 0.07}>
              <motion.article whileHover={{ y: -3 }} className="rounded-xl border border-line bg-[color:var(--surface-2)] p-4">
                <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm text-muted">{item.detail}</p>
              </motion.article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted">What We Build</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Core platform capabilities</h2>
        </Reveal>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {whatWeBuild.map((item, idx) => (
            <Reveal key={item} delay={idx * 0.05}>
              <div className="rounded-xl border border-line bg-white/80 px-4 py-3 text-sm text-subtle">{item}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted">Why Now</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Timing logic in 4 steps</h2>
        </Reveal>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {timeline.map((item, idx) => (
            <Reveal key={item.stage} delay={idx * 0.07}>
              <article className="rounded-xl border border-line bg-[color:var(--surface-2)] p-4">
                <p className="text-xs font-mono text-muted">{item.stage}</p>
                <p className="mt-1 text-sm text-subtle">{item.detail}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel glow text-center">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Want to see the system on your product idea?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-subtle sm:text-base">
            Share your concept, constraints, and target market. We will show the exact execution graph and supplier strategy.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="btn-primary">Try Dashboard</Link>
            <Link href="/contact-us" className="btn-secondary">Contact team</Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
