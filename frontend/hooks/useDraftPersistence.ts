"use client";
import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { ApiResult, PhotoState } from "../lib/api";
import type { ReceiptSlot } from "../lib/receiptItems";
import type { TravelDocSlot } from "../app/components/TravelDocCard";
import { loadPhoto } from "../lib/photoStore";

// Draft persistence for the transfer page (plan11 phase 2 step 4 — the
// restore-on-mount / save-on-change / clear-on-saved effects moved verbatim
// out of app/transfer/page.tsx).
//
// FROZEN: the key names and the persisted JSON shape must not change — an
// in-flight draft saved by a previous app version has to restore correctly.

export const DRAFT_KEY = "fleet_draft_v1";
export const STARTED_AT_KEY = "fleet_transfer_started_at";

type SavePhase = "idle" | "saving" | "saved" | "error";
type RouteDirection = "" | "povrat" | "odvoz";

interface DraftPersistenceParams {
  // Extraction runner for restored photos that have no saved result.
  callFn: (name: string, file: File) => Promise<ApiResult>;

  // -- state serialized by the save effect --
  transferId: string;
  transferDate: string;
  plateHrValue: string;
  vehicleModelHrValue: string;
  vehicleHrConfirmed: boolean;
  showRot: boolean;
  plateRotValue: string;
  vehicleModelRotValue: string;
  vehicleRotConfirmed: boolean;
  kmStartValue: string;
  kmValue: string;
  odometerStartConfirmed: boolean;
  odometerConfirmed: boolean;
  odometerStartTakenAt: string | null;
  odometerTakenAt: string | null;
  dnevnicaLocation: string;
  payoutMethod: string;
  encDevice: string;
  petrolCard: string;
  visaCard: string;
  routeDirection: RouteDirection;
  routeFrom: string;
  routeTo: string;
  vehicleHr: PhotoState;
  vehicleRot: PhotoState;
  odometerStart: PhotoState;
  odometer: PhotoState;
  receipts: ReceiptSlot[];
  travelDocs: TravelDocSlot[];
  savePhase: SavePhase;

  // -- setters driven by the restore-on-mount effect --
  setStartedAt: Dispatch<SetStateAction<string | null>>;
  setTransferDate: Dispatch<SetStateAction<string>>;
  setPlateHrValue: Dispatch<SetStateAction<string>>;
  setVehicleModelHrValue: Dispatch<SetStateAction<string>>;
  setVehicleHrConfirmed: Dispatch<SetStateAction<boolean>>;
  setShowRot: Dispatch<SetStateAction<boolean>>;
  setPlateRotValue: Dispatch<SetStateAction<string>>;
  setVehicleModelRotValue: Dispatch<SetStateAction<string>>;
  setVehicleRotConfirmed: Dispatch<SetStateAction<boolean>>;
  setKmStartValue: Dispatch<SetStateAction<string>>;
  setOdometerStartConfirmed: Dispatch<SetStateAction<boolean>>;
  setOdometerStartTakenAt: Dispatch<SetStateAction<string | null>>;
  setKmValue: Dispatch<SetStateAction<string>>;
  setOdometerConfirmed: Dispatch<SetStateAction<boolean>>;
  setOdometerTakenAt: Dispatch<SetStateAction<string | null>>;
  setDnevnicaLocation: Dispatch<SetStateAction<string>>;
  setPayoutMethod: Dispatch<SetStateAction<string>>;
  setEncDevice: Dispatch<SetStateAction<string>>;
  setPetrolCard: Dispatch<SetStateAction<string>>;
  setVisaCard: Dispatch<SetStateAction<string>>;
  setRouteDirection: Dispatch<SetStateAction<RouteDirection>>;
  setVehicleHr: Dispatch<SetStateAction<PhotoState>>;
  setVehicleRot: Dispatch<SetStateAction<PhotoState>>;
  setOdometerStart: Dispatch<SetStateAction<PhotoState>>;
  setOdometer: Dispatch<SetStateAction<PhotoState>>;
  setReceipts: Dispatch<SetStateAction<ReceiptSlot[]>>;
  setTravelDocs: Dispatch<SetStateAction<TravelDocSlot[]>>;
  setTransferId: Dispatch<SetStateAction<string>>;
  setDraftRestored: Dispatch<SetStateAction<boolean>>;
}

export function useDraftPersistence(p: DraftPersistenceParams) {
  const {
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
  } = p;

  useEffect(() => {
    let cancelled = false;

    // Read the timestamp set when "Započni Transfer" was clicked
    try {
      const ts = localStorage.getItem(STARTED_AT_KEY);
      if (ts) setStartedAt(ts);
    } catch {}

    let savedVehicleHrResult: ApiResult | null = null;
    let savedVehicleRotResult: ApiResult | null = null;
    let savedOdometerStartResult: ApiResult | null = null;
    let savedOdometerResult: ApiResult | null = null;
    let savedPlateHrValue = "";
    let savedPlateRotValue = "";
    let savedVehicleModelHrValue = "";
    let savedVehicleModelRotValue = "";
    let savedKmStartValue = "";
    let savedKmValue = "";
    let draftReceiptSlots: ReceiptSlot[] = [];
    let savedTravelDocs: TravelDocSlot[] = [];

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.transferDate) setTransferDate(d.transferDate);
        if (d.plateHrValue) { setPlateHrValue(d.plateHrValue); savedPlateHrValue = d.plateHrValue; }
        if (d.vehicleModelHrValue) { setVehicleModelHrValue(d.vehicleModelHrValue); savedVehicleModelHrValue = d.vehicleModelHrValue; }
        if (typeof d.vehicleHrConfirmed === "boolean") setVehicleHrConfirmed(d.vehicleHrConfirmed);
        if (typeof d.showRot === "boolean") setShowRot(d.showRot);
        if (d.plateRotValue) { setPlateRotValue(d.plateRotValue); savedPlateRotValue = d.plateRotValue; }
        if (d.vehicleModelRotValue) { setVehicleModelRotValue(d.vehicleModelRotValue); savedVehicleModelRotValue = d.vehicleModelRotValue; }
        if (typeof d.vehicleRotConfirmed === "boolean") setVehicleRotConfirmed(d.vehicleRotConfirmed);
        if (d.kmStartValue) { setKmStartValue(d.kmStartValue); savedKmStartValue = d.kmStartValue; }
        if (typeof d.odometerStartConfirmed === "boolean") setOdometerStartConfirmed(d.odometerStartConfirmed);
        if (typeof d.odometerStartTakenAt === "string") setOdometerStartTakenAt(d.odometerStartTakenAt);
        if (d.kmValue) { setKmValue(d.kmValue); savedKmValue = d.kmValue; }
        if (typeof d.odometerConfirmed === "boolean") setOdometerConfirmed(d.odometerConfirmed);
        if (typeof d.odometerTakenAt === "string") setOdometerTakenAt(d.odometerTakenAt);
        if (d.dnevnicaLocation) setDnevnicaLocation(d.dnevnicaLocation);
        if (d.payoutMethod) setPayoutMethod(d.payoutMethod);
        if (d.encDevice) setEncDevice(d.encDevice);
        if (d.petrolCard) setPetrolCard(d.petrolCard);
        if (d.visaCard) setVisaCard(d.visaCard);
        if (d.routeDirection === "povrat" || d.routeDirection === "odvoz") {
          setRouteDirection(d.routeDirection);
        } else if (d.routeFrom || d.routeTo) {
          // Backward-compat with drafts saved before direction toggle existed.
          setRouteDirection(d.routeTo === "Zagreb" ? "povrat" : "odvoz");
        }
        savedVehicleHrResult = d.vehicleHrResult ?? null;
        savedVehicleRotResult = d.vehicleRotResult ?? null;
        savedOdometerStartResult = d.odometerStartResult ?? null;
        savedOdometerResult = d.odometerResult ?? null;
        if (Array.isArray(d.receipts) && d.receipts.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          draftReceiptSlots = d.receipts.map((r: any) => ({
            id: r.id || crypto.randomUUID(),
            file: null,
            loading: false,
            result: r.result ?? null,
            categoryOverride: r.categoryOverride ?? null,
            receiptDateOverride: r.receiptDateOverride ?? null,
            vendorOverride: r.vendorOverride ?? null,
            confirmed: r.confirmed ?? false,
            itemCategoryOverrides: r.itemCategoryOverrides ?? null,
            itemAmountOverrides: r.itemAmountOverrides ?? null,
          }));
          setReceipts(draftReceiptSlots);
        }
        if (Array.isArray(d.travelDocs) && d.travelDocs.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          savedTravelDocs = d.travelDocs.map((t: any) => ({
            id: t.id || crypto.randomUUID(),
            docType: t.docType,
            file: null,
            loading: false,
            result: t.result ?? null,
            eurAmountOverride: t.eurAmountOverride ?? null,
            travelDateOverride: t.travelDateOverride ?? null,
            vendorOverride: t.vendorOverride ?? null,
            confirmed: t.confirmed ?? false,
            transportFrom: t.transportFrom ?? "",
            transportTo: t.transportTo ?? "",
          }));
          setTravelDocs(savedTravelDocs);
        }
        const loadedId = typeof d.transferId === "string" ? d.transferId : null;
        setTransferId(loadedId ?? crypto.randomUUID());
        setDraftRestored(true);
      } else {
        setTransferId(crypto.randomUUID());
      }
    } catch {
      setTransferId(crypto.randomUUID());
    }

    // Async: restore photo files from IndexedDB
    (async () => {
      try {
        const [hrFile, rotFile, odoStartFile, odoFile] = await Promise.all([
          loadPhoto("vehicle_hr").catch(() => null),
          loadPhoto("vehicle_rotation").catch(() => null),
          loadPhoto("odometer_start").catch(() => null),
          loadPhoto("odometer").catch(() => null),
        ]);
        if (cancelled) return;

        if (hrFile) {
          if (savedVehicleHrResult) {
            setVehicleHr({ file: hrFile, loading: false, result: savedVehicleHrResult });
            if (!savedVehicleModelHrValue && typeof savedVehicleHrResult.vehicle_model === "string") {
              setVehicleModelHrValue(savedVehicleHrResult.vehicle_model);
            }
          } else {
            setVehicleHr({ file: hrFile, loading: true, result: null });
            callFn("extract_plate", hrFile).then((result) => {
              if (cancelled) return;
              setVehicleHr({ file: hrFile, loading: false, result });
              if (!result.error && typeof result.plate_raw === "string" && !savedPlateHrValue) {
                setPlateHrValue(result.plate_raw);
              }
              if (!result.error && typeof result.vehicle_model === "string" && !savedVehicleModelHrValue) {
                setVehicleModelHrValue(result.vehicle_model);
              }
              }).catch((err) => {
              if (cancelled) return;
              setVehicleHr({ file: hrFile, loading: false, result: { error: "extraction_failed", detail: String(err), model: "client_error" } });
            });
          }
        }

        if (rotFile) {
          setShowRot(true);
          if (savedVehicleRotResult) {
            setVehicleRot({ file: rotFile, loading: false, result: savedVehicleRotResult });
            if (!savedVehicleModelRotValue && typeof savedVehicleRotResult.vehicle_model === "string") {
              setVehicleModelRotValue(savedVehicleRotResult.vehicle_model);
            }
          } else {
            setVehicleRot({ file: rotFile, loading: true, result: null });
            callFn("extract_plate", rotFile).then((result) => {
              if (cancelled) return;
              setVehicleRot({ file: rotFile, loading: false, result });
              if (!result.error && typeof result.plate_raw === "string" && !savedPlateRotValue) {
                setPlateRotValue(result.plate_raw);
              }
              if (!result.error && typeof result.vehicle_model === "string" && !savedVehicleModelRotValue) {
                setVehicleModelRotValue(result.vehicle_model);
              }
              }).catch((err) => {
              if (cancelled) return;
              setVehicleRot({ file: rotFile, loading: false, result: { error: "extraction_failed", detail: String(err), model: "client_error" } });
            });
          }
        }

        if (odoStartFile) {
          if (savedOdometerStartResult) {
            setOdometerStart({ file: odoStartFile, loading: false, result: savedOdometerStartResult });
          } else {
            setOdometerStart({ file: odoStartFile, loading: true, result: null });
            callFn("extract_odometer", odoStartFile).then((result) => {
              if (cancelled) return;
              setOdometerStart({ file: odoStartFile, loading: false, result });
              if (!result.error && typeof result.odometer_km === "number" && !savedKmStartValue) {
                setKmStartValue(String(result.odometer_km));
              }
            }).catch((err) => {
              if (cancelled) return;
              setOdometerStart({ file: odoStartFile, loading: false, result: { error: "extraction_failed", detail: String(err), model: "client_error" } });
            });
          }
        }

        if (odoFile) {
          if (savedOdometerResult) {
            setOdometer({ file: odoFile, loading: false, result: savedOdometerResult });
          } else {
            setOdometer({ file: odoFile, loading: true, result: null });
            callFn("extract_odometer", odoFile).then((result) => {
              if (cancelled) return;
              setOdometer({ file: odoFile, loading: false, result });
              if (!result.error && typeof result.odometer_km === "number" && !savedKmValue) {
                setKmValue(String(result.odometer_km));
              }
            }).catch((err) => {
              if (cancelled) return;
              setOdometer({ file: odoFile, loading: false, result: { error: "extraction_failed", detail: String(err), model: "client_error" } });
            });
          }
        }

        if (draftReceiptSlots.length > 0) {
          const receiptFiles = await Promise.all(
            draftReceiptSlots.map((slot) => loadPhoto(`receipt_${slot.id}`).catch(() => null)),
          );
          if (cancelled) return;
          setReceipts((prev) =>
            prev.map((r, i) =>
              i < receiptFiles.length && receiptFiles[i] ? { ...r, file: receiptFiles[i] as File } : r,
            ),
          );
        }

        if (savedTravelDocs.length > 0) {
          const travelDocFiles = await Promise.all(
            savedTravelDocs.map((slot) => loadPhoto(`travel_doc_${slot.id}`).catch(() => null)),
          );
          if (cancelled) return;
          setTravelDocs((prev) =>
            prev.map((t, i) =>
              i < travelDocFiles.length && travelDocFiles[i] ? { ...t, file: travelDocFiles[i] as File } : t,
            ),
          );
        }
      } catch {}
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (savePhase === "saved" || !transferId) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        transferId,
        transferDate, plateHrValue, vehicleModelHrValue,
        vehicleHrConfirmed,
        showRot, plateRotValue, vehicleModelRotValue,
        vehicleRotConfirmed,
        kmStartValue, kmValue,
        odometerStartConfirmed, odometerConfirmed,
        odometerStartTakenAt, odometerTakenAt,
        dnevnicaLocation, payoutMethod, encDevice, petrolCard, visaCard,
        routeDirection, routeFrom, routeTo,
        vehicleHrResult: vehicleHr.result,
        vehicleRotResult: vehicleRot.result,
        odometerStartResult: odometerStart.result,
        odometerResult: odometer.result,
        receipts: receipts.map((r) => ({
          id: r.id,
          categoryOverride: r.categoryOverride,
          receiptDateOverride: r.receiptDateOverride,
          vendorOverride: r.vendorOverride,
          confirmed: r.confirmed,
          result: r.result,
          itemCategoryOverrides: r.itemCategoryOverrides,
          itemAmountOverrides: r.itemAmountOverrides,
        })),
        travelDocs: travelDocs.map((t) => ({
          id: t.id,
          docType: t.docType,
          result: t.result,
          eurAmountOverride: t.eurAmountOverride,
          travelDateOverride: t.travelDateOverride,
          vendorOverride: t.vendorOverride,
          confirmed: t.confirmed,
          transportFrom: t.transportFrom,
          transportTo: t.transportTo,
        })),
      }));
    } catch {}
  }, [transferId, transferDate, plateHrValue, vehicleModelHrValue,
      vehicleHrConfirmed,
      showRot, plateRotValue, vehicleModelRotValue,
      vehicleRotConfirmed,
      kmStartValue, kmValue,
      odometerStartConfirmed, odometerConfirmed,
      odometerStartTakenAt, odometerTakenAt,
      dnevnicaLocation, payoutMethod, encDevice, petrolCard, visaCard,
      routeDirection, routeFrom, routeTo,
      vehicleHr.result, vehicleRot.result, odometerStart.result, odometer.result,
      receipts, travelDocs, savePhase]);

  useEffect(() => {
    if (savePhase === "saved") {
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }
  }, [savePhase]);
}
