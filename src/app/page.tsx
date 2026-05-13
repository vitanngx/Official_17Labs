"use client";

import Link from "next/link";
import { useTranslation, LOCALES, LOCALE_LABELS, type Locale } from "@/i18n";

export default function LandingPage() {
  const { t, locale, setLocale } = useTranslation();

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--text)]">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-10 border-b-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[21px] font-black">{t("nav.brand")}</span>
          </div>
          <div className="flex items-center gap-3">
            <a className="font-mono text-[13px] font-bold uppercase hover:text-[var(--secondary)]" href="#features">{t("landing.nav.features")}</a>
            <a className="font-mono text-[13px] font-bold uppercase hover:text-[var(--secondary)]" href="#how-it-works">{t("landing.nav.howItWorks")}</a>
            <div className="flex rounded border-2 border-[var(--border)] bg-[var(--panel)] p-0.5 shadow-[3px_3px_0_var(--shadow)]">
              {LOCALES.map((loc) => (
                <button key={loc} type="button" onClick={() => setLocale(loc)} className={`rounded px-2 py-1 font-mono text-[11px] font-black transition-colors ${loc === locale ? "bg-[var(--primary)] text-[#1C293C]" : "hover:bg-[var(--panel-soft)]"}`}>{LOCALE_LABELS[loc]}</button>
              ))}
            </div>
            <Link className="rounded border-2 border-[var(--border)] bg-[var(--secondary)] px-4 py-2 font-mono text-[13px] font-black uppercase text-white shadow-[4px_4px_0_var(--shadow)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none" href="/dashboard">{t("landing.nav.launchApp")}</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden border-b-2 border-[var(--border)] px-4 py-20 md:px-8 md:py-32">
        {/* Background grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative mx-auto max-w-[1200px]">
          <p className="font-mono text-[13px] font-bold uppercase tracking-widest text-[var(--secondary)]">
            {t("landing.hero.subtitle")}
          </p>

          <h1 className="mt-4 max-w-[720px] text-[42px] font-black leading-[1.1] md:text-[56px]">
            {t("landing.hero.title")}{" "}
            <span className="inline-block rounded border-2 border-[var(--border)] bg-[var(--primary)] px-3 text-[#1C293C] shadow-[4px_4px_0_var(--shadow)]">
              {t("landing.hero.highlight")}
            </span>
          </h1>

          <p className="mt-6 max-w-[560px] text-[17px] font-medium leading-relaxed text-[var(--muted)]">
            {t("landing.hero.description")}
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              className="rounded border-2 border-[var(--border)] bg-[var(--primary)] px-8 py-4 font-mono text-[15px] font-black uppercase text-[#1C293C] shadow-[6px_6px_0_var(--shadow)] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
              href="/dashboard"
            >
              {t("landing.hero.cta")}
            </Link>
            <a
              className="rounded border-2 border-[var(--border)] bg-[var(--panel)] px-8 py-4 font-mono text-[15px] font-black uppercase shadow-[6px_6px_0_var(--shadow)] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
              href="#features"
            >
              {t("landing.hero.learnMore")}
            </a>
          </div>

          {/* Stats row */}
          <div className="mt-16 flex flex-wrap gap-6">
            <StatBadge label={t("landing.stats.engine.label")} value={t("landing.stats.engine.value")} />
            <StatBadge label={t("landing.stats.assets.label")} value={t("landing.stats.assets.value")} />
            <StatBadge label={t("landing.stats.markets.label")} value={t("landing.stats.markets.value")} />
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section
        className="border-b-2 border-[var(--border)] px-4 py-20 md:px-8"
        id="features"
      >
        <div className="mx-auto max-w-[1200px]">
          <p className="font-mono text-[13px] font-bold uppercase tracking-widest text-[var(--secondary)]">
            {t("landing.features.subtitle")}
          </p>
          <h2 className="mt-3 text-[35px] font-black">
            {t("landing.features.title")}
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <FeatureCard icon="📊" title={t("landing.features.optimizer.title")} description={t("landing.features.optimizer.desc")} />
            <FeatureCard icon="📈" title={t("landing.features.tracker.title")} description={t("landing.features.tracker.desc")} />
            <FeatureCard icon="🎯" title={t("landing.features.frontier.title")} description={t("landing.features.frontier.desc")} />
            <FeatureCard icon="🌍" title={t("landing.features.multiMarket.title")} description={t("landing.features.multiMarket.desc")} />
            <FeatureCard icon="⚖️" title={t("landing.features.risk.title")} description={t("landing.features.risk.desc")} />
            <FeatureCard icon="📋" title={t("landing.features.ledger.title")} description={t("landing.features.ledger.desc")} />
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section
        className="border-b-2 border-[var(--border)] px-4 py-20 md:px-8"
        id="how-it-works"
      >
        <div className="mx-auto max-w-[1200px]">
          <p className="font-mono text-[13px] font-bold uppercase tracking-widest text-[var(--secondary)]">{t("landing.howItWorks.subtitle")}</p>
          <h2 className="mt-3 text-[35px] font-black">{t("landing.howItWorks.title")}</h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <StepCard step="01" title={t("landing.howItWorks.step1.title")} description={t("landing.howItWorks.step1.desc")} />
            <StepCard step="02" title={t("landing.howItWorks.step2.title")} description={t("landing.howItWorks.step2.desc")} />
            <StepCard step="03" title={t("landing.howItWorks.step3.title")} description={t("landing.howItWorks.step3.desc")} />
          </div>
        </div>
      </section>

      {/* ── Tech Stack ── */}
      <section className="border-b-2 border-[var(--border)] px-4 py-20 md:px-8">
        <div className="mx-auto max-w-[1200px]">
          <p className="font-mono text-[13px] font-bold uppercase tracking-widest text-[var(--secondary)]">{t("landing.tech.subtitle")}</p>
          <h2 className="mt-3 text-[35px] font-black">{t("landing.tech.title")}</h2>
          <div className="mt-12 flex flex-wrap gap-3">
            {["Next.js 14","React 18","TypeScript","Python 3","NumPy","Pandas","Scipy Optimize","SQLite","Recharts","Tailwind CSS"].map(l=><TechBadge key={l} label={l}/>)}
          </div>
          <p className="mt-8 max-w-[560px] text-[15px] leading-relaxed text-[var(--muted)]">{t("landing.tech.description")}</p>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="border-b-2 border-[var(--border)] bg-[var(--secondary)] px-4 py-20 text-white md:px-8">
        <div className="mx-auto max-w-[1200px] text-center">
          <h2 className="text-[35px] font-black md:text-[42px]">{t("landing.cta.title")}</h2>
          <p className="mx-auto mt-4 max-w-[480px] text-[17px] font-medium opacity-80">{t("landing.cta.description")}</p>
          <Link className="mt-10 inline-block rounded border-2 border-white bg-[var(--primary)] px-10 py-4 font-mono text-[15px] font-black uppercase text-[#1C293C] shadow-[6px_6px_0_rgba(0,0,0,0.3)] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none" href="/dashboard">{t("landing.cta.button")}</Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div>
              <p className="text-[21px] font-black">{t("nav.brand")}</p>
              <p className="mt-2 max-w-[360px] text-[13px] leading-relaxed text-[var(--muted)]">{t("landing.footer.description")}</p>
            </div>
            <div className="flex gap-8">
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{t("landing.footer.product")}</p>
                <ul className="mt-3 space-y-2 text-[13px] font-bold">
                  <li><Link className="hover:text-[var(--secondary)]" href="/dashboard">{t("landing.footer.dashboard")}</Link></li>
                  <li><a className="hover:text-[var(--secondary)]" href="#features">{t("landing.footer.features")}</a></li>
                </ul>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{t("landing.footer.legal")}</p>
                <ul className="mt-3 space-y-2 text-[13px] font-bold">
                  <li><a className="hover:text-[var(--secondary)]" href="#disclaimer">{t("landing.footer.disclaimer")}</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 rounded border-2 border-[var(--border)] bg-[var(--panel)] p-4 text-[12px] leading-relaxed text-[var(--muted)]" id="disclaimer">
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest">{t("landing.footer.disclaimerTitle")}</p>
            <p className="mt-2">{t("landing.footer.disclaimerText")}</p>
          </div>
          <p className="mt-6 text-center font-mono text-[11px] text-[var(--muted)]">{t("landing.footer.copyright", { year: String(new Date().getFullYear()) })}</p>
        </div>
      </footer>
    </div>
  );
}

/* ── Subcomponents ── */

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border-2 border-[var(--border)] bg-[var(--panel)] px-4 py-3 shadow-[4px_4px_0_var(--shadow)]">
      <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-[15px] font-black">{value}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-6 shadow-[6px_6px_0_var(--shadow)] transition-transform hover:-translate-y-1">
      <span className="text-[32px]">{icon}</span>
      <h3 className="mt-3 text-[17px] font-black">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-6 shadow-[6px_6px_0_var(--shadow)]">
      <span className="inline-block rounded border-2 border-[var(--border)] bg-[var(--primary)] px-3 py-1 font-mono text-[21px] font-black text-[#1C293C] shadow-[3px_3px_0_var(--shadow)]">
        {step}
      </span>
      <h3 className="mt-4 text-[17px] font-black">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}

function TechBadge({ label }: { label: string }) {
  return (
    <span className="rounded border-2 border-[var(--border)] bg-[var(--panel)] px-4 py-2 font-mono text-[13px] font-bold shadow-[3px_3px_0_var(--shadow)] transition-transform hover:-translate-y-0.5">
      {label}
    </span>
  );
}
