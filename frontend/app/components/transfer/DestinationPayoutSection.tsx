"use client";
import {
  PETROL_CARD, VISA_CARD, ENC_DEVICE, PAYOUT_METHOD, DNEVNICA,
} from "../../../lib/constants";
import { s, cx } from "../formStyles";
import c from "./DestinationPayoutSection.module.css";

// "Destinacija i isplata" + "Oprema" cards. Presentational only; all state
// stays in page.tsx. petrol_card / visa_card remain MANUAL dropdowns
// (CLAUDE.md hard constraint) — never AI-extracted.
// (plan11 phase 2 step 6 — JSX moved verbatim out of app/transfer/page.tsx.)

type RouteDirection = "" | "povrat" | "odvoz";

interface Props {
  dnevnicaLocation: string;
  dnevnicaAmount: number | null;
  routeDirection: RouteDirection;
  routeFrom: string;
  routeTo: string;
  payoutMethod: string;
  encDevice: string;
  petrolCard: string;
  visaCard: string;
  hasGorivo: boolean;
  saved: boolean;
  onDnevnicaLocationChange: (value: string) => void;
  onRouteDirectionChange: (value: "povrat" | "odvoz") => void;
  onPayoutMethodChange: (value: string) => void;
  onEncDeviceChange: (value: string) => void;
  onPetrolCardChange: (value: string) => void;
  onVisaCardChange: (value: string) => void;
}

export default function DestinationPayoutSection({
  dnevnicaLocation, dnevnicaAmount, routeDirection, routeFrom, routeTo,
  payoutMethod, encDevice, petrolCard, visaCard, hasGorivo, saved,
  onDnevnicaLocationChange, onRouteDirectionChange, onPayoutMethodChange,
  onEncDeviceChange, onPetrolCardChange, onVisaCardChange,
}: Props) {
  return (
    <>
      {/* === Destinacija i isplata === */}
      <div className={s.card}>
        <div className={s.redBar} />
        <div className={s.cardBody}>
          <span className={s.sectionLabel}>Destinacija i isplata</span>

          <span className={s.fieldLabel}>Destinacija / dnevnica</span>
          <select
            value={dnevnicaLocation}
            onChange={(e) => onDnevnicaLocationChange(e.target.value)}
            disabled={saved}
            className={s.selectStyle}
          >
            <option value="">— odaberi —</option>
            {Object.keys(DNEVNICA).map((loc) => (
              <option key={loc} value={loc}>
                {loc}{DNEVNICA[loc] > 0 ? ` — ${DNEVNICA[loc]} €` : " — 0 €"}
              </option>
            ))}
          </select>

          {dnevnicaLocation && (
            <p className={c.dnevnicaInfo}>
              Dnevnica:{" "}
              <strong className={c.dnevnicaAmount}>{dnevnicaAmount !== null ? `${dnevnicaAmount} €` : "—"}</strong>
            </p>
          )}

          {dnevnicaLocation && (
            <>
              <span className={s.fieldLabel}>Smjer transfera</span>
              <div className={c.directionRow}>
                <button
                  type="button"
                  disabled={saved}
                  onClick={() => onRouteDirectionChange("povrat")}
                  className={cx(s.directionBtn, routeDirection === "povrat" && s.isActive)}
                >
                  Povrat u Zagreb
                </button>
                <button
                  type="button"
                  disabled={saved}
                  onClick={() => onRouteDirectionChange("odvoz")}
                  className={cx(s.directionBtn, routeDirection === "odvoz" && s.isActive)}
                >
                  Odvoz iz Zagreba
                </button>
              </div>

              {routeDirection && (
                <div className={c.routeRow}>
                  <div className={s.routeReadout}>
                    <span className={s.routeReadoutLabel}>Preuzimanje</span>
                    <span className={s.routeReadoutValue}>{routeFrom}</span>
                  </div>
                  <div className={c.routeSeparator}>→</div>
                  <div className={s.routeReadout}>
                    <span className={s.routeReadoutLabel}>Predaja</span>
                    <span className={s.routeReadoutValue}>{routeTo}</span>
                  </div>
                </div>
              )}
            </>
          )}

          <span className={s.fieldLabel}>Način isplate</span>
          <select
            value={payoutMethod}
            onChange={(e) => onPayoutMethodChange(e.target.value)}
            disabled={saved}
            className={s.selectStyle}
          >
            <option value="">— odaberi —</option>
            {PAYOUT_METHOD.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* === Oprema === */}
      <div className={s.card}>
        <div className={s.redBar} />
        <div className={s.cardBody}>
          <span className={s.sectionLabel}>Oprema</span>

          <span className={s.fieldLabel}>ENC uređaj</span>
          <select
            value={encDevice}
            onChange={(e) => onEncDeviceChange(e.target.value)}
            disabled={saved}
            className={s.selectStyle}
          >
            <option value="">— odaberi —</option>
            {ENC_DEVICE.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <span className={s.fieldLabel}>
            Petrol kartica
            {hasGorivo && petrolCard === "Nisam koristio/la" && (
              <span className={s.warnTag}> ⚠ Imaš račun za gorivo</span>
            )}
          </span>
          {/* border-color override: warns amber when gorivo + "Nisam" selected; otherwise keeps var(--border) */}
          <select
            value={petrolCard}
            onChange={(e) => onPetrolCardChange(e.target.value)}
            disabled={saved}
            className={s.selectStyle}
            style={{ borderColor: hasGorivo && petrolCard === "Nisam koristio/la" ? "#F59E0B" : "var(--border)" /* dynamic: amber warn when gorivo + Nisam */ }}
          >
            {PETROL_CARD.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <span className={s.fieldLabel}>Visa kartica</span>
          <select
            value={visaCard}
            onChange={(e) => onVisaCardChange(e.target.value)}
            disabled={saved}
            className={s.selectStyle}
          >
            {VISA_CARD.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}
