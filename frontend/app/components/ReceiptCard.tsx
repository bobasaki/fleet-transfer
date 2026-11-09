"use client";
import type { ReactNode } from "react";
import { CONFIDENCE_THRESHOLD } from "../../lib/constants";
import PhotoThumbnail from "./PhotoThumbnail";
import {
  getSlotItems, slotNeedsConfirm,
  type ReceiptSlot, type ExtractedItem, type AmountOverride,
} from "../../lib/receiptItems";
import { s, cx } from "./formStyles";
import c from "./ReceiptCard.module.css";
import PhotoCaptureButtons from "./PhotoCaptureButtons";

// Re-export so existing imports from this component keep working.
export { getSlotItems, slotNeedsConfirm };
export type { ReceiptSlot, ExtractedItem, AmountOverride };

interface Props {
  slot: ReceiptSlot;
  index: number;
  disabled: boolean;
  canRemove: boolean;
  onFileChange: (file: File) => void;
  // Multi-select from Galerija: first file fills this slot, the rest spawn new
  // slots. When provided, the gallery picker accepts several files at once.
  onFilesChange?: (files: File[]) => void;
  onUpdate: (patch: Partial<ReceiptSlot>) => void;
  onRemove: () => void;
  onRetry: () => void;
  onManualEntry: () => void;
}

const CATEGORIES = [
  { value: "cestarina", label: "Cestarina" },
  { value: "gorivo", label: "Gorivo" },
  { value: "ostalo", label: "Ostalo" },
];

const CAT_COLOR: Record<string, string> = {
  cestarina: "#1D4ED8",
  gorivo: "#B45309",
  ostalo: "#6B7280",
};

function confBadge(value: unknown): ReactNode {
  if (typeof value !== "number") return null;
  if (value >= CONFIDENCE_THRESHOLD) return null;
  return <span className={s.confBadge}>{Math.round(value * 100)}%</span>;
}

function fmt2(n: unknown): string {
  return typeof n === "number" ? n.toFixed(2) : "—";
}

export function effectiveCategory(slot: ReceiptSlot): string {
  const items = getSlotItems(slot);
  return items[0]?.category ?? "ostalo";
}

export default function ReceiptCard({
  slot, index, disabled, canRemove,
  onFileChange, onFilesChange, onUpdate, onRemove, onRetry, onManualEntry,
}: Props) {
  const res = slot.result;
  const needsConfirm = slotNeedsConfirm(slot);
  const items = getSlotItems(slot);
  // No FX rate for a non-EUR receipt: eur_amount is just a copy of the native
  // amount, so the driver must check/correct the EUR field by hand.
  const fxMissing = items.some(
    (it) => it.nativeCurrency !== "EUR" && it.fxRate === null,
  );
  const isMultiItem = items.length > 1;
  const firstCat = items[0]?.category ?? "ostalo";
  const topConf = (res?.confidence ?? {}) as Record<string, number>;

  // Record a raw typed amount for item i; getSlotItems parses and applies it.
  function setAmount(i: number, field: "native" | "eur", value: string) {
    const next: (AmountOverride | null)[] = items.map((_, j) => {
      const existing = slot.itemAmountOverrides?.[j] ?? null;
      if (j !== i) return existing;
      return { native: null, eur: null, ...existing, [field]: value };
    });
    onUpdate({ itemAmountOverrides: next, confirmed: false });
  }

  // dynamic: accent tracks confirmed/needsConfirm/multiItem/category state
  const accentColor = slot.confirmed
    ? "#16A34A"
    : (needsConfirm && !slot.confirmed)
      ? "#D97706"
      : isMultiItem
        ? "#6B21A8"
        : (CAT_COLOR[firstCat] ?? "#6B7280");

  const statusBadge: ReactNode = slot.confirmed
    ? <span className={cx(s.badge, s.badgeConfirmed)}>✓ Potvrđeno</span>
    : needsConfirm
      ? <span className={cx(s.badge, s.badgePending)}>⚠ Provjeri</span>
      : isMultiItem
        ? <span className={cx(s.badge, s.badgeMulti)}>{items.length} stavke</span>
        : null;

  const loadingMsg: ReactNode = slot.loading
    ? <p className={s.loadingText}>Čitam račun…</p>
    : null;

  const extractedFields: ReactNode = res && !res.error && items.length > 0
    ? (
      <div className={c.extractedWrapper}>
        {isMultiItem ? (
          // Multi-item: one row per extracted charge type
          <div>
            {/* 16px font prevents iOS Safari focus-zoom */}
            <span className={cx(s.fieldKey, c.multiSectionLabel)}>
              Kategorije
            </span>
            {items.map((item, i) => (
              <div key={i} className={c.multiItemRow}>
                <select
                  value={item.category}
                  onChange={(e) => {
                    const overrides = items.map((it, j) =>
                      j === i ? e.target.value : (slot.itemCategoryOverrides?.[j] ?? it.category)
                    );
                    onUpdate({ itemCategoryOverrides: overrides, confirmed: false });
                  }}
                  disabled={disabled}
                  className={cx(s.fieldInput, c.catSelectFixed)}
                >
                  {CATEGORIES.map((cat) => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                </select>
                {/* dynamic: color from CAT_COLOR keyed on item.category */}
                <span className={c.multiItemAmount} style={{ color: CAT_COLOR[item.category] ?? "var(--text)" }}>
                  {item.nativeCurrency !== "EUR" && (
                    <span className={c.multiItemNative}>
                      ({fmt2(item.nativeAmount)} {item.nativeCurrency})
                    </span>
                  )}
                  {/* 16px font prevents iOS Safari focus-zoom on these inputs */}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={slot.itemAmountOverrides?.[i]?.eur ?? String(item.eurAmount)}
                    onChange={(e) => setAmount(i, "eur", e.target.value)}
                    disabled={disabled}
                    className={cx(s.fieldInput, c.amountInputNarrow)}
                  />
                  <span>€</span>
                </span>
                {confBadge(item.confidence?.category)}
                {confBadge(item.confidence?.native_amount)}
              </div>
            ))}
          </div>
        ) : (
          // Single-item: existing category dropdown
          <div className={s.fieldRow}>
            <span className={s.fieldKey}>Kategorija{confBadge(items[0].confidence?.category)}</span>
            <select
              value={items[0].category}
              onChange={(e) => onUpdate({ categoryOverride: e.target.value, confirmed: false })}
              disabled={disabled}
              className={s.fieldInput}
            >
              {CATEGORIES.map((cat) => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
            </select>
          </div>
        )}

        <div className={s.fieldRow}>
          <span className={s.fieldKey}>Datum{confBadge(topConf.receipt_date)}</span>
          <input
            type="date"
            value={slot.receiptDateOverride ?? (res.receipt_date as string) ?? ""}
            onChange={(e) => onUpdate({ receiptDateOverride: e.target.value, confirmed: false })}
            disabled={disabled}
            className={s.fieldInput}
          />
        </div>

        <div className={s.fieldRow}>
          <span className={s.fieldKey}>Prodavač</span>
          <input
            type="text"
            value={slot.vendorOverride ?? (res.vendor as string) ?? ""}
            onChange={(e) => onUpdate({ vendorOverride: e.target.value, confirmed: false })}
            disabled={disabled}
            className={s.fieldInput}
          />
        </div>

        <div className={s.amountSection}>
          {isMultiItem ? (
            // Multi-item: show per-item EUR amounts and a total
            <>
              {items.map((item, i) => (
                <span key={i} className={c.amountSpan}>
                  {/* dynamic: color from CAT_COLOR keyed on item.category */}
                  <span className={c.catTag} style={{ color: CAT_COLOR[item.category] ?? "var(--text-muted)" }}>
                    {item.category}
                  </span>
                  <strong>{fmt2(item.eurAmount)} €</strong>
                </span>
              ))}
              <span className={c.amountTotal}>
                <span className={c.amountTotalLabel}>Ukupno</span>
                <strong>{fmt2(items.reduce((sum, it) => sum + it.eurAmount, 0))} €</strong>
              </span>
            </>
          ) : (
            // Single-item: editable amounts (native always; EUR only when non-EUR currency)
            <>
              <span className={c.amountSpanFlex}>
                <span className={c.amountLabel}>
                  Iznos{confBadge(items[0].confidence?.native_amount)}
                  {items[0].nativeCurrency === "EUR" && confBadge(topConf.native_currency)}
                </span>
                {/* 16px font prevents iOS Safari focus-zoom */}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={slot.itemAmountOverrides?.[0]?.native ?? String(items[0].nativeAmount)}
                  onChange={(e) => setAmount(0, "native", e.target.value)}
                  disabled={disabled}
                  className={cx(s.fieldInput, c.amountInputWide)}
                />
                <span className={c.amountLabel}>{items[0].nativeCurrency}</span>
              </span>
              {items[0].nativeCurrency !== "EUR" && (
                <span className={c.amountSpanFlex}>
                  <span className={c.amountLabel}>EUR</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={slot.itemAmountOverrides?.[0]?.eur ?? String(items[0].eurAmount)}
                    onChange={(e) => setAmount(0, "eur", e.target.value)}
                    disabled={disabled}
                    className={cx(s.fieldInput, c.amountInputWide)}
                  />
                  {typeof items[0].fxRate === "number" && (
                    <span className={c.fxRateNote}>
                      ({items[0].fxRate} × {items[0].fxRateDate})
                    </span>
                  )}
                </span>
              )}
            </>
          )}
        </div>

        {fxMissing && <p className={s.fxWarn}>⚠ Tečaj nedostupan — provjeri EUR iznos.</p>}
      </div>
    )
    : null;

  const errorMsg: ReactNode = res?.error
    ? (
      <div className={s.errorSection}>
        <p className={s.errorTitle}>
          Ne mogu pročitati račun — pokušaj ponovno ili unesi ručno.
        </p>
        {typeof res.detail === "string" && res.detail !== "" && (
          <p className={s.errorDetail}>{res.detail}</p>
        )}
        {!!slot.file && !disabled && (
          <div className={s.errorActions}>
            <button onClick={onRetry} className={cx("btn-press", s.errorActionBtn)}>
              Pokušaj ponovno
            </button>
            <button onClick={onManualEntry} className={cx("btn-press", s.errorActionBtn)}>
              Unesi ručno
            </button>
          </div>
        )}
      </div>
    )
    : null;

  const confirmBtn: ReactNode = needsConfirm && !slot.confirmed && !disabled
    ? (
      <button
        onClick={() => onUpdate({ confirmed: true })}
        className={cx("btn-press", s.confirmBtn)}
      >
        ✓ Potvrdi označene vrijednosti
      </button>
    )
    : null;

  return (
    // dynamic: borderLeft accent tracks slot state (confirmed/needsConfirm/multiItem/category)
    <div className={cx("animate-up", s.itemCard)} style={{ borderLeft: `3px solid ${accentColor}` }}>
      <div className={s.itemCardHeader}>
        <span className={c.cardLabel}>Račun {index + 1}</span>
        {statusBadge}
        {canRemove && (
          <button
            onClick={onRemove}
            disabled={disabled}
            className={cx("btn-press", s.ukloniBtn)}
          >
            Ukloni
          </button>
        )}
      </div>

      <PhotoCaptureButtons
        variant="card"
        hasFile={!!slot.file}
        disabled={disabled}
        onFile={(f) => onFileChange(f)}
        multiple={!!onFilesChange}
        onFiles={onFilesChange ? (files) => onFilesChange(files) : undefined}
      />
      <PhotoThumbnail file={slot.file} />

      {loadingMsg}
      {extractedFields}
      {errorMsg}
      {confirmBtn}
    </div>
  );
}
