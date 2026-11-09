"use client";
import { s, cx } from "../formStyles";
import c from "./SubmitSection.module.css";

// Soft warnings + blocking validation errors + the submit CTA.
// Presentational only; validation runs in page.tsx.
// (plan11 phase 2 step 7 — JSX moved verbatim out of app/transfer/page.tsx.)

interface Props {
  submitWarnings: string[];
  validationErrors: string[];
  savePhase: "idle" | "saving" | "saved" | "error";
  canSave: boolean;
  onSubmit: () => void;
}

export default function SubmitSection({
  submitWarnings, validationErrors, savePhase, canSave, onSubmit,
}: Props) {
  const saved = savePhase === "saved";
  return (
    <>
      {/* === Soft warnings (non-blocking) === */}
      {submitWarnings.length > 0 && savePhase !== "saved" && (
        <div className={s.warnBox}>
          <strong className={c.listHeader}>Provjeri (ne blokira slanje):</strong>
          <ul className={c.list}>
            {submitWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* === Validation errors === */}
      {validationErrors.length > 0 && savePhase !== "saved" && (
        <div className={s.errorBox}>
          <strong className={c.listHeader}>Prije slanja ispravi:</strong>
          <ul className={c.list}>
            {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* === Submit === */}
      {!saved && (
        <button
          onClick={onSubmit}
          disabled={!canSave}
          className={cx(
            canSave ? "btn-press glow-cta" : "btn-press",
            c.submitBtn,
            canSave ? c.submitBtnActive : c.submitBtnInactive,
          )}
        >
          {savePhase === "saving" ? "Šaljem…" : "Pošalji transfer"}
        </button>
      )}
    </>
  );
}
