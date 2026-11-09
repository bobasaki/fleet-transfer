"use client";
import c from "./TransferBanners.module.css";

// Offline banner + restored-draft notice. Presentational only.
// (plan11 phase 2 step 7 — JSX moved verbatim out of app/transfer/page.tsx.)

interface Props {
  isOnline: boolean;
  draftRestored: boolean;
  saved: boolean;
  isBusy: boolean;
  onClearDraft: () => void;
}

export default function TransferBanners({
  isOnline, draftRestored, saved, isBusy, onClearDraft,
}: Props) {
  return (
    <>
      {/* === Offline banner === */}
      {!isOnline && (
        <div className={c.offlineBanner}>
          Nema interneta — slanje nije moguće
        </div>
      )}

      {/* === Draft notice === */}
      {draftRestored && !saved && (
        <div className={c.draftBanner}>
          <span>Nastavljaš gdje si stao/la.</span>
          <button
            onClick={onClearDraft}
            disabled={isBusy}
            className={`btn-press ${c.clearDraftBtn}`}
          >
            Izbriši nacrt
          </button>
        </div>
      )}
    </>
  );
}
