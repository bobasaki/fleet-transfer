"use client";
import c from "./SuccessPanel.module.css";

// Post-submit success card with the putni-nalog download and finish actions.
// Presentational only — the download payload is assembled in page.tsx.
// (plan11 phase 2 step 7 — JSX moved verbatim out of app/transfer/page.tsx.)

interface Props {
  savedId: string;
  onDownloadPutniNalog: () => void;
  onFinish: () => void;
}

export default function SuccessPanel({ savedId, onDownloadPutniNalog, onFinish }: Props) {
  return (
    <div className={c.card}>
      <p className={c.title}>✓ Transfer poslan</p>
      <p className={c.id}>{savedId}</p>
      <button onClick={onDownloadPutniNalog} className={`btn-press ${c.downloadBtn}`}>
        ⬇ Preuzmi putni nalog
      </button>
      <button onClick={onFinish} className={`btn-press ${c.finishBtn}`}>
        Završi transfer
      </button>
    </div>
  );
}
