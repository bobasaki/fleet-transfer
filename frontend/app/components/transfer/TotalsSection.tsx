"use client";
import { fmt2 } from "../../../lib/format";
import c from "./TotalsSection.module.css";

// "Ukupno (EUR)" totals card. Presentational only; totals are derived in
// page.tsx. (plan11 phase 2 step 7 — JSX moved verbatim out of
// app/transfer/page.tsx.)

interface Props {
  totals: { cestarina: number; gorivo: number; ostalo: number };
  travelTotals: { avionska: number; autobusna: number; blablacar: number; smjestaj: number };
  dnevnicaLocation: string;
  dnevnicaAmount: number | null;
}

export default function TotalsSection({
  totals, travelTotals, dnevnicaLocation, dnevnicaAmount,
}: Props) {
  return (
    <div className={c.card}>
      <span className={c.title}>Ukupno (EUR)</span>
      <div className={c.grid}>
        {[
          { label: "Cestarina", value: totals.cestarina },
          { label: "Gorivo", value: totals.gorivo },
          { label: "Ostalo", value: totals.ostalo },
        ].map(({ label, value }) => (
          <div key={label} className={c.row}>
            <span className={c.rowLabel}>{label}</span>
            <span className={c.rowValue}>{fmt2(value)} €</span>
          </div>
        ))}
        {travelTotals.avionska > 0 && (
          <div className={c.row}>
            <span className={c.rowLabel}>Avionska karta</span>
            <span className={c.rowValue}>{fmt2(travelTotals.avionska)} €</span>
          </div>
        )}
        {travelTotals.autobusna > 0 && (
          <div className={c.row}>
            <span className={c.rowLabel}>Autobusna karta</span>
            <span className={c.rowValue}>{fmt2(travelTotals.autobusna)} €</span>
          </div>
        )}
        {travelTotals.blablacar > 0 && (
          <div className={c.row}>
            <span className={c.rowLabel}>BlaBlaCar</span>
            <span className={c.rowValue}>{fmt2(travelTotals.blablacar)} €</span>
          </div>
        )}
        {travelTotals.smjestaj > 0 && (
          <div className={c.row}>
            <span className={c.rowLabel}>Smještaj</span>
            <span className={c.rowValue}>{fmt2(travelTotals.smjestaj)} €</span>
          </div>
        )}
        {dnevnicaLocation && (
          <div className={c.row}>
            <span className={c.rowLabel}>Dnevnica</span>
            <span className={c.rowValue}>
              {dnevnicaAmount !== null ? `${dnevnicaAmount} €` : "—"}
            </span>
          </div>
        )}
      </div>
      <div className={c.totalRow}>
        <span className={c.totalLabel}>Ukupno računi</span>
        <span className={c.totalValue}>
          {fmt2(totals.cestarina + totals.gorivo + totals.ostalo + travelTotals.avionska + travelTotals.autobusna + travelTotals.blablacar + travelTotals.smjestaj)} €
        </span>
      </div>
    </div>
  );
}
