"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { V1_DRIVER } from "../lib/constants";
import { getSupabase } from "../lib/supabase";
import { clearAllPhotos } from "../lib/photoStore";
import { generatePutniNalog, type PutniNalogInput } from "../lib/generatePutniNalog";
import l from "./components/layout.module.css";
import p from "./page.module.css";

const LAST_TRANSFER_KEY = "fleet_last_transfer_v1";
const LAST_PUTNI_NALOG_KEY = "fleet_last_putni_nalog_v1";
const DRAFT_KEY = "fleet_draft_v1";
const STARTED_AT_KEY = "fleet_transfer_started_at";

type LastTransfer = {
  id: string;
  date: string;
  plateHr: string;
  dnevnicaLocation: string;
  dnevnicaAmount: number | null;
  totalEur: number;
  submittedAt: string;
};

type MonthTransfer = {
  id: string;
  transfer_date: string;
  dnevnica_location: string | null;
  dnevnica_amount_eur: number | null;
};

export default function Dashboard() {
  const router = useRouter();
  const [lastTransfer, setLastTransfer] = useState<LastTransfer | null>(null);
  const [lastPutniNalog, setLastPutniNalog] = useState<PutniNalogInput | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [hasActiveTransfer, setHasActiveTransfer] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [monthlyTransfers, setMonthlyTransfers] = useState<MonthTransfer[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("fleet-theme", next); } catch {}
  }

  useEffect(() => {
    // Prefer localStorage; fall back to whatever the inline init script applied
    // (covers the case: no stored pref but OS is light → script set data-theme="light")
    const stored = localStorage.getItem("fleet-theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else {
      const applied = document.documentElement.getAttribute("data-theme");
      if (applied === "light" || applied === "dark") setTheme(applied);
    }
  }, []);

  useEffect(() => {
    try {
      const lt = localStorage.getItem(LAST_TRANSFER_KEY);
      if (lt) setLastTransfer(JSON.parse(lt));
    } catch {}

    try {
      const pn = localStorage.getItem(LAST_PUTNI_NALOG_KEY);
      if (pn) setLastPutniNalog(JSON.parse(pn));
    } catch {}

    try {
      if (localStorage.getItem(STARTED_AT_KEY)) setHasActiveTransfer(true);
    } catch {}

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const meaningful =
          d.plateHrValue ||
          d.kmValue ||
          d.dnevnicaLocation ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (Array.isArray(d.receipts) && d.receipts.some((r: any) => r.result));
        setHasDraft(!!meaningful);
      }
    } catch {}

    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    if (navigator.onLine) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      getSupabase()
        .from("transfers")
        .select("id, transfer_date, dnevnica_location, dnevnica_amount_eur")
        .eq("driver_id", V1_DRIVER)
        .eq("status", "submitted")
        .is("deleted_at", null)
        .gte("transfer_date", monthStart)
        .lte("transfer_date", today)
        .order("transfer_date", { ascending: false })
        .then(({ data }) => { if (data) setMonthlyTransfers(data); })
        .then(() => setMonthLoading(false), () => setMonthLoading(false));
    } else {
      setMonthLoading(false);
    }

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  function startNew() {
    if (hasDraft || hasActiveTransfer) {
      if (!window.confirm("Postojeći nacrt i fotografije bit će obrisani. Nastaviti?")) return;
    }
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    localStorage.setItem(STARTED_AT_KEY, new Date().toISOString());
    clearAllPhotos().catch(() => {});
    router.push("/transfer");
  }

  function continueTransfer() {
    router.push("/transfer");
  }

  const monthlyTotal = monthlyTransfers.reduce(
    (sum, t) => sum + (t.dnevnica_amount_eur ?? 0), 0
  );

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Dobro jutro" : hour < 18 ? "Dobar dan" : "Dobra večer";
  const dateStr = now.toLocaleDateString("hr-HR", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <main className={p.main}>

      <div aria-hidden className={l.bgGrid} />
      <div aria-hidden className={l.bgGlow} />

      {/* ── Header ── */}
      <header className={p.header}>
        <div className={l.pageShell}>
          <div className={p.headerLayout}>
            <div>
              <div className={p.brandRow}>
                <span className={p.brandText}>FLEET</span>
                <span className={p.headerDivider} />
                <span className={p.transferLogText}>Transfer Log</span>
              </div>

              <p className={p.greeting}>
                {greeting},{" "}
                <strong className={p.greetingName}>Demo</strong>
              </p>

              <p className={p.date}>{dateStr}</p>
            </div>

            <div className={p.headerRight}>
              <button
                onClick={toggleTheme}
                className={`btn-press ${p.themeBtn}`}
                aria-label={theme === "dark" ? "Prebaci na svjetlu temu" : "Prebaci na tamnu temu"}
              >
                {theme === "dark" ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>

              {!isOnline && (
                <div className={p.offlineIndicator}>
                  <span className={p.offlineDot} />
                  <span className={p.offlineText}>OFFLINE</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Offline banner ── */}
      {!isOnline && (
        <div className={p.offlineBanner}>
          Nema interneta — slanje nije moguće
        </div>
      )}

      {/* ── Content ── */}
      <div className={`${l.pageShell} ${p.content}`}>

        {/* ── Last transfer card ── */}
        {lastTransfer && (
          <div className={`animate-up ${p.lastCard}`}>
            <div className={p.lastCardHeader}>
              <span className={p.lastCardLabel}>Zadnji transfer</span>
              <span className={p.lastCardDate}>{lastTransfer.date}</span>
            </div>

            <div className={p.lastCardPlate}>{lastTransfer.plateHr}</div>

            <div className={p.lastCardRow}>
              <span className={p.lastCardDnevnica}>
                {lastTransfer.dnevnicaLocation}
                {lastTransfer.dnevnicaAmount !== null && (
                  <span className={p.lastCardDnevnicaAmount}>
                    — {lastTransfer.dnevnicaAmount} €
                  </span>
                )}
              </span>
              <span className={p.lastCardTotal}>
                {lastTransfer.totalEur.toFixed(2)} €
              </span>
            </div>

            {lastPutniNalog && (
              <button
                onClick={() => generatePutniNalog(lastPutniNalog).catch(() => {})}
                className={`btn-press ${p.putniNalogBtn}`}
              >
                ⬇ Putni nalog
              </button>
            )}
          </div>
        )}

        {/* ── Draft warning ── */}
        {hasDraft && (
          <div className={`animate-up animate-up-1 ${p.draftCard}`}>
            <strong className={p.draftTitle}>Nedovršeni transfer</strong>
            Imaš nezavršeni transfer — nastavi ili počni novi.
          </div>
        )}

        {/* ── CTA buttons ── */}
        <div className="animate-up animate-up-2">
          {(hasActiveTransfer || hasDraft) ? (
            <div className={p.ctaStack}>
              <button
                onClick={continueTransfer}
                className={`btn-press glow-cta ${p.ctaContinue}`}
              >
                Nastavi Transfer →
              </button>

              <button
                onClick={startNew}
                className={`btn-press ${p.ctaNew}`}
              >
                Novi Transfer (briše nacrt)
              </button>
            </div>
          ) : (
            <button
              onClick={startNew}
              className={`btn-press glow-cta ${p.ctaSingle}`}
            >
              + Započni Transfer
            </button>
          )}
        </div>

        {/* ── Monthly transfers ── */}
        {!monthLoading && monthlyTransfers.length > 0 && (
          <div className={`animate-up animate-up-3 ${p.monthSection}`}>
            <div className={p.monthHeader}>
              <span className={p.monthTitle}>Transferi ovaj mjesec</span>
              <span className={p.monthCount}>{monthlyTransfers.length}×</span>
            </div>

            <div className={p.monthList}>
              {monthlyTransfers.map((t, i) => (
                <div
                  key={t.id}
                  className={p.monthRow}
                  // dynamic: last row has no border-bottom
                  style={{ borderBottom: i < monthlyTransfers.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}
                >
                  <div className={p.monthRowData}>
                    <span className={p.monthLocation}>{t.dnevnica_location ?? "—"}</span>
                    <span className={p.monthDate}>{t.transfer_date}</span>
                  </div>
                  {/* dynamic: color changes when row has no amount */}
                  <span
                    className={p.monthAmount}
                    style={{ color: t.dnevnica_amount_eur ? "var(--text)" : "var(--text-muted)" }}
                  >
                    {t.dnevnica_amount_eur !== null ? `${t.dnevnica_amount_eur} €` : "—"}
                  </span>
                </div>
              ))}

              <div className={p.monthTotalRow}>
                <span className={p.monthTotalLabel}>Ukupno dnevnica</span>
                <span className={p.monthTotalValue}>{monthlyTotal.toFixed(2)} €</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {monthLoading && isOnline && (
          <div className={`animate-up animate-up-3 ${p.skeletonSection}`}>
            <div className={`shimmer ${p.skeleton}`} />
          </div>
        )}

      </div>
    </main>
  );
}
