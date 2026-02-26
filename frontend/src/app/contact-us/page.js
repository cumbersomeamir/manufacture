"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Reveal } from "@/components/marketing/Reveal";

const channels = [
  {
    title: "Founder onboarding",
    detail: "Walkthrough for a new product idea, constraints, and target manufacturing geography.",
  },
  {
    title: "Supplier network setup",
    detail: "Configure search regions, source preferences, and outreach channels.",
  },
  {
    title: "Enterprise pilot",
    detail: "Run Manufacture AI as a pre-manufacturing layer for an internal hardware team.",
  },
];

export default function ContactUsPage() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    company: "",
    productIdea: "",
    targetCountry: "",
    timeline: "",
  });

  const mailto = useMemo(() => {
    const subject = encodeURIComponent(`Manufacture AI inquiry - ${form.company || form.fullName || "New lead"}`);
    const body = encodeURIComponent(
      [
        `Name: ${form.fullName || ""}`,
        `Email: ${form.email || ""}`,
        `Company: ${form.company || ""}`,
        `Product Idea: ${form.productIdea || ""}`,
        `Target Country: ${form.targetCountry || ""}`,
        `Timeline: ${form.timeline || ""}`,
      ].join("\n"),
    );
    return `mailto:hello@manufacture.ai?subject=${subject}&body=${body}`;
  }, [form]);

  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="panel overflow-hidden relative">
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(224,142,69,0.22)_0%,_rgba(224,142,69,0)_70%)]" />
        <Reveal>
          <p className="chip chip-progress">Contact Us</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
            Bring your product idea. We will map the path to manufacturing reality.
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-subtle sm:text-lg">
            Share your target product, budget, and geography. We will help structure your execution graph and first supplier loop.
          </p>
        </Reveal>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Tell us what you want to build</h2>
            <p className="mt-2 text-sm text-muted">This pre-fills an email draft so your request is fully structured.</p>
          </Reveal>

          <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
            <label className="field">
              <span>Full name</span>
              <input
                value={form.fullName}
                onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Your name"
              />
            </label>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="you@company.com"
              />
            </label>

            <label className="field">
              <span>Company</span>
              <input
                value={form.company}
                onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
                placeholder="Optional"
              />
            </label>

            <label className="field">
              <span>Target country</span>
              <input
                value={form.targetCountry}
                onChange={(e) => setForm((prev) => ({ ...prev, targetCountry: e.target.value }))}
                placeholder="India / US / EU"
              />
            </label>

            <label className="field sm:col-span-2">
              <span>Product idea</span>
              <textarea
                rows={4}
                value={form.productIdea}
                onChange={(e) => setForm((prev) => ({ ...prev, productIdea: e.target.value }))}
                placeholder="Example: Voice-enabled desktop bot with Arduino + speaker + custom enclosure"
              />
            </label>

            <label className="field sm:col-span-2">
              <span>Timeline and constraints</span>
              <input
                value={form.timeline}
                onChange={(e) => setForm((prev) => ({ ...prev, timeline: e.target.value }))}
                placeholder="Example: prototype in 21 days, MOQ under 1000"
              />
            </label>

            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <a href={mailto} className="btn-primary">
                Open Email Draft
              </a>
              <Link href="/dashboard" className="btn-secondary">Go to Dashboard</Link>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <section className="panel">
            <Reveal>
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted">Contact Tracks</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">What we can help with</h2>
            </Reveal>
            <div className="mt-4 space-y-3">
              {channels.map((item, idx) => (
                <Reveal key={item.title} delay={idx * 0.06}>
                  <motion.article whileHover={{ y: -2 }} className="rounded-xl border border-line bg-[color:var(--surface-2)] p-4">
                    <h3 className="text-base font-semibold text-ink">{item.title}</h3>
                    <p className="mt-2 text-sm text-muted">{item.detail}</p>
                  </motion.article>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="panel">
            <Reveal>
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted">Response Expectation</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">Fast and concrete</h2>
              <div className="mt-3 space-y-2 text-sm text-subtle">
                <p>1. We respond with a manufacturing execution outline.</p>
                <p>2. We identify likely supplier classes and regions.</p>
                <p>3. We define the first outreach and negotiation loop.</p>
              </div>
            </Reveal>
          </section>
        </div>
      </section>
    </div>
  );
}
