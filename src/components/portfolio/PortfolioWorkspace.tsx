"use client";

import React from "react";
import PortfolioTrackerTab from "@/components/portfolio/PortfolioTrackerTab";
import StrategyTab from "@/components/portfolio/StrategyTab";

type ActiveTab = "strategy" | "reality";
type ThemeMode = "light" | "dark";

const WORKSPACE_STORAGE_KEY = "official.workspace.v1";

export default function PortfolioWorkspace() {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("strategy");
  const [optimizedWeights, setOptimizedWeights] = React.useState<Record<string, number>>({});
  const [theme, setTheme] = React.useState<ThemeMode>("light");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          activeTab?: ActiveTab;
          optimizedWeights?: Record<string, number>;
          theme?: ThemeMode;
        };

        if (saved.activeTab === "strategy" || saved.activeTab === "reality") {
          setActiveTab(saved.activeTab);
        }
        if (saved.optimizedWeights && typeof saved.optimizedWeights === "object") {
          setOptimizedWeights(saved.optimizedWeights);
        }
        if (saved.theme === "light" || saved.theme === "dark") {
          setTheme(saved.theme);
        }
      }
    } catch {
      // Ignore storage failures; tab state is a convenience.
    } finally {
      setHydrated(true);
    }
  }, []);

  React.useEffect(() => {
    if (!hydrated) {
      return;
    }

    try {
      window.localStorage.setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify({ activeTab, optimizedWeights, theme })
      );
    } catch {
      // Ignore storage failures; the app can still run without this preference.
    }
  }, [activeTab, hydrated, optimizedWeights, theme]);

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--text)]" data-theme={theme}>
      <nav className="sticky top-0 z-10 border-b-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">
              Official / Portfolio Intelligence
            </p>
            <h1 className="text-[27px] font-black">17 Labs + Reality Tracker</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded border-2 border-[var(--border)] bg-[var(--panel)] p-1 shadow-[4px_4px_0_var(--shadow)]">
              <ModeButton active={theme === "light"} onClick={() => setTheme("light")}>
                Light
              </ModeButton>
              <ModeButton active={theme === "dark"} onClick={() => setTheme("dark")}>
                Dark
              </ModeButton>
            </div>
            <div className="flex rounded border-2 border-[var(--border)] bg-[var(--panel)] p-1 shadow-[4px_4px_0_var(--shadow)]">
              <TabButton active={activeTab === "strategy"} onClick={() => setActiveTab("strategy")}>
                Strategy
              </TabButton>
              <TabButton active={activeTab === "reality"} onClick={() => setActiveTab("reality")}>
                Reality
              </TabButton>
            </div>
          </div>
        </div>
      </nav>

      {activeTab === "strategy" ? (
        <StrategyTab onOptimizedWeightsChange={setOptimizedWeights} />
      ) : (
        <PortfolioTrackerTab optimizedWeights={optimizedWeights} />
      )}
    </main>
  );
}

function TabButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded px-4 py-2 font-mono text-[13px] font-black uppercase ${
        active ? "bg-[var(--primary)] text-[#1C293C]" : "bg-[var(--panel)] hover:bg-[var(--panel-soft)]"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ModeButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded px-3 py-2 font-mono text-[13px] font-black uppercase ${
        active ? "bg-[var(--primary)] text-[#1C293C]" : "bg-[var(--panel)] hover:bg-[var(--panel-soft)]"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
