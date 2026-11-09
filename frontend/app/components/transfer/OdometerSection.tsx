"use client";
import { hasLowConf, type PhotoState } from "../../../lib/api";
import { fmtPhotoTime } from "../../../lib/format";
import PhotoThumbnail from "../PhotoThumbnail";
import PhotoCaptureButtons from "../PhotoCaptureButtons";
import { s, cx } from "../formStyles";
import c from "./OdometerSection.module.css";

// One odometer photo block (photo-time caption + km field + confirm) —
// rendered twice on the transfer page (početak / kraj). Presentational only;
// all state stays in page.tsx.
// (plan11 phase 2 step 6 — JSX moved verbatim out of app/transfer/page.tsx.)

interface Props {
  title: string;
  kmLabel: string;
  photo: PhotoState;
  kmValue: string;
  confirmed: boolean;
  saved: boolean;
  takenAt: string | null;
  timeSource: "exif" | "now" | null;
  onFile: (file: File) => void;
  onKmChange: (value: string) => void;
  onConfirm: () => void;
}

export default function OdometerSection({
  title, kmLabel, photo, kmValue, confirmed, saved, takenAt, timeSource,
  onFile, onKmChange, onConfirm,
}: Props) {
  const res = photo.result;
  return (
    <>
      <span className={s.sectionLabel}>{title}</span>
      <PhotoCaptureButtons
        hasFile={!!photo.file}
        disabled={photo.loading || saved}
        onFile={(f) => onFile(f)}
      />
      <PhotoThumbnail file={photo.file} />
      {takenAt && photo.file && (
        <p className={c.photoCaption}>
          {timeSource === "exif"
            ? `Foto snimljena u ${fmtPhotoTime(takenAt)}`
            : `Vrijeme odabira: ${fmtPhotoTime(takenAt)} (EXIF nedostupan)`}
        </p>
      )}
      {photo.loading && <p className={s.loadingText}>Čitam kilometražu…</p>}
      {res && (
        <>
          <span className={s.fieldLabel}>
            {kmLabel}
            {!res.error && hasLowConf(res) && <span className={s.warnTag}>⚠ Provjeri</span>}
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={kmValue}
            min={0}
            step={1}
            onChange={(e) => onKmChange(e.target.value)}
            disabled={saved}
            className={cx(s.txtInput, c.kmInput)}
          />
          {!res.error && hasLowConf(res) && !confirmed && !saved && (
            <button onClick={onConfirm} className={s.reviewBtn}>
              ✓ Potvrdi označenu vrijednost
            </button>
          )}
        </>
      )}
    </>
  );
}
