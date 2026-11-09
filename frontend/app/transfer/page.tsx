"use client";
import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import {
  V1_DRIVER, CONFIDENCE_THRESHOLD, MAX_RECEIPTS, DNEVNICA,
} from "../../lib/constants";
import ReceiptCard, {
  ReceiptSlot, slotNeedsConfirm, getSlotItems,
} from "../components/ReceiptCard";
import {
  TravelDocSlot, travelDocNeedsConfirm, travelDocEurAmount,
} from "../components/TravelDocCard";
import { deletePhoto, clearAllPhotos } from "../../lib/photoStore";
import {
  validateSubmitPayload, softWarnings, confIsLow,
} from "../../lib/submitValidation";
import {
  buildSubmitPayload, validReceiptSlots, validTravelDocSlots,
} from "../../lib/buildSubmitPayload";
import { toCroatian } from "../../lib/errorMessages";
import { generatePutniNalog, type PutniNalogInput } from "../../lib/generatePutniNalog";
import VehicleSection from "../components/transfer/VehicleSection";
import OdometerSection from "../components/transfer/OdometerSection";
import DestinationPayoutSection from "../components/transfer/DestinationPayoutSection";
import TransferChrome from "../components/transfer/TransferChrome";
import TransferBanners from "../components/transfer/TransferBanners";
import TravelDocsSection from "../components/transfer/TravelDocsSection";
import TotalsSection from "../components/transfer/TotalsSection";
import SubmitSection from "../components/transfer/SubmitSection";
import SuccessPanel from "../components/transfer/SuccessPanel";
import { compressImage } from "../../lib/compressImage";
import { today } from "../../lib/format";
import {
  fnUrl, authHdr, hasLowConf,
  type ApiResult, type PhotoState,
} from "../../lib/api";
import {
  useExtraction, callFn, emptyReceipt, emptyTravelDoc,
} from "../../hooks/useExtraction";
import {
  useDraftPersistence, DRAFT_KEY, STARTED_AT_KEY,
} from "../../hooks/useDraftPersistence";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { s, cx } from "../components/formStyles";
import l from "../components/layout.module.css";
import p from "./page.module.css";

// ---- Constants ----

const LAST_TRANSFER_KEY = "fleet_last_transfer_v1";
const LAST_PUTNI_NALOG_KEY = "fleet_last_putni_nalog_v1";

// ---- Types ----

type LastTransfer = {
  id: string;
  date: string;
  plateHr: string;
  dnevnicaLocation: string;
  dnevnicaAmount: number | null;
  totalEur: number;
  submittedAt: string;
};

// ---- Main component ----

const EMPTY_PHOTO: PhotoState = { file: null, loading: false, result: null };

export default function TransferForm() {
  const router = useRouter();
  // Stable SSR-safe ID for the initial receipt slot (crypto.randomUUID() differs between server/client)
  const initialReceiptId = useId();

  // Photo states
  const [vehicleHr, setVehicleHr] = useState<PhotoState>(EMPTY_PHOTO);
  const [plateHrValue, setPlateHrValue] = useState("");
  const [vehicleModelHrValue, setVehicleModelHrValue] = useState("");
  const [vehicleHrConfirmed, setVehicleHrConfirmed] = useState(false);

  const [showRot, setShowRot] = useState(false);
  const [vehicleRot, setVehicleRot] = useState<PhotoState>(EMPTY_PHOTO);
  const [plateRotValue, setPlateRotValue] = useState("");
  const [vehicleModelRotValue, setVehicleModelRotValue] = useState("");
  const [vehicleRotConfirmed, setVehicleRotConfirmed] = useState(false);

  const [odometerStart, setOdometerStart] = useState<PhotoState>(EMPTY_PHOTO);
  const [kmStartValue, setKmStartValue] = useState("");
  const [odometerStartConfirmed, setOdometerStartConfirmed] = useState(false);
  const [odometerStartTakenAt, setOdometerStartTakenAt] = useState<string | null>(null);
  const [odometerStartTimeSource, setOdometerStartTimeSource] = useState<"exif" | "now" | null>(null);

  const [odometer, setOdometer] = useState<PhotoState>(EMPTY_PHOTO);
  const [kmValue, setKmValue] = useState("");
  const [odometerConfirmed, setOdometerConfirmed] = useState(false);
  const [odometerTakenAt, setOdometerTakenAt] = useState<string | null>(null);
  const [odometerTimeSource, setOdometerTimeSource] = useState<"exif" | "now" | null>(null);

  const [transferDateSetByPhoto, setTransferDateSetByPhoto] = useState(false);

  // Manual fields
  const [transferDate, setTransferDate] = useState<string>(today());
  const [dnevnicaLocation, setDnevnicaLocation] = useState<string>("");
  const [payoutMethod, setPayoutMethod] = useState<string>("");
  const [encDevice, setEncDevice] = useState<string>("");
  const [petrolCard, setPetrolCard] = useState<string>("Nisam koristio/la");
  const [visaCard, setVisaCard] = useState<string>(V1_DRIVER);
  // Route direction drives where the car is picked up / dropped off relative to Zagreb.
  // "povrat"  = Povrat u Zagreb   → pick up at destination, drop off in Zagreb
  // "odvoz"   = Odvoz iz Zagreba  → pick up in Zagreb, drop off at destination
  const [routeDirection, setRouteDirection] = useState<"" | "povrat" | "odvoz">("");

  // Derived pickup/dropoff cities from the chosen destination + direction.
  const routeFrom =
    routeDirection === "povrat" ? dnevnicaLocation : routeDirection === "odvoz" ? "Zagreb" : "";
  const routeTo =
    routeDirection === "povrat" ? "Zagreb" : routeDirection === "odvoz" ? dnevnicaLocation : "";

  // Captured at submit time — used for Excel generation
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  // Receipts — use stable initialReceiptId to avoid SSR/CSR hydration mismatch
  const [receipts, setReceipts] = useState<ReceiptSlot[]>([{ ...emptyReceipt(), id: initialReceiptId }]);

  // Travel documents (avionska karta, autobusna karta, smjestaj)
  const [travelDocs, setTravelDocs] = useState<TravelDocSlot[]>([]);

  // Save state
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string>("");
  const [draftRestored, setDraftRestored] = useState(false);

  // Online / offline
  const isOnline = useOnlineStatus();

  // When the driver started this transfer (set on dashboard, read here)
  const [startedAt, setStartedAt] = useState<string | null>(null);

  // ---- Draft persistence ----

  useDraftPersistence({
    callFn,
    transferId, transferDate, plateHrValue, vehicleModelHrValue,
    vehicleHrConfirmed,
    showRot, plateRotValue, vehicleModelRotValue,
    vehicleRotConfirmed,
    kmStartValue, kmValue,
    odometerStartConfirmed, odometerConfirmed,
    odometerStartTakenAt, odometerTakenAt,
    dnevnicaLocation, payoutMethod, encDevice, petrolCard, visaCard,
    routeDirection, routeFrom, routeTo,
    vehicleHr, vehicleRot, odometerStart, odometer,
    receipts, travelDocs, savePhase,
    setStartedAt, setTransferDate, setPlateHrValue, setVehicleModelHrValue,
    setVehicleHrConfirmed, setShowRot, setPlateRotValue, setVehicleModelRotValue,
    setVehicleRotConfirmed, setKmStartValue, setOdometerStartConfirmed,
    setOdometerStartTakenAt, setKmValue, setOdometerConfirmed, setOdometerTakenAt,
    setDnevnicaLocation, setPayoutMethod, setEncDevice, setPetrolCard, setVisaCard,
    setRouteDirection, setVehicleHr, setVehicleRot, setOdometerStart, setOdometer,
    setReceipts, setTravelDocs, setTransferId, setDraftRestored,
  });

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    try { localStorage.removeItem(STARTED_AT_KEY); } catch {}
    clearAllPhotos().catch(() => {});
    setVehicleHr(EMPTY_PHOTO); setPlateHrValue(""); setVehicleModelHrValue(""); setVehicleHrConfirmed(false);
    setShowRot(false); setVehicleRot(EMPTY_PHOTO); setPlateRotValue(""); setVehicleModelRotValue(""); setVehicleRotConfirmed(false);
    setOdometerStart(EMPTY_PHOTO); setKmStartValue(""); setOdometerStartConfirmed(false); setOdometerStartTakenAt(null); setOdometerStartTimeSource(null);
    setOdometer(EMPTY_PHOTO); setKmValue(""); setOdometerConfirmed(false); setOdometerTakenAt(null); setOdometerTimeSource(null);
    setTransferDateSetByPhoto(false);
    setTransferDate(today());
    setDnevnicaLocation(""); setPayoutMethod(""); setEncDevice("");
    setPetrolCard("Nisam koristio/la"); setVisaCard(V1_DRIVER); setRouteDirection("");
    setReceipts([emptyReceipt()]);
    setTravelDocs([]);
    setDraftRestored(false);
  }

  // ---- Extraction handlers (hooks/useExtraction.ts) ----

  const {
    handlePlate, handleOdometerStart, handleOdometer,
    updateReceipt, handleReceiptFile, handleReceiptFiles, retryReceipt, manualReceipt,
    addReceipt, removeReceipt,
    updateTravelDoc, handleTravelDocFile, retryTravelDoc, manualTravelDoc,
    addTravelDoc, removeTravelDoc,
  } = useExtraction({
    receipts, travelDocs, setReceipts, setTravelDocs,
    setOdometerStart, setKmStartValue, setOdometerStartConfirmed,
    setOdometerStartTakenAt, setOdometerStartTimeSource,
    setOdometer, setKmValue, setOdometerConfirmed,
    setOdometerTakenAt, setOdometerTimeSource,
    setTransferDate, setTransferDateSetByPhoto,
  });

  // ---- Derived state ----

  const validReceipts = validReceiptSlots(receipts);
  const validTravelDocs = validTravelDocSlots(travelDocs);

  const totals = validReceipts.reduce(
    (acc, r) => {
      for (const item of getSlotItems(r)) {
        if (item.category === "cestarina") acc.cestarina += item.eurAmount;
        else if (item.category === "gorivo") acc.gorivo += item.eurAmount;
        else acc.ostalo += item.eurAmount;
      }
      return acc;
    },
    { cestarina: 0, gorivo: 0, ostalo: 0 },
  );

  const dnevnicaAmount = dnevnicaLocation ? (DNEVNICA[dnevnicaLocation] ?? null) : null;

  const hasGorivo = validReceipts.some((r) => getSlotItems(r).some((item) => item.category === "gorivo"));

  const travelTotals = travelDocs.reduce(
    (acc, t) => {
      if (!t.file || !t.result || t.result.error) return acc;
      const amt = travelDocEurAmount(t);
      if (t.docType === "avionska_karta") acc.avionska += amt;
      else if (t.docType === "autobusna_karta") acc.autobusna += amt;
      else if (t.docType === "blablacar") acc.blablacar += amt;
      else acc.smjestaj += amt;
      return acc;
    },
    { avionska: 0, autobusna: 0, blablacar: 0, smjestaj: 0 },
  );

  // Low-confidence cases the validation lib can't see: top-level receipt
  // confidence (receipt_date/currency) is not carried into payload rows, and
  // slots with a missing photo never enter the payload at all. Everything
  // else is reported per-receipt by validateSubmitPayload — counting it here
  // too would duplicate the message.
  const libSeesReceiptConf = (r: ReceiptSlot): boolean =>
    Boolean(r.file) && getSlotItems(r).some((item) => confIsLow(item.confidence));
  const unconfirmedCount =
    receipts.filter((r) => slotNeedsConfirm(r) && !r.confirmed && !libSeesReceiptConf(r)).length +
    travelDocs.filter((t) => travelDocNeedsConfirm(t) && !t.confirmed && !t.file).length;

  const unconfirmedAiFields = [
    { result: vehicleHr.result, confirmed: vehicleHrConfirmed },
    ...(showRot ? [{ result: vehicleRot.result, confirmed: vehicleRotConfirmed }] : []),
    { result: odometerStart.result, confirmed: odometerStartConfirmed },
    { result: odometer.result, confirmed: odometerConfirmed },
  ].filter(({ result, confirmed }) => result && !result.error && hasLowConf(result) && !confirmed).length;

  const isBusy =
    vehicleHr.loading ||
    vehicleRot.loading ||
    odometerStart.loading ||
    odometer.loading ||
    receipts.some((r) => r.loading) ||
    travelDocs.some((t) => t.loading) ||
    savePhase === "saving";

  // ---- Payload ----

  // Builds the exact payload onSpremi submits — also fed to the validation
  // lib at render time so pre-submit errors mirror the server precisely.
  function buildPayload(tid: string) {
    return buildSubmitPayload(tid, {
      transferDate, plateHrValue, vehicleModelHrValue, showRot, plateRotValue,
      kmStartValue, kmValue, routeFrom, routeTo, petrolCard, visaCard, encDevice,
      payoutMethod, dnevnicaLocation, startedAt, odometerStartTakenAt, odometerTakenAt,
      vehicleHr, vehicleRot, odometerStart, odometer, receipts, travelDocs,
    });
  }

  // ---- Validation ----

  // transfer_id is generated at submit time; the lib only checks presence,
  // so a placeholder keeps render-time validation from flagging it.
  const draftPayload = buildPayload(transferId || "draft");

  const validationErrors: string[] = [];

  // Page-only checks — state the payload doesn't carry
  if (!isOnline) validationErrors.push("Nema interneta — slanje nije moguće.");
  if (!vehicleHr.file) validationErrors.push("Dodaj foto tablice HR vozila.");
  if (!odometerStart.file) validationErrors.push("Dodaj foto početne kilometraže.");
  if (!odometer.file) validationErrors.push("Dodaj foto završne kilometraže.");
  if (dnevnicaLocation && !routeDirection)
    validationErrors.push("Odaberi smjer transfera (povrat ili odvoz).");

  if (unconfirmedCount > 0) {
    validationErrors.push(
      `${unconfirmedCount} račun${unconfirmedCount > 1 ? "a" : ""} ima nisku pouzdanost — potvrdi prije slanja.`,
    );
  }

  if (unconfirmedAiFields > 0) {
    validationErrors.push(
      `${unconfirmedAiFields} AI vrijednost${unconfirmedAiFields > 1 ? "i" : ""} ima nisku pouzdanost — potvrdi prije slanja.`,
    );
  }

  // Server-mirrored rules — single source: lib/submitValidation.ts
  validationErrors.push(...validateSubmitPayload(draftPayload));

  // Amber, non-blocking hints — must never enter validationErrors
  const submitWarnings = softWarnings(draftPayload);

  const canSave = !isBusy && validationErrors.length === 0 && savePhase !== "saved";

  // ---- Save ----

  async function onSpremi() {
    if (!canSave) return;
    setSavePhase("saving");
    setSaveError(null);

    const tid = transferId || crypto.randomUUID();
    if (!transferId) setTransferId(tid);
    const nowSubmittedAt = new Date().toISOString();

    try {
      const payload = buildPayload(tid);

      // Vehicle/odometer: coarse compression fine (no small text)
      // Receipts/travel docs: preserve fine print with higher quality
      // Supabase Edge Function request limit ~6 MB (commit 668627a hit it).
      // Guard at 5.5 MB to leave room for the JSON payload envelope.
      const SUBMIT_SIZE_LIMIT = 5.5 * 1024 * 1024;
      const compressVehicle = (f: File) => compressImage(f, { maxSide: 1920, quality: 0.72 });
      const compressOdometer = (f: File) => compressImage(f, { maxSide: 1920, quality: 0.80 });
      const compressDoc = (f: File) =>
        f.type === "application/pdf" ? Promise.resolve(f) : compressImage(f, { maxSide: 2048, quality: 0.92 });
      const compressDocLow = (f: File) =>
        f.type === "application/pdf" ? Promise.resolve(f) : compressImage(f, { maxSide: 2048, quality: 0.80 });

      const [cVehicleHr, cVehicleRot, cOdometerStart, cOdometer] = await Promise.all([
        compressVehicle(vehicleHr.file!),
        showRot && vehicleRot.file ? compressVehicle(vehicleRot.file) : Promise.resolve(null as File | null),
        compressOdometer(odometerStart.file!),
        compressOdometer(odometer.file!),
      ]);

      // Pre-compress all receipt/travel-doc files to measure total size before
      // committing to the network call.
      const receiptEntries: { slotId: string; file: File }[] = [];
      {
        const seen = new Set<string>();
        for (const slot of validReceipts) {
          if (!seen.has(slot.id)) {
            receiptEntries.push({ slotId: slot.id, file: slot.file! });
            seen.add(slot.id);
          }
        }
      }
      const travelDocEntries = validTravelDocs.map((slot) => ({ slotId: slot.id, file: slot.file! }));

      let cReceipts = await Promise.all(receiptEntries.map(({ file }) => compressDoc(file)));
      let cTravelDocs = await Promise.all(travelDocEntries.map(({ file }) => compressDoc(file)));

      const fixedBytes =
        cVehicleHr.size + (cVehicleRot?.size ?? 0) + cOdometerStart.size + cOdometer.size;
      const docBytes = () => [...cReceipts, ...cTravelDocs].reduce((s, f) => s + f.size, 0);
      let totalBytes = fixedBytes + docBytes();
      console.log(`[submit] payload size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

      if (totalBytes > SUBMIT_SIZE_LIMIT) {
        cReceipts = await Promise.all(receiptEntries.map(({ file }) => compressDocLow(file)));
        cTravelDocs = await Promise.all(travelDocEntries.map(({ file }) => compressDocLow(file)));
        totalBytes = fixedBytes + docBytes();
        console.log(`[submit] re-compressed payload size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
        if (totalBytes > SUBMIT_SIZE_LIMIT) {
          setSaveError("Fotografije su prevelike za slanje odjednom — ukloni neki račun ili smanji broj fotografija.");
          setSavePhase("error");
          return;
        }
      }

      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      fd.append("vehicle_hr", cVehicleHr);
      if (showRot && cVehicleRot) fd.append("vehicle_rotation", cVehicleRot);
      fd.append("odometer_start", cOdometerStart);
      fd.append("odometer", cOdometer);

      for (let i = 0; i < receiptEntries.length; i++) {
        fd.append(`receipt_${receiptEntries[i].slotId}`, cReceipts[i]);
      }
      for (let i = 0; i < travelDocEntries.length; i++) {
        fd.append(`travel_doc_${travelDocEntries[i].slotId}`, cTravelDocs[i]);
      }

      const httpRes = await fetch(fnUrl("submit_transfer"), {
        method: "POST",
        headers: authHdr(),
        body: fd,
      });

      const resBody = await httpRes.json().catch(() => ({ error: "parse_error" }));
      if (!httpRes.ok) {
        // Compose "code: detail" so toCroatian can recognize errors whose
        // detail alone is arbitrary (db_error, internal_error).
        const code = typeof resBody.error === "string" ? resBody.error : "";
        const detail = typeof resBody.detail === "string" ? resBody.detail : "";
        throw new Error(
          code && detail ? `${code}: ${detail}` : detail || code || `HTTP ${httpRes.status}`,
        );
      }

      const submittedId = (resBody.transfer_id as string | undefined) ?? tid;
      const submittedAtStr = (resBody.submitted_at as string | undefined) ?? nowSubmittedAt;

      try {
        const lt: LastTransfer = {
          id: submittedId,
          date: transferDate,
          plateHr: plateHrValue,
          dnevnicaLocation,
          dnevnicaAmount,
          totalEur: Math.round((totals.cestarina + totals.gorivo + totals.ostalo) * 100) / 100,
          submittedAt: submittedAtStr,
        };
        localStorage.setItem(LAST_TRANSFER_KEY, JSON.stringify(lt));
      } catch {}

      try {
        const ostaloTotal =
          totals.ostalo + travelTotals.avionska + travelTotals.autobusna + travelTotals.blablacar;
        const usedModes: { label: string; from: string; to: string }[] = [];
        for (const { docType, label } of [
          { docType: "avionska_karta" as const, label: "Avion" },
          { docType: "autobusna_karta" as const, label: "Autobus" },
          { docType: "blablacar" as const, label: "BlaBlaCar" },
        ]) {
          const slot = travelDocs.find(
            (t) => t.docType === docType && t.file && t.result && !t.result.error,
          );
          if (slot) usedModes.push({ label, from: slot.transportFrom, to: slot.transportTo });
        }
        const putniInput: PutniNalogInput = {
          transferDate,
          startedAt: odometerStartTakenAt ?? startedAt,
          submittedAt: odometerTakenAt ?? submittedAtStr,
          plateHr: plateHrValue,
          vehicleModel: vehicleModelHrValue,
          kmStart: kmStartValue ? Number(kmStartValue) : null,
          kmEnd: Number(kmValue),
          routeFrom: routeFrom.trim(),
          routeTo: routeTo.trim(),
          dnevnicaAmount,
          totalSmjestaj: Math.round(travelTotals.smjestaj * 100) / 100,
          totalGorivo: totals.gorivo,
          totalCestarina: totals.cestarina,
          totalOstalo: Math.round(ostaloTotal * 100) / 100,
          transportModes: usedModes,
          dnevnicaLocation,
        };
        localStorage.setItem(LAST_PUTNI_NALOG_KEY, JSON.stringify(putniInput));
      } catch {}

      try { localStorage.removeItem(STARTED_AT_KEY); } catch {}

      setSubmittedAt(submittedAtStr);
      clearAllPhotos().catch(() => {});
      setSavedId(submittedId);
      setSavePhase("saved");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setSaveError(toCroatian(msg));
      setSavePhase("error");
      // Draft and photos are preserved for retry
    }
  }

  // Assembles the putni-nalog payload from the (frozen, post-save) form state
  // — body unchanged from the success button's original inline onClick.
  function downloadPutniNalog() {
    const ostaloTotal =
      totals.ostalo +
      travelTotals.avionska +
      travelTotals.autobusna +
      travelTotals.blablacar;
    const usedModes: { label: string; from: string; to: string }[] = [];
    const transportDocTypes: { docType: TravelDocSlot["docType"]; label: string }[] = [
      { docType: "avionska_karta", label: "Avion" },
      { docType: "autobusna_karta", label: "Autobus" },
      { docType: "blablacar", label: "BlaBlaCar" },
    ];
    for (const { docType, label } of transportDocTypes) {
      const slot = travelDocs.find((t) => t.docType === docType && t.file && t.result && !t.result.error);
      if (slot) usedModes.push({ label, from: slot.transportFrom, to: slot.transportTo });
    }
    generatePutniNalog({
      transferDate,
      startedAt: odometerStartTakenAt ?? startedAt,
      submittedAt: odometerTakenAt ?? submittedAt!,
      plateHr: plateHrValue,
      vehicleModel: vehicleModelHrValue,
      kmStart: kmStartValue ? Number(kmStartValue) : null,
      kmEnd: Number(kmValue),
      routeFrom: routeFrom.trim(),
      routeTo: routeTo.trim(),
      dnevnicaAmount,
      totalSmjestaj: Math.round(travelTotals.smjestaj * 100) / 100,
      totalGorivo: totals.gorivo,
      totalCestarina: totals.cestarina,
      totalOstalo: Math.round(ostaloTotal * 100) / 100,
      transportModes: usedModes,
      dnevnicaLocation,
    }).catch(() => {});
  }

  const saved = savePhase === "saved";

  // ---- Render ----

  return (
    <main className={p.main}>

      <TransferChrome saved={saved} onBack={() => router.push("/")} />

      <div className={cx(l.pageShell, p.contentShell)}>

        <TransferBanners
          isOnline={isOnline}
          draftRestored={draftRestored}
          saved={saved}
          isBusy={isBusy}
          onClearDraft={clearDraft}
        />

        {/* === Datum === */}
        <div className={s.card}>
          <div className={s.redBar} />
          <div className={s.cardBody}>
            <span className={s.sectionLabel}>Datum transfera</span>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => { setTransferDate(e.target.value); setTransferDateSetByPhoto(false); }}
              disabled={saved}
              className={s.txtInput}
            />
            {transferDateSetByPhoto && !saved && (
              <p className={p.photoDateNote}>
                Datum transfera postavljen prema fotografiji: {transferDate.split("-").reverse().join(".")}.
              </p>
            )}
          </div>
        </div>

        {/* === Vozilo HR + Kilometraža početak + kraj === */}
        <div className={s.card}>
          <div className={s.redBar} />
          <div className={s.cardBody}>

            {/* Vozilo HR */}
            <span className={s.sectionLabel}>Vozilo (HR tablica)</span>
            <VehicleSection
              photo={vehicleHr}
              plateValue={plateHrValue}
              modelValue={vehicleModelHrValue}
              confirmed={vehicleHrConfirmed}
              saved={saved}
              plateLabel="Registracija"
              modelLabel="Model"
              onFile={(f) => handlePlate(f, "vehicle_hr", setVehicleHr, setPlateHrValue, setVehicleModelHrValue, setVehicleHrConfirmed)}
              onPlateChange={(v) => { setPlateHrValue(v); setVehicleHrConfirmed(false); }}
              onModelChange={(v) => { setVehicleModelHrValue(v); setVehicleHrConfirmed(false); }}
              onConfirm={() => setVehicleHrConfirmed(true)}
            />

            <hr className={p.hrDivider} />

            {/* Kilometraža — početak */}
            <OdometerSection
              title="Kilometraža — početak"
              kmLabel="Km početak"
              photo={odometerStart}
              kmValue={kmStartValue}
              confirmed={odometerStartConfirmed}
              saved={saved}
              takenAt={odometerStartTakenAt}
              timeSource={odometerStartTimeSource}
              onFile={(f) => handleOdometerStart(f)}
              onKmChange={(v) => { setKmStartValue(v); setOdometerStartConfirmed(false); }}
              onConfirm={() => setOdometerStartConfirmed(true)}
            />

            <hr className={p.hrDivider} />

            {/* Kilometraža — kraj */}
            <OdometerSection
              title="Kilometraža — kraj"
              kmLabel="Km kraj"
              photo={odometer}
              kmValue={kmValue}
              confirmed={odometerConfirmed}
              saved={saved}
              takenAt={odometerTakenAt}
              timeSource={odometerTimeSource}
              onFile={(f) => handleOdometer(f)}
              onKmChange={(v) => { setKmValue(v); setOdometerConfirmed(false); }}
              onConfirm={() => setOdometerConfirmed(true)}
            />

          </div>
        </div>

        {/* === Rotacijsko vozilo === */}
        <div className={s.card}>
          <div className={s.redBar} />
          <div className={s.cardBody}>
            <div className={p.rotationHeader}>
              {/* static: cancels sectionLabel margin-bottom in flex context */}
              <span className={s.sectionLabel} style={{ marginBottom: 0 }}>Rotacijsko vozilo</span>
              <button
                onClick={() => {
                  setShowRot((v) => !v);
                  setVehicleRot(EMPTY_PHOTO);
                  setPlateRotValue("");
                  setVehicleModelRotValue("");
                  setVehicleRotConfirmed(false);
                  deletePhoto("vehicle_rotation").catch(() => {});
                }}
                className={s.ghostBtn}
                disabled={isBusy || saved}
              >
                {showRot ? "Ukloni" : "+ Dodaj"}
              </button>
            </div>
            {showRot && (
              <VehicleSection
                photo={vehicleRot}
                plateValue={plateRotValue}
                modelValue={vehicleModelRotValue}
                confirmed={vehicleRotConfirmed}
                saved={saved}
                plateLabel="Registracija rotacija"
                modelLabel="Model (rotacija)"
                buttonStyle={{ marginTop: "0.625rem" }}
                onFile={(f) => handlePlate(f, "vehicle_rotation", setVehicleRot, setPlateRotValue, setVehicleModelRotValue, setVehicleRotConfirmed)}
                onPlateChange={(v) => { setPlateRotValue(v); setVehicleRotConfirmed(false); }}
                onModelChange={(v) => { setVehicleModelRotValue(v); setVehicleRotConfirmed(false); }}
                onConfirm={() => setVehicleRotConfirmed(true)}
              />
            )}
          </div>
        </div>

        <DestinationPayoutSection
          dnevnicaLocation={dnevnicaLocation}
          dnevnicaAmount={dnevnicaAmount}
          routeDirection={routeDirection}
          routeFrom={routeFrom}
          routeTo={routeTo}
          payoutMethod={payoutMethod}
          encDevice={encDevice}
          petrolCard={petrolCard}
          visaCard={visaCard}
          hasGorivo={hasGorivo}
          saved={saved}
          onDnevnicaLocationChange={setDnevnicaLocation}
          onRouteDirectionChange={setRouteDirection}
          onPayoutMethodChange={setPayoutMethod}
          onEncDeviceChange={setEncDevice}
          onPetrolCardChange={setPetrolCard}
          onVisaCardChange={setVisaCard}
        />

        {/* === Računi === */}
        <div className={s.card}>
          <div className={s.redBar} />
          <div className={s.cardBody}>
            <div className={p.receiptsHeader}>
              {/* static: cancels sectionLabel margin-bottom in flex context */}
              <span className={s.sectionLabel} style={{ marginBottom: 0 }}>Računi (1–{MAX_RECEIPTS})</span>
              {receipts.length < MAX_RECEIPTS && (
                <button onClick={addReceipt} disabled={isBusy || saved} className={s.ghostBtn}>
                  + Dodaj račun
                </button>
              )}
            </div>
            {receipts.map((r, idx) => (
              <ReceiptCard
                key={r.id}
                slot={r}
                index={idx}
                disabled={r.loading || saved}
                canRemove={receipts.length > 1}
                onFileChange={(file) => handleReceiptFile(r.id, file)}
                onFilesChange={(files) => handleReceiptFiles(r.id, files)}
                onUpdate={(patch) => updateReceipt(r.id, patch)}
                onRemove={() => removeReceipt(r.id)}
                onRetry={() => retryReceipt(r.id)}
                onManualEntry={() => manualReceipt(r.id)}
              />
            ))}
          </div>
        </div>

        <TravelDocsSection
          travelDocs={travelDocs}
          isBusy={isBusy}
          saved={saved}
          onAdd={addTravelDoc}
          onFile={handleTravelDocFile}
          onUpdate={updateTravelDoc}
          onRemove={removeTravelDoc}
          onRetry={retryTravelDoc}
          onManualEntry={manualTravelDoc}
        />

        <TotalsSection
          totals={totals}
          travelTotals={travelTotals}
          dnevnicaLocation={dnevnicaLocation}
          dnevnicaAmount={dnevnicaAmount}
        />

        <SubmitSection
          submitWarnings={submitWarnings}
          validationErrors={validationErrors}
          savePhase={savePhase}
          canSave={canSave}
          onSubmit={onSpremi}
        />

        {/* === Success === */}
        {saved && savedId && (
          <SuccessPanel
            savedId={savedId}
            onDownloadPutniNalog={downloadPutniNalog}
            onFinish={() => router.push("/")}
          />
        )}

        {savePhase === "error" && saveError && (
          <p className={cx(s.errorBox, p.saveErrorNote)}>{saveError}</p>
        )}

      </div>
    </main>
  );
}
