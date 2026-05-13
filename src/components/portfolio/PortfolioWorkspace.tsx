"use client";

import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import PortfolioTrackerTab from "@/components/portfolio/PortfolioTrackerTab";
import StrategyTab from "@/components/portfolio/StrategyTab";
import { useTranslation, LOCALES, LOCALE_LABELS } from "@/i18n";

type ActiveTab = "strategy" | "reality";
type ThemeMode = "light" | "dark";
type ToastTone = "error" | "success" | "info";

interface ToastMessage {
  id: string;
  message: string;
  tone: ToastTone;
}

const WORKSPACE_STORAGE_KEY = "official.workspace.v1";

export default function PortfolioWorkspace() {
  const { t, locale, setLocale } = useTranslation();
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("strategy");
  const [optimizedWeights, setOptimizedWeights] = React.useState<Record<string, number>>({});
  const [theme, setTheme] = React.useState<ThemeMode>("light");
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);
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

  const notify = React.useCallback((message: string, tone: ToastTone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, message, tone }].slice(-3));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, tone === "error" ? 6000 : 3600);
  }, []);

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--text)]" data-theme={theme}>
      <nav className="sticky top-0 z-10 border-b-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <a className="group" href="/">
              <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">
                {t("nav.subtitle")}
              </p>
              <h1 className="text-[27px] font-black group-hover:text-[var(--secondary)] transition-colors">
                {t("nav.brand")}
              </h1>
            </a>
            <div className="flex rounded border-2 border-[var(--border)] bg-[var(--panel)] p-1 shadow-[4px_4px_0_var(--shadow)]">
              <TabButton active={activeTab === "strategy"} onClick={() => setActiveTab("strategy")}>
                {t("nav.strategy")}
              </TabButton>
              <TabButton active={activeTab === "reality"} onClick={() => setActiveTab("reality")}>
                {t("nav.reality")}
              </TabButton>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded border-2 border-[var(--border)] bg-[var(--panel)] p-0.5 shadow-[3px_3px_0_var(--shadow)]">
              {LOCALES.map((loc) => (
                <button key={loc} type="button" onClick={() => setLocale(loc)} className={`rounded px-2 py-1.5 font-mono text-[11px] font-black transition-colors ${loc === locale ? "bg-[var(--primary)] text-[#1C293C]" : "hover:bg-[var(--panel-soft)]"}`}>{LOCALE_LABELS[loc]}</button>
              ))}
            </div>
            <div className="flex rounded border-2 border-[var(--border)] bg-[var(--panel)] p-1 shadow-[4px_4px_0_var(--shadow)]">
              <ModeButton active={theme === "light"} onClick={() => setTheme("light")}>
                {t("nav.light")}
              </ModeButton>
              <ModeButton active={theme === "dark"} onClick={() => setTheme("dark")}>
                {t("nav.dark")}
              </ModeButton>
            </div>
          </div>
        </div>
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          initial={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {activeTab === "strategy" ? (
            <StrategyTab onNotify={notify} onOptimizedWeightsChange={setOptimizedWeights} />
          ) : (
            <PortfolioTrackerTab optimizedWeights={optimizedWeights} onNotify={notify} />
          )}
        </motion.div>
      </AnimatePresence>

      <ToastStack toasts={toasts} />
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

function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="fixed right-4 top-24 z-50 flex w-[min(420px,calc(100vw-32px))] flex-col gap-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className={`rounded border-2 border-[var(--border)] px-4 py-3 font-bold shadow-[5px_5px_0_var(--shadow)] ${
              toast.tone === "error"
                ? "bg-[var(--danger)] text-white"
                : toast.tone === "success"
                  ? "bg-[var(--success)] text-white"
                  : "bg-[var(--panel)] text-[var(--text)]"
            }`}
            exit={{ opacity: 0, x: 24, scale: 0.98 }}
            initial={{ opacity: 0, x: 24, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <p className="font-mono text-[13px] font-black uppercase">
              {toast.tone === "error" ? "Action needed" : "Update"}
            </p>
            <p className="mt-1 text-[14px]">{toast.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
