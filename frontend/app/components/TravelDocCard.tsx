"use client";
import { CONFIDENCE_THRESHOLD } from "../../lib/constants";
import PhotoThumbnail from "./PhotoThumbnail";
import { s, cx } from "./formStyles";
import c from "./TravelDocCard.module.css";
import l from "./layout.module.css";

export type TravelDocSlot = {
  id: string;
  docType: "avionska_karta" | "autobusna_karta" | "blablacar" | "smjestaj";
  file: File | null;
  loading: boolean;
  result: Record<string, unknown> | null;
  eurAmountOverride: string | null;
  travelDateOverride: string | null;
  vendorOverride: string | null;
  confirmed: boolean;
  transportFrom: string;
  transportTo: string;
};

interface Props {
  slot: TravelDocSlot;
  disabled: boolean;
  onFileChange: (file: File) => void;
  onUpdate: (patch: Partial<TravelDocSlot>) => void;
  onRemove: () => void;
  onRetry: () => void;
  onManualEntry: () => void;
}

export function travelDocNeedsConfirm(slot: TravelDocSlot): boolean {
  if (!slot.result || slot.result.error) return false;
  const conf = slot.result.confidence as Record<string, number> | null;
  if (!conf || typeof conf !== "object") return false;
  return Object.values(conf).some((v) => typeof v === "number" && v < CONFIDENCE_THRESHOLD);
}

export function travelDocEurAmount(slot: TravelDocSlot): number {
  if (slot.eurAmountOverride !== null) {
    const v = parseFloat(slot.eurAmountOverride);
    return isNaN(v) ? 0 : v;
  }
  if (!slot.result || slot.result.error) return 0;
  return typeof slot.result.eur_amount === "number" ? slot.result.eur_amount : 0;
}

const DOC_TYPE_COLOR: Record<string, string> = {
  avionska_karta: "#0369A1",
  autobusna_karta: "#059669",
  blablacar: "#00A599",
  smjestaj: "#7C3AED",
};

function fmt2(n: unknown): string {
  return typeof n === "number" ? n.toFixed(2) : "—";
}

function confBadge(value: unknown) {
  if (typeof value !== "number") return null;
  if (value >= CONFIDENCE_THRESHOLD) return null;
  return <span className={s.confBadge}>{Math.round(value * 100)}%</span>;
}

export default function TravelDocCard({
  slot, disabled, onFileChange, onUpdate, onRemove, onRetry, onManualEntry,
}: Props) {
  const res = slot.result;
  const needsConfirm = travelDocNeedsConfirm(slot);
  // dynamic: accent tracks confirmed/needsConfirm/docType state
  const accentColor = slot.confirmed
    ? "#16A34A"
    : needsConfirm
      ? "#D97706"
      : DOC_TYPE_COLOR[slot.docType] ?? "var(--text-muted)";

  const conf = (res && !res.error ? res.confidence : {}) as Record<string, number>;
  const details = (res && !res.error ? res.travel_details : {}) as Record<string, unknown>;

  return (
    // dynamic: borderLeft accent tracks slot state (confirmed/needsConfirm/docType)
    <div className={cx("animate-up", s.itemCard)} style={{ borderLeft: `3px solid ${accentColor}` }}>
      {/* Header row */}
      <div className={s.itemCardHeader}>
        {slot.confirmed ? (
          <span className={cx(s.badge, s.badgeConfirmed)}>✓ Potvrđeno</span>
        ) : needsConfirm ? (
          <span className={cx(s.badge, s.badgePending)}>⚠ Provjeri</span>
        ) : null}
        <button
          onClick={onRemove}
          disabled={disabled}
          className={cx("btn-press", s.ukloniBtn)}
        >
          Ukloni
        </button>
      </div>

      {/* From / to — transport types only */}
      {slot.docType !== "smjestaj" && (
        <div className={c.fromToRow}>
          <div className={c.fromToCol}>
            <span className={s.fieldKey}>Odkud</span>
            <input
              type="text"
              value={slot.transportFrom}
              onChange={(e) => onUpdate({ transportFrom: e.target.value })}
              disabled={disabled}
              placeholder="npr. Zagreb"
              className={cx(s.fieldInput, c.fromToInput)}
            />
          </div>
          <div className={c.fromToCol}>
            <span className={s.fieldKey}>Kamo</span>
            <input
              type="text"
              value={slot.transportTo}
              onChange={(e) => onUpdate({ transportTo: e.target.value })}
              disabled={disabled}
              placeholder="npr. Split"
              className={cx(s.fieldInput, c.fromToInput)}
            />
          </div>
        </div>
      )}

      {/* Upload — gallery only, no capture="environment" */}
      <label className={cx("btn-press", c.uploadLabelWrap)}>
        <div className={cx(c.uploadBtn, slot.file && c.uploadBtnHasFile)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={l.iconShrink}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> {slot.file ? "Zamijeni dokument" : "Dodaj dokument"}
        </div>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileChange(f); }}
          disabled={disabled}
          className={c.hiddenInput}
        />
      </label>
      <PhotoThumbnail file={slot.file} />

      {slot.loading && (
        <p className={s.loadingText}>Čitam dokument…</p>
      )}

      {res && !res.error && (
        <div className={c.extractedWrapper}>
          {/* Route / stay summary */}
          {slot.docType !== "smjestaj" && !!(details.route_from || details.route_to) && (
            <p className={c.routeSummary}>
              {String(details.route_from ?? "?")} → {String(details.route_to ?? "?")}
              {!!details.flight_number && (
                <span className={c.routeSummaryNote}>{String(details.flight_number)}</span>
              )}
            </p>
          )}
          {slot.docType === "smjestaj" && !!(details.checkin_date || details.checkout_date) && (
            <p className={c.routeSummary}>
              {String(details.checkin_date ?? "?")} → {String(details.checkout_date ?? "?")}
              {details.nights != null && (
                <span className={c.routeSummaryNote}>
                  {String(details.nights)} noć{Number(details.nights) === 1 ? "" : "i"}
                </span>
              )}
            </p>
          )}

          {/* Date */}
          <div className={s.fieldRow}>
            <span className={s.fieldKey}>
              {slot.docType === "smjestaj" ? "Check-in" : "Datum"}
              {confBadge(conf.receipt_date)}
            </span>
            <input
              type="date"
              value={slot.travelDateOverride ?? (res.receipt_date as string) ?? ""}
              onChange={(e) => onUpdate({ travelDateOverride: e.target.value, confirmed: false })}
              disabled={disabled}
              className={s.fieldInput}
            />
          </div>

          {/* Vendor */}
          <div className={s.fieldRow}>
            <span className={s.fieldKey}>
              {slot.docType === "avionska_karta" ? "Aviokompanija" : slot.docType === "smjestaj" ? "Hotel" : slot.docType === "blablacar" ? "Platforma" : "Prijevoznik"}
            </span>
            <input
              type="text"
              value={slot.vendorOverride ?? (res.vendor as string) ?? ""}
              onChange={(e) => onUpdate({ vendorOverride: e.target.value, confirmed: false })}
              disabled={disabled}
              className={s.fieldInput}
            />
          </div>

          {/* Amount */}
          <div className={c.amountRow}>
            {(res.native_currency as string) !== "EUR" && (
              <span className={c.nativeSpan}>
                <span className={c.nativeLabel}>Iznos</span>
                <strong>{fmt2(res.native_amount)} {res.native_currency as string}</strong>
              </span>
            )}
            <span className={c.eurSpan}>
              <span className={c.eurLabel}>EUR{confBadge(conf.native_amount)}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={slot.eurAmountOverride ?? (res.eur_amount !== undefined ? String(res.eur_amount) : "")}
                onChange={(e) => onUpdate({ eurAmountOverride: e.target.value, confirmed: false })}
                disabled={disabled}
                className={cx(s.fieldInput, c.eurInput)}
              />
            </span>
          </div>

          {/* No FX rate for a non-EUR document: eur_amount is just a copy of
              the native amount, so the driver must check the EUR field. */}
          {(res.native_currency as string) !== "EUR" && typeof res.fx_rate !== "number" && (
            <p className={s.fxWarn}>⚠ Tečaj nedostupan — provjeri EUR iznos.</p>
          )}
        </div>
      )}

      {!!res?.error && (
        <div className={s.errorSection}>
          <p className={s.errorTitle}>
            Ne mogu pročitati dokument — pokušaj ponovno ili unesi ručno.
          </p>
          {typeof res!.detail === "string" && res!.detail !== "" && (
            <p className={s.errorDetail}>{res!.detail as string}</p>
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
      )}

      {needsConfirm && !slot.confirmed && !disabled && (
        <button
          onClick={() => onUpdate({ confirmed: true })}
          className={cx("btn-press", s.confirmBtn)}
        >
          ✓ Potvrdi označene vrijednosti
        </button>
      )}
    </div>
  );
}
