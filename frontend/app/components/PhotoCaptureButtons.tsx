"use client";
import type { ChangeEvent, CSSProperties } from "react";
import { s, cx } from "./formStyles";
import c from "./PhotoCaptureButtons.module.css";
import l from "./layout.module.css";

// HARD CONSTRAINT (CLAUDE.md): every photo slot renders TWO separate
// <input type="file"> elements — Kamera with capture="environment" and
// Galerija without. Never collapse them into one input; never getUserMedia.
// (plan11 phase 2 step 3 — extracted from app/transfer/page.tsx and
// ReceiptCard.tsx without changing the rendered DOM of either.)

export type PhotoSource = "kamera" | "galerija";

interface Props {
  onFile: (file: File, source: PhotoSource) => void;
  disabled: boolean;
  hasFile: boolean;
  // "form" = transfer-page sizing; "card" = ReceiptCard sizing (smaller
  // buttons, btn-press labels) — visual variants of the same structure.
  variant?: "form" | "card";
  // Merged onto the button face (e.g. rotacijsko's extra top margin).
  buttonStyle?: CSSProperties;
  // Galerija-only multi-select. When set, the gallery input accepts several
  // files at once and emits them via onFiles; Kamera always stays single-shot
  // (one live capture). Receipts opt in so a driver can pick many at once.
  multiple?: boolean;
  onFiles?: (files: File[], source: PhotoSource) => void;
}

export default function PhotoCaptureButtons({
  onFile, disabled, hasFile, variant = "form", buttonStyle,
  multiple = false, onFiles,
}: Props) {
  const pick = (source: PhotoSource) => (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (source === "galerija" && multiple && onFiles) {
      onFiles(Array.from(files), source);
    } else {
      onFile(files[0], source);
    }
  };

  // "form" variant: CSS module classes + optional inline override for rotacijsko marginTop.
  // "card" variant: card-compact classes from PhotoCaptureButtons.module.css.
  const faceClass = variant === "form"
    ? cx(s.photoCapture, hasFile && s.hasFile)
    : cx(c.photoBtnCard, hasFile && c.photoBtnCardHasFile);
  const faceStyle = variant === "form" ? buttonStyle : undefined;

  const iconSize = variant === "form" ? "15" : "14";
  const labelClass = variant === "card" ? "btn-press" : undefined;

  return (
    <div className={c.buttonRow}>
      <label className={cx(c.labelFlex, labelClass)}>
        <div className={faceClass} style={faceStyle}><svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={l.iconShrink}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg> Kamera</div>
        <input type="file" accept="image/*" capture="environment" onChange={pick("kamera")} disabled={disabled} className={c.hiddenInput} />
      </label>
      <label className={cx(c.labelFlex, labelClass)}>
        <div className={faceClass} style={faceStyle}><svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={l.iconShrink}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Galerija</div>
        <input type="file" accept="image/*" multiple={multiple} onChange={pick("galerija")} disabled={disabled} className={c.hiddenInput} />
      </label>
    </div>
  );
}
