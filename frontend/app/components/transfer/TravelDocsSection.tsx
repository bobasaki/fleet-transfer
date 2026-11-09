"use client";
import TravelDocCard, { type TravelDocSlot } from "../TravelDocCard";
import { s, cx } from "../formStyles";
import l from "../layout.module.css";
import c from "./TravelDocsSection.module.css";

// "Putne isprave" card — avionska karta, autobusna karta, BlaBlaCar and
// smještaj slots. Presentational only; slot state stays in page.tsx.
// (plan11 phase 2 step 7 — JSX moved verbatim out of app/transfer/page.tsx.)

interface Props {
  travelDocs: TravelDocSlot[];
  isBusy: boolean;
  saved: boolean;
  onAdd: (docType: TravelDocSlot["docType"]) => void;
  onFile: (id: string, file: File, docType: TravelDocSlot["docType"]) => void;
  onUpdate: (id: string, patch: Partial<TravelDocSlot>) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onManualEntry: (id: string) => void;
}

export default function TravelDocsSection({
  travelDocs, isBusy, saved,
  onAdd, onFile, onUpdate, onRemove, onRetry, onManualEntry,
}: Props) {
  return (
    <div className={s.card}>
      <div className={s.redBar} />
      <div className={s.cardBody}>
        <span className={s.sectionLabel}>Putne isprave</span>

        {/* Avionska karta */}
        <div className={c.docSection}>
          <div className={c.docHeader}>
            <span className={cx(c.docLabel, c.docLabelAir)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={l.iconInline}><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Avionska karta
            </span>
            <button onClick={() => onAdd("avionska_karta")} disabled={isBusy || saved} className={s.ghostBtn}>
              + Dodaj
            </button>
          </div>
          {travelDocs.filter((t) => t.docType === "avionska_karta").map((t) => (
            <TravelDocCard
              key={t.id}
              slot={t}
              disabled={t.loading || saved}
              onFileChange={(file) => onFile(t.id, file, "avionska_karta")}
              onUpdate={(patch) => onUpdate(t.id, patch)}
              onRemove={() => onRemove(t.id)}
              onRetry={() => onRetry(t.id)}
              onManualEntry={() => onManualEntry(t.id)}
            />
          ))}
          {travelDocs.filter((t) => t.docType === "avionska_karta").length === 0 && (
            <p className={c.emptyMsg}>Nije dodano</p>
          )}
        </div>

        <hr className={c.divider} />

        {/* Autobusna karta */}
        <div className={c.docSection}>
          <div className={c.docHeader}>
            <span className={cx(c.docLabel, c.docLabelBus)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={l.iconInline}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="11" x2="22" y2="11"/><circle cx="7" cy="19" r="1"/><circle cx="17" cy="19" r="1"/></svg>Autobusna karta
            </span>
            <button onClick={() => onAdd("autobusna_karta")} disabled={isBusy || saved} className={s.ghostBtn}>
              + Dodaj
            </button>
          </div>
          {travelDocs.filter((t) => t.docType === "autobusna_karta").map((t) => (
            <TravelDocCard
              key={t.id}
              slot={t}
              disabled={t.loading || saved}
              onFileChange={(file) => onFile(t.id, file, "autobusna_karta")}
              onUpdate={(patch) => onUpdate(t.id, patch)}
              onRemove={() => onRemove(t.id)}
              onRetry={() => onRetry(t.id)}
              onManualEntry={() => onManualEntry(t.id)}
            />
          ))}
          {travelDocs.filter((t) => t.docType === "autobusna_karta").length === 0 && (
            <p className={c.emptyMsg}>Nije dodano</p>
          )}
        </div>

        <hr className={c.divider} />

        {/* BlaBlaCar */}
        <div className={c.docSection}>
          <div className={c.docHeader}>
            <span className={cx(c.docLabel, c.docLabelRide)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={l.iconInline}><path d="M6 17H3a1 1 0 0 1-1-1V8l2.5-4h13l2.5 4v8a1 1 0 0 1-1 1h-3"/><circle cx="8.5" cy="17" r="2.5"/><circle cx="15.5" cy="17" r="2.5"/></svg>BlaBlaCar
            </span>
            <button onClick={() => onAdd("blablacar")} disabled={isBusy || saved} className={s.ghostBtn}>
              + Dodaj
            </button>
          </div>
          {travelDocs.filter((t) => t.docType === "blablacar").map((t) => (
            <TravelDocCard
              key={t.id}
              slot={t}
              disabled={t.loading || saved}
              onFileChange={(file) => onFile(t.id, file, "blablacar")}
              onUpdate={(patch) => onUpdate(t.id, patch)}
              onRemove={() => onRemove(t.id)}
              onRetry={() => onRetry(t.id)}
              onManualEntry={() => onManualEntry(t.id)}
            />
          ))}
          {travelDocs.filter((t) => t.docType === "blablacar").length === 0 && (
            <p className={c.emptyMsg}>Nije dodano</p>
          )}
        </div>

        <hr className={c.divider} />

        {/* Smještaj */}
        <div>
          <div className={c.docHeader}>
            <span className={cx(c.docLabel, c.docLabelAccom)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={l.iconInline}><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="4" y1="12" x2="20" y2="12"/><rect x="9" y="12" width="6" height="10"/></svg>Smještaj
            </span>
            <button onClick={() => onAdd("smjestaj")} disabled={isBusy || saved} className={s.ghostBtn}>
              + Dodaj
            </button>
          </div>
          {travelDocs.filter((t) => t.docType === "smjestaj").map((t) => (
            <TravelDocCard
              key={t.id}
              slot={t}
              disabled={t.loading || saved}
              onFileChange={(file) => onFile(t.id, file, "smjestaj")}
              onUpdate={(patch) => onUpdate(t.id, patch)}
              onRemove={() => onRemove(t.id)}
              onRetry={() => onRetry(t.id)}
              onManualEntry={() => onManualEntry(t.id)}
            />
          ))}
          {travelDocs.filter((t) => t.docType === "smjestaj").length === 0 && (
            <p className={c.emptyMsg}>Nije dodano</p>
          )}
        </div>
      </div>
    </div>
  );
}
