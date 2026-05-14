import React from "react";
import { useTranslation } from "@/i18n";

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = await response.json();
      if (response.ok && payload.ok) {
        onSuccess();
      } else {
        setError(payload.error || t("auth.invalidPassword") || "Invalid password.");
      }
    } catch {
      setError(t("auth.networkError") || "Network error during login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00000080] p-4 backdrop-blur-sm">
      <div className="w-full max-w-[400px] rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] p-6 shadow-[8px_8px_0_var(--shadow)] animate-in fade-in zoom-in-95 duration-200">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-xl shadow-[2px_2px_0_var(--shadow)] border-2 border-[var(--border)] text-[#1C293C]">
            🔒
          </div>
          <div>
            <h2 className="text-xl font-black text-[var(--text)]">{t("auth.title") || "Administrator Access"}</h2>
            <p className="mt-1 text-[13px] font-bold opacity-70">{t("auth.description") || "Enter your password to unlock protected features."}</p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder={t("auth.passwordPlaceholder") || "Password"}
              className="h-12 w-full rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] px-3 font-mono text-[15px] font-bold text-[var(--text)] outline-none focus:shadow-[0_0_0_3px_var(--primary)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="mt-2 text-[13px] font-bold text-[var(--danger)]">{error}</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full rounded border-2 border-[var(--border)] bg-[var(--panel)] font-mono text-[13px] font-black uppercase text-[var(--text)] shadow-[4px_4px_0_var(--shadow)] active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              {t("auth.cancel") || "Cancel"}
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="h-11 w-full rounded border-2 border-[var(--border)] bg-[var(--secondary)] font-mono text-[13px] font-black uppercase text-[#ffffff] shadow-[4px_4px_0_var(--shadow)] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (t("auth.unlocking") || "Unlocking...") : (t("auth.unlock") || "Unlock")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
