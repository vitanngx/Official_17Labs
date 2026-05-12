import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--text)]">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-10 border-b-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[21px] font-black">17 Labs</span>
            <span className="rounded border-2 border-[var(--border)] bg-[var(--primary)] px-2 py-0.5 font-mono text-[11px] font-black uppercase text-[#1C293C]">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              className="font-mono text-[13px] font-bold uppercase hover:text-[var(--secondary)]"
              href="#features"
            >
              Features
            </a>
            <a
              className="font-mono text-[13px] font-bold uppercase hover:text-[var(--secondary)]"
              href="#how-it-works"
            >
              How It Works
            </a>
            <Link
              className="rounded border-2 border-[var(--border)] bg-[var(--secondary)] px-4 py-2 font-mono text-[13px] font-black uppercase text-white shadow-[4px_4px_0_var(--shadow)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
              href="/dashboard"
            >
              Launch App
            </Link>
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
            Portfolio Intelligence Platform
          </p>

          <h1 className="mt-4 max-w-[720px] text-[42px] font-black leading-[1.1] md:text-[56px]">
            Optimize Your Portfolio{" "}
            <span className="inline-block rounded border-2 border-[var(--border)] bg-[var(--primary)] px-3 text-[#1C293C] shadow-[4px_4px_0_var(--shadow)]">
              Like a Quant.
            </span>
          </h1>

          <p className="mt-6 max-w-[560px] text-[17px] font-medium leading-relaxed text-[var(--muted)]">
            17 Labs uses Modern Portfolio Theory and scipy-based constrained
            optimization to find your ideal asset allocation — then tracks your
            real performance in real-time.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              className="rounded border-2 border-[var(--border)] bg-[var(--primary)] px-8 py-4 font-mono text-[15px] font-black uppercase text-[#1C293C] shadow-[6px_6px_0_var(--shadow)] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
              href="/dashboard"
            >
              Get Started — It&apos;s Free
            </Link>
            <a
              className="rounded border-2 border-[var(--border)] bg-[var(--panel)] px-8 py-4 font-mono text-[15px] font-black uppercase shadow-[6px_6px_0_var(--shadow)] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
              href="#features"
            >
              Learn More ↓
            </a>
          </div>

          {/* Stats row */}
          <div className="mt-16 flex flex-wrap gap-6">
            <StatBadge label="Optimization Engine" value="Scipy SLSQP" />
            <StatBadge label="Asset Classes" value="Stocks · Crypto · ETF" />
            <StatBadge label="Markets" value="US · VN · FR" />
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
            Core Features
          </p>
          <h2 className="mt-3 text-[35px] font-black">
            Everything You Need to Invest Smarter
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <FeatureCard
              description="Find the optimal asset allocation using Markowitz Mean-Variance optimization. Scipy SLSQP solver finds the true maximum Sharpe portfolio with customizable weight constraints."
              icon="📊"
              title="Strategy Optimizer"
            />
            <FeatureCard
              description="Track your real holdings, live market prices, P&L, and risk metrics. Compare your actual portfolio against the recommended strategy at a glance."
              icon="📈"
              title="Reality Tracker"
            />
            <FeatureCard
              description="Visualize thousands of possible portfolios on the Efficient Frontier scatter plot. See exactly where your optimal portfolio sits on the risk/return map."
              icon="🎯"
              title="Efficient Frontier"
            />
            <FeatureCard
              description="Support for US stocks, Vietnamese stocks (.VN), French stocks (.PA), crypto pairs, and ETFs — all in one unified dashboard."
              icon="🌍"
              title="Multi-Market Support"
            />
            <FeatureCard
              description="Choose Conservative, Balanced, or Aggressive profiles. Set target returns with tolerance bands. The optimizer respects your risk appetite."
              icon="⚖️"
              title="Risk Profiles"
            />
            <FeatureCard
              description="Full transaction ledger with BUY, SELL, CASH_IN, CASH_OUT, DIVIDEND, and TRANSFER support. Accurate cost basis and performance tracking."
              icon="📋"
              title="Transaction Ledger"
            />
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section
        className="border-b-2 border-[var(--border)] px-4 py-20 md:px-8"
        id="how-it-works"
      >
        <div className="mx-auto max-w-[1200px]">
          <p className="font-mono text-[13px] font-bold uppercase tracking-widest text-[var(--secondary)]">
            How It Works
          </p>
          <h2 className="mt-3 text-[35px] font-black">
            Three Steps to a Smarter Portfolio
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <StepCard
              description="Add your stocks, crypto, and ETFs to the asset universe. Or sync directly from your existing holdings in the Reality tab."
              step="01"
              title="Choose Your Assets"
            />
            <StepCard
              description="Select your risk profile, set your target return, and hit 'Find My Optimal Mix'. The scipy optimizer + Monte Carlo simulation does the rest."
              step="02"
              title="Run the Optimizer"
            />
            <StepCard
              description="Log your actual trades in the Reality tab. Compare your live portfolio against the recommended allocation and rebalance when needed."
              step="03"
              title="Track & Rebalance"
            />
          </div>
        </div>
      </section>

      {/* ── Tech Stack ── */}
      <section className="border-b-2 border-[var(--border)] px-4 py-20 md:px-8">
        <div className="mx-auto max-w-[1200px]">
          <p className="font-mono text-[13px] font-bold uppercase tracking-widest text-[var(--secondary)]">
            Under the Hood
          </p>
          <h2 className="mt-3 text-[35px] font-black">
            Built with Serious Tech
          </h2>

          <div className="mt-12 flex flex-wrap gap-3">
            <TechBadge label="Next.js 14" />
            <TechBadge label="React 18" />
            <TechBadge label="TypeScript" />
            <TechBadge label="Python 3" />
            <TechBadge label="NumPy" />
            <TechBadge label="Pandas" />
            <TechBadge label="Scipy Optimize" />
            <TechBadge label="SQLite" />
            <TechBadge label="Recharts" />
            <TechBadge label="Tailwind CSS" />
          </div>

          <p className="mt-8 max-w-[560px] text-[15px] leading-relaxed text-[var(--muted)]">
            Powered by{" "}
            <strong>Modern Portfolio Theory (Markowitz, 1952)</strong>.
            The optimizer uses scipy&apos;s SLSQP solver for precise constrained
            optimization, backed by Monte Carlo simulation for frontier
            visualization.
          </p>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="border-b-2 border-[var(--border)] bg-[var(--secondary)] px-4 py-20 text-white md:px-8">
        <div className="mx-auto max-w-[1200px] text-center">
          <h2 className="text-[35px] font-black md:text-[42px]">
            Ready to Optimize Your Portfolio?
          </h2>
          <p className="mx-auto mt-4 max-w-[480px] text-[17px] font-medium opacity-80">
            Start building a smarter investment strategy in minutes. No sign-up
            required.
          </p>
          <Link
            className="mt-10 inline-block rounded border-2 border-white bg-[var(--primary)] px-10 py-4 font-mono text-[15px] font-black uppercase text-[#1C293C] shadow-[6px_6px_0_rgba(0,0,0,0.3)] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
            href="/dashboard"
          >
            Launch the App →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div>
              <p className="text-[21px] font-black">17 Labs</p>
              <p className="mt-2 max-w-[360px] text-[13px] leading-relaxed text-[var(--muted)]">
                Portfolio Intelligence Platform. Built for investors who want
                data-driven decisions.
              </p>
            </div>
            <div className="flex gap-8">
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                  Product
                </p>
                <ul className="mt-3 space-y-2 text-[13px] font-bold">
                  <li>
                    <Link className="hover:text-[var(--secondary)]" href="/dashboard">
                      Dashboard
                    </Link>
                  </li>
                  <li>
                    <a className="hover:text-[var(--secondary)]" href="#features">
                      Features
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                  Legal
                </p>
                <ul className="mt-3 space-y-2 text-[13px] font-bold">
                  <li>
                    <a className="hover:text-[var(--secondary)]" href="#disclaimer">
                      Disclaimer
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div
            className="mt-10 rounded border-2 border-[var(--border)] bg-[var(--panel)] p-4 text-[12px] leading-relaxed text-[var(--muted)]"
            id="disclaimer"
          >
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest">
              ⚠️ Financial Disclaimer
            </p>
            <p className="mt-2">
              17 Labs is an educational and analytical tool. It does not
              constitute financial advice, nor is it a recommendation to buy or
              sell any securities. Past performance does not guarantee future
              results. All investment decisions involve risk. Always consult a
              licensed financial advisor before making investment decisions.
            </p>
          </div>

          <p className="mt-6 text-center font-mono text-[11px] text-[var(--muted)]">
            © {new Date().getFullYear()} 17 Labs. All rights reserved.
          </p>
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
