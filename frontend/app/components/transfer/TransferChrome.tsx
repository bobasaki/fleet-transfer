"use client";
import { V1_DRIVER } from "../../../lib/constants";
import { cx } from "../formStyles";
import l from "../layout.module.css";
import c from "./TransferChrome.module.css";

// Background grid + red horizon glow + page header for the transfer page.
// Presentational only.
// (plan11 phase 2 step 7 — JSX moved verbatim out of app/transfer/page.tsx.)

interface Props {
  saved: boolean;
  onBack: () => void;
}

export default function TransferChrome({ saved, onBack }: Props) {
  return (
    <>
      {/* === Background grid === */}
      <div aria-hidden className={l.bgGrid} />

      {/* === Accent horizon glow === */}
      <div aria-hidden className={l.bgGlow} />

      {/* === Header === */}
      <header className={c.header}>
        <div className={cx(l.pageShell, c.headerInner)}>
          <div>
            <div className={c.brandRow}>
              <span className={c.brandName}>FLEET</span>
              <span className={c.brandDivider} />
              <span className={c.brandSub}>Novi Transfer</span>
            </div>
            <p className={c.driverName}>{V1_DRIVER}</p>
          </div>
          {!saved && (
            <button
              onClick={onBack}
              className={cx("btn-press", c.backBtn)}
            >
              ← Natrag
            </button>
          )}
        </div>
      </header>
    </>
  );
}
