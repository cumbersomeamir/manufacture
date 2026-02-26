"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Reveal } from "@/components/marketing/Reveal";
import { FactoryScene } from "@/components/marketing/FactoryScene";

const problemSignals = [
  {
    title: "Fragmented supplier search",
    detail: "Founders jump between random directories, old spreadsheets, and unreliable contacts.",
  },
  {
    title: "Low-signal outreach",
    detail: "Unstructured RFQs get generic replies with missing MOQ, tooling, and lead-time detail.",
  },
  {
    title: "Negotiation memory loss",
    detail: "Teams lose context across threads, so each round restarts from zero.",
  },
  {
    title: "Decision paralysis",
    detail: "Comparisons collapse because pricing, quality risk, and speed are never normalized.",
  },
];

const firstPrinciples = [
  {
    step: "01",
    title: "Clarity before outreach",
    text: "Convert the idea into explicit specs, constraints, and success criteria before talking to any supplier.",
  },
  {
    step: "02",
    title: "Right supplier class",
    text: "Find factories by manufacturing capability, geography, and export fit instead of keyword matching.",
  },
  {
    step: "03",
    title: "Structured communication",
    text: "Every RFQ follows a schema so responses become machine-readable and comparable.",
  },
  {
    step: "04",
    title: "Continuous extraction",
    text: "Parse each reply for price, MOQ, lead time, tooling cost, and risk flags automatically.",
  },
  {
    step: "05",
    title: "Human escalation only on uncertainty",
    text: "AI runs execution loops and only pulls you in when confidence drops or legal/commercial risk rises.",
  },
];

const executionGraph = [
  "Ideation breakdown",
  "BOM draft and process mapping",
  "Compliance pre-check",
  "Supplier discovery",
  "RFQ generation",
  "Outreach and follow-up",
  "Negotiation rounds",
  "Factory-ready handoff",
];

const differentiators = [
  {
    label: "Generic procurement tools",
    points: ["Track tasks", "Static vendor list", "Human-heavy communication"],
  },
  {
    label: "Agency/consultant model",
    points: ["Expert dependent", "Slow handoffs", "Opaque playbooks"],
  },
  {
    label: "Manufacture AI",
    points: ["Autonomous execution graph", "Live supplier intelligence", "Human-in-loop risk gating"],
    featured: true,
  },
];

const impactStats = [
  { metric: "10-50x", label: "Faster idea -> validated feasibility" },
  { metric: "70%+", label: "Manual coordination reduced" },
  { metric: "24/7", label: "Negotiation and follow-up coverage" },
  { metric: "1 view", label: "Unified status from idea to final shortlist" },
];

const dataSurfaces = [
  {
    title: "Supplier discovery layer",
    detail: "Search-backed discovery pipeline with region targeting, manufacturability filters, and source attribution.",
  },
  {
    title: "Email orchestration",
    detail: "SMTP + IMAP integration powers outreach, reminders, inbox sync, and response parsing loops.",
  },
  {
    title: "Conversation memory",
    detail: "Negotiation context persists across rounds, so price and term discussions compound instead of reset.",
  },
  {
    title: "Scoring and confidence",
    detail: "Supplier cards expose confidence, missing fields, and risk flags for fast human judgment.",
  },
];

const scenarios = [
  {
    product: "Voice-enabled Arduino desk bot",
    summary: "Electronics enclosure + PCB assembly + speaker module + packaging from coordinated suppliers.",
  },
  {
    product: "Insulated smart shaker",
    summary: "Food-safe material validation, tooling estimate, and MOQ negotiation in one workflow.",
  },
  {
    product: "Custom creator merch hardware",
    summary: "Fast sample loops for branded physical SKUs with lead-time and landed-cost visibility.",
  },
];

const controls = [
  "No silent AI actions: every outbound message is logged and inspectable.",
  "Confidence thresholds gate autonomous follow-ups and term negotiation.",
  "Compliance and legal ambiguities escalate to humans automatically.",
  "Structured audit trail from first supplier contact to final decision.",
];

const launchPlan = [
  { day: "Day 1", task: "Define product goal, constraints, and success metrics." },
  { day: "Day 2", task: "Run discovery and generate first supplier shortlist." },
  { day: "Day 3", task: "Dispatch structured RFQs and start inbox sync." },
  { day: "Day 4", task: "Parse responses and identify data gaps automatically." },
  { day: "Day 5", task: "Negotiate MOQ, price bands, and lead-time windows." },
  { day: "Day 6", task: "Score candidates and prepare final factory-ready brief." },
  { day: "Day 7", task: "Choose supplier and move to production handoff." },
];

const faqs = [
  {
    q: "Can this work for completely new product ideas?",
    a: "Yes. The workflow starts from intent and constraints, not existing SKU history.",
  },
  {
    q: "Do I need to trust fully autonomous negotiation?",
    a: "No. You can keep any step manual and let AI only assist drafting, follow-ups, and extraction.",
  },
  {
    q: "Does this replace factories?",
    a: "No. It compresses pre-manufacturing coordination so factories receive cleaner briefs faster.",
  },
];

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="mb-6 sm:mb-8">
      <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm text-subtle sm:text-base">{description}</p>
    </div>
  );
}

export default function HomeMarketingPage() {
  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="panel overflow-hidden relative">
        <div className="pointer-events-none absolute -right-28 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(31,122,140,0.24)_0%,_rgba(31,122,140,0)_70%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(224,142,69,0.2)_0%,_rgba(224,142,69,0)_75%)]" />

        <div className="relative grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
          <Reveal>
            <p className="chip chip-progress">Physical Product Creation OS</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
              From idea to factory-ready in days, not months.
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-subtle sm:text-lg">
              Manufacture AI runs the pre-manufacturing stack end-to-end: requirement structuring, supplier discovery,
              RFQ outreach, response parsing, and negotiation loops. Humans step in only where uncertainty is real.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/dashboard" className="btn-primary">Start in Dashboard</Link>
              <Link href="/contact-us" className="btn-secondary">Talk to us</Link>
              <Link href="/about-us" className="btn-ghost">How we think</Link>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {impactStats.slice(0, 3).map((item, idx) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ delay: 0.12 * idx, duration: 0.55 }}
                  className="rounded-xl border border-line bg-backdrop/80 px-3 py-3"
                >
                  <p className="text-xl font-semibold text-ink sm:text-2xl">{item.metric}</p>
                  <p className="text-xs text-muted sm:text-sm">{item.label}</p>
                </motion.div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <FactoryScene />
          </Reveal>
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <SectionTitle
            eyebrow="Section 1"
            title="The bottleneck is coordination, not imagination"
            description="Most hardware ideas fail before prototyping because execution data is fragmented across search, email, and negotiation threads."
          />
        </Reveal>
        <div className="grid gap-3 md:grid-cols-2">
          {problemSignals.map((item, idx) => (
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
          <SectionTitle
            eyebrow="Section 2"
            title="First-principles execution engine"
            description="We break the physical product journey into deterministic loops, then automate the loops instead of just visualizing them."
          />
        </Reveal>
        <div className="grid gap-3 lg:grid-cols-5">
          {firstPrinciples.map((item, idx) => (
            <Reveal key={item.step} delay={idx * 0.08}>
              <article className="h-full rounded-xl border border-line bg-backdrop/70 p-4">
                <p className="text-xs font-mono text-muted">{item.step}</p>
                <h3 className="mt-1 text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm text-muted">{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <SectionTitle
            eyebrow="Section 3"
            title="One execution graph, all moving parts"
            description="The platform turns pre-manufacturing into a trackable status graph so each stage is explicit and measurable."
          />
        </Reveal>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {executionGraph.map((item, idx) => (
            <Reveal key={item} delay={idx * 0.06}>
              <motion.div
                whileHover={{ scale: 1.015 }}
                className="rounded-xl border border-line bg-white/80 p-4"
              >
                <p className="text-xs font-mono text-muted">STEP {String(idx + 1).padStart(2, "0")}</p>
                <p className="mt-1 text-base font-medium text-ink">{item}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <SectionTitle
            eyebrow="Section 4"
            title="How we are different"
            description="We are not ERP, not marketplace software, and not static procurement SaaS. We are an autonomous creation accelerator."
          />
        </Reveal>
        <div className="grid gap-3 md:grid-cols-3">
          {differentiators.map((column, idx) => (
            <Reveal key={column.label} delay={idx * 0.08}>
              <article
                className="h-full rounded-xl border border-line bg-[color:var(--surface-2)] p-4"
                style={
                  column.featured
                    ? {
                        borderColor: "var(--accent)",
                        background: "color-mix(in srgb, var(--accent) 10%, white)",
                      }
                    : undefined
                }
              >
                <h3 className="text-lg font-semibold text-ink">{column.label}</h3>
                <div className="mt-3 space-y-2">
                  {column.points.map((point) => (
                    <p key={point} className="rounded-lg border border-line bg-white/75 px-3 py-2 text-sm text-subtle">
                      {point}
                    </p>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <SectionTitle
            eyebrow="Section 5"
            title="Impact model: reduce time-to-reality"
            description="This product is designed around outcome compression. Better decisions happen because better context arrives faster."
          />
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {impactStats.map((item, idx) => (
            <Reveal key={item.metric + item.label} delay={idx * 0.07}>
              <motion.article whileHover={{ y: -3 }} className="rounded-xl border border-line bg-white p-4 text-center">
                <p className="text-3xl font-semibold tracking-tight text-ink">{item.metric}</p>
                <p className="mt-1 text-sm text-muted">{item.label}</p>
              </motion.article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <SectionTitle
            eyebrow="Section 6"
            title="Real-world data surfaces"
            description="Execution quality depends on live data and communication channels. Every signal stays attached to evidence and source."
          />
        </Reveal>
        <div className="grid gap-3 md:grid-cols-2">
          {dataSurfaces.map((item, idx) => (
            <Reveal key={item.title} delay={idx * 0.08}>
              <article className="rounded-xl border border-line bg-backdrop/65 p-4">
                <h3 className="text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm text-muted">{item.detail}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <SectionTitle
            eyebrow="Section 7"
            title="What this enables in practice"
            description="Any founder can start with a plain-language concept and reach real manufacturing conversations rapidly."
          />
        </Reveal>
        <div className="grid gap-3 md:grid-cols-3">
          {scenarios.map((item, idx) => (
            <Reveal key={item.product} delay={idx * 0.08}>
              <motion.article whileHover={{ y: -2 }} className="rounded-xl border border-line bg-[color:var(--surface-2)] p-4">
                <h3 className="text-base font-semibold text-ink">{item.product}</h3>
                <p className="mt-2 text-sm text-muted">{item.summary}</p>
              </motion.article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <SectionTitle
            eyebrow="Section 8"
            title="Control model and risk gates"
            description="Automation is constrained by confidence and policy. You always retain final control over commercial commitments."
          />
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2">
          {controls.map((item, idx) => (
            <Reveal key={item} delay={idx * 0.07}>
              <div className="rounded-xl border border-line bg-white/75 px-4 py-3 text-sm text-subtle">{item}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <SectionTitle
            eyebrow="Section 9"
            title="7-day implementation path"
            description="A practical rollout sequence for shipping your first real supplier-backed product outcome quickly."
          />
        </Reveal>
        <div className="grid gap-2">
          {launchPlan.map((item, idx) => (
            <Reveal key={item.day} delay={idx * 0.05}>
              <div className="rounded-xl border border-line bg-[color:var(--surface-2)] px-4 py-3 sm:flex sm:items-center sm:justify-between">
                <p className="text-sm font-mono text-muted">{item.day}</p>
                <p className="mt-1 text-sm text-subtle sm:mt-0">{item.task}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel">
        <Reveal>
          <SectionTitle
            eyebrow="Section 10"
            title="Common questions"
            description="Designed for clarity and speed without forcing blind trust in automation."
          />
        </Reveal>
        <div className="space-y-3">
          {faqs.map((item, idx) => (
            <Reveal key={item.q} delay={idx * 0.07}>
              <article className="rounded-xl border border-line bg-white/80 p-4">
                <h3 className="text-base font-semibold text-ink">{item.q}</h3>
                <p className="mt-2 text-sm text-muted">{item.a}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="panel glow text-center">
        <Reveal>
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted">Section 11</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Build the product before momentum dies.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-subtle sm:text-base">
            Manufacture AI helps you execute the physical world faster: less waiting, fewer blind spots, more validated paths.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="btn-primary">Launch a Project</Link>
            <Link href="/contact-us" className="btn-secondary">Book a walkthrough</Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
