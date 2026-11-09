"use client";
import type { CSSProperties } from "react";
import { hasLowConf, type PhotoState } from "../../../lib/api";
import PhotoThumbnail from "../PhotoThumbnail";
import PhotoCaptureButtons from "../PhotoCaptureButtons";
import { s } from "../formStyles";

// One vehicle photo block (plate + model + confirm) — rendered twice on the
// transfer page: HR plate inside the shared card, rotacijsko inside its own
// card. Presentational only; all state stays in page.tsx.
// (plan11 phase 2 step 6 — JSX moved verbatim out of app/transfer/page.tsx.)

interface Props {
  photo: PhotoState;
  plateValue: string;
  modelValue: string;
  confirmed: boolean;
  saved: boolean;
  plateLabel: string;
  modelLabel: string;
  // Merged onto the capture buttons (rotacijsko's extra top margin).
  buttonStyle?: CSSProperties;
  onFile: (file: File) => void;
  onPlateChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onConfirm: () => void;
}

export default function VehicleSection({
  photo, plateValue, modelValue, confirmed, saved,
  plateLabel, modelLabel, buttonStyle,
  onFile, onPlateChange, onModelChange, onConfirm,
}: Props) {
  const res = photo.result;
  return (
    <>
      <PhotoCaptureButtons
        hasFile={!!photo.file}
        disabled={photo.loading || saved}
        buttonStyle={buttonStyle}
        onFile={(f) => onFile(f)}
      />
      <PhotoThumbnail file={photo.file} />
      {photo.loading && <p className={s.loadingText}>Čitam tablicu i model vozila…</p>}
      {res && (
        <>
          <span className={s.fieldLabel}>
            {plateLabel}
            {!res.error && hasLowConf(res) && <span className={s.warnTag}>⚠ Provjeri</span>}
          </span>
          <input
            type="text"
            value={plateValue}
            onChange={(e) => onPlateChange(e.target.value)}
            disabled={saved}
            className={s.txtInput}
          />
          {!res.error && (
            <>
              <span className={s.fieldLabel}>{modelLabel}</span>
              <input
                type="text"
                value={modelValue}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={saved}
                placeholder="npr. Crossland, Corsa…"
                className={s.txtInput}
              />
            </>
          )}
          {!res.error && hasLowConf(res) && !confirmed && !saved && (
            <button onClick={onConfirm} className={s.reviewBtn}>
              ✓ Potvrdi označene vrijednosti
            </button>
          )}
        </>
      )}
    </>
  );
}
