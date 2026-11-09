"use client";
import type { Dispatch, SetStateAction } from "react";
import {
  fnUrl, authHdr, unsupportedFormatResult, type ApiResult, type PhotoState,
} from "../lib/api";
import type { ReceiptSlot } from "../lib/receiptItems";
import type { TravelDocSlot } from "../app/components/TravelDocCard";
import { savePhoto, loadPhoto, deletePhoto } from "../lib/photoStore";
import { readPhotoTime } from "../lib/readPhotoTime";
import { compressImage } from "../lib/compressImage";
import { isoToLocalDate } from "../lib/format";
import { MAX_RECEIPTS } from "../lib/constants";

// Extraction call plumbing + per-slot handlers for the transfer page
// (plan11 phase 2 step 7 — moved verbatim out of app/transfer/page.tsx).

// Normalize browser-selected images to a reasonably sized JPEG before sending
// them to the vision provider, reducing upload latency and image-token cost.
// Callers must read EXIF (readPhotoTime) and save to IndexedDB (savePhoto)
// from the ORIGINAL file before extraction — canvas re-encode strips EXIF.
// Returns null when the browser cannot decode the image (e.g. Samsung HEIF):
// compressImage resolves the original on decode failure, so a still-HEIC
// type means the API would reject it anyway.
async function toExtractFile(file: File): Promise<File | null> {
  if (file.type === "application/pdf") return file;
  const compressed = await compressImage(file, { maxSide: 2048, quality: 0.85 });
  if (/^image\/hei[cf]$/i.test(compressed.type)) return null;
  return compressed;
}

export async function callFn(name: string, file: File): Promise<ApiResult> {
  const extractFile = await toExtractFile(file);
  if (!extractFile) return unsupportedFormatResult();
  const fd = new FormData();
  fd.append("image", extractFile);
  const res = await fetch(fnUrl(name), { method: "POST", headers: authHdr(), body: fd });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

// ---- Empty-slot factories ----

export function emptyReceipt(): ReceiptSlot {
  return {
    id: crypto.randomUUID(),
    file: null,
    loading: false,
    result: null,
    categoryOverride: null,
    receiptDateOverride: null,
    vendorOverride: null,
    confirmed: false,
    itemCategoryOverrides: null,
    itemAmountOverrides: null,
  };
}

export function emptyTravelDoc(docType: TravelDocSlot["docType"]): TravelDocSlot {
  return {
    id: crypto.randomUUID(),
    docType,
    file: null,
    loading: false,
    result: null,
    eurAmountOverride: null,
    travelDateOverride: null,
    vendorOverride: null,
    confirmed: false,
    transportFrom: "",
    transportTo: "",
  };
}

interface ExtractionParams {
  receipts: ReceiptSlot[];
  travelDocs: TravelDocSlot[];
  setReceipts: Dispatch<SetStateAction<ReceiptSlot[]>>;
  setTravelDocs: Dispatch<SetStateAction<TravelDocSlot[]>>;
  setOdometerStart: Dispatch<SetStateAction<PhotoState>>;
  setKmStartValue: Dispatch<SetStateAction<string>>;
  setOdometerStartConfirmed: Dispatch<SetStateAction<boolean>>;
  setOdometerStartTakenAt: Dispatch<SetStateAction<string | null>>;
  setOdometerStartTimeSource: Dispatch<SetStateAction<"exif" | "now" | null>>;
  setOdometer: Dispatch<SetStateAction<PhotoState>>;
  setKmValue: Dispatch<SetStateAction<string>>;
  setOdometerConfirmed: Dispatch<SetStateAction<boolean>>;
  setOdometerTakenAt: Dispatch<SetStateAction<string | null>>;
  setOdometerTimeSource: Dispatch<SetStateAction<"exif" | "now" | null>>;
  setTransferDate: Dispatch<SetStateAction<string>>;
  setTransferDateSetByPhoto: Dispatch<SetStateAction<boolean>>;
}

export function useExtraction(p: ExtractionParams) {
  const {
    receipts, travelDocs, setReceipts, setTravelDocs,
    setOdometerStart, setKmStartValue, setOdometerStartConfirmed,
    setOdometerStartTakenAt, setOdometerStartTimeSource,
    setOdometer, setKmValue, setOdometerConfirmed,
    setOdometerTakenAt, setOdometerTimeSource,
    setTransferDate, setTransferDateSetByPhoto,
  } = p;

  async function handlePlate(
    file: File,
    photoKey: string,
    setter: Dispatch<SetStateAction<PhotoState>>,
    valueSetter: Dispatch<SetStateAction<string>>,
    modelSetter: Dispatch<SetStateAction<string>>,
    confirmSetter: Dispatch<SetStateAction<boolean>>,
  ) {
    savePhoto(photoKey, file).catch(() => {});
    setter({ file, loading: true, result: null });
    valueSetter("");
    modelSetter("");
    confirmSetter(false);
    try {
      const result = await callFn("extract_plate", file);
      setter({ file, loading: false, result });
      if (!result.error && typeof result.plate_raw === "string") {
        valueSetter(result.plate_raw);
      }
      if (!result.error && typeof result.vehicle_model === "string") {
        modelSetter(result.vehicle_model);
      }
    } catch (err) {
      setter({ file, loading: false, result: { error: "extraction_failed", detail: String(err), model: "client_error" } });
    }
  }

  async function handleOdometerStart(file: File) {
    savePhoto("odometer_start", file).catch(() => {});
    setOdometerStart({ file, loading: true, result: null });
    setKmStartValue("");
    setOdometerStartConfirmed(false);
    readPhotoTime(file).then(({ iso, source }) => {
      setOdometerStartTakenAt(iso);
      setOdometerStartTimeSource(source);
      const newDate = isoToLocalDate(iso);
      setTransferDate((prev) => {
        if (newDate !== prev) setTransferDateSetByPhoto(true);
        return newDate;
      });
    }).catch(() => {
      const iso = new Date().toISOString();
      setOdometerStartTakenAt(iso);
      setOdometerStartTimeSource("now");
      setTransferDate(isoToLocalDate(iso));
    });
    try {
      const result = await callFn("extract_odometer", file);
      setOdometerStart({ file, loading: false, result });
      if (!result.error && typeof result.odometer_km === "number") {
        setKmStartValue(String(result.odometer_km));
      }
    } catch (err) {
      setOdometerStart({ file, loading: false, result: { error: "extraction_failed", detail: String(err), model: "client_error" } });
    }
  }

  async function handleOdometer(file: File) {
    savePhoto("odometer", file).catch(() => {});
    setOdometer({ file, loading: true, result: null });
    setKmValue("");
    setOdometerConfirmed(false);
    readPhotoTime(file).then(({ iso, source }) => {
      setOdometerTakenAt(iso);
      setOdometerTimeSource(source);
    }).catch(() => {
      setOdometerTakenAt(new Date().toISOString());
      setOdometerTimeSource("now");
    });
    try {
      const result = await callFn("extract_odometer", file);
      setOdometer({ file, loading: false, result });
      if (!result.error && typeof result.odometer_km === "number") {
        setKmValue(String(result.odometer_km));
      }
    } catch (err) {
      setOdometer({ file, loading: false, result: { error: "extraction_failed", detail: String(err), model: "client_error" } });
    }
  }

  function updateReceipt(id: string, patch: Partial<ReceiptSlot>) {
    setReceipts((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Runs extraction for a slot's existing file (used by both first pick and retry).
  async function extractReceipt(id: string, file: File) {
    setReceipts((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, file, loading: true, result: null, categoryOverride: null, receiptDateOverride: null, vendorOverride: null, confirmed: false, itemCategoryOverrides: null, itemAmountOverrides: null }
          : r,
      ),
    );
    try {
      const result = await callFn("extract_receipt", file);
      setReceipts((prev) =>
        prev.map((r) => (r.id === id ? { ...r, loading: false, result } : r)),
      );
    } catch (err) {
      setReceipts((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, loading: false, result: { error: "extraction_failed", detail: String(err), model: "client_error" } }
            : r,
        ),
      );
    }
  }

  async function handleReceiptFile(id: string, file: File) {
    savePhoto(`receipt_${id}`, file).catch(() => {});
    await extractReceipt(id, file);
  }

  // Multi-select from Galerija: the first file fills the slot whose picker was
  // tapped; each remaining file spawns a fresh slot (bounded by MAX_RECEIPTS).
  // Every extraction is fired without awaiting the previous one, so they run
  // concurrently — N photos in, N independent Edge Function calls in flight.
  // One photo still maps to exactly one receipt (no segmenting within an image).
  function handleReceiptFiles(firstSlotId: string, files: File[]) {
    if (files.length === 0) return;
    const [firstFile, ...restFiles] = files;
    // The tapped slot already exists; only the extras consume free capacity.
    const capacity = Math.max(0, MAX_RECEIPTS - receipts.length);
    const extras = restFiles.slice(0, capacity);

    // Create the empty slots up front so the per-slot extraction updaters can
    // find them by id (React composes the queued setReceipts updaters in order).
    const newSlots = extras.map(() => emptyReceipt());
    if (newSlots.length > 0) {
      setReceipts((prev) => [...prev, ...newSlots]);
    }

    handleReceiptFile(firstSlotId, firstFile);
    newSlots.forEach((slot, i) => handleReceiptFile(slot.id, extras[i]));
  }

  // Re-run extraction without re-saving the photo (it is already in IndexedDB).
  async function retryReceipt(id: string) {
    const slot = receipts.find((r) => r.id === id);
    if (!slot) return;
    const file = slot.file ?? (await loadPhoto(`receipt_${id}`).catch(() => null));
    if (!file) return;
    await extractReceipt(id, file);
  }

  // Manual-entry fallback: synthetic zero-confidence result so every existing
  // review/confirm path fires and the slot re-enters validReceipts (photo
  // uploads + DB row at submit). The driver edits the fields by hand.
  function manualReceipt(id: string) {
    updateReceipt(id, {
      result: {
        items: [{
          category: "ostalo",
          native_amount: 0,
          native_currency: "EUR",
          eur_amount: 0,
          fx_rate: null,
          fx_rate_date: null,
          confidence: { category: 0, native_amount: 0 },
        }],
        native_currency: "EUR",
        receipt_date: null,
        vendor: null,
        raw_text: null,
        model: "manual",
        confidence: { native_currency: 0, receipt_date: 0 },
      },
      categoryOverride: null,
      receiptDateOverride: null,
      vendorOverride: null,
      itemCategoryOverrides: null,
      itemAmountOverrides: null,
      confirmed: false,
    });
  }

  function addReceipt() {
    setReceipts((prev) => [...prev, emptyReceipt()]);
  }

  function removeReceipt(id: string) {
    deletePhoto(`receipt_${id}`).catch(() => {});
    setReceipts((prev) => prev.filter((r) => r.id !== id));
  }

  function updateTravelDoc(id: string, patch: Partial<TravelDocSlot>) {
    setTravelDocs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  // Runs extraction for a travel-doc slot's existing file (first pick and retry).
  // Does not reset transportFrom/To so driver-typed routes survive a retry.
  async function extractTravelDoc(
    id: string,
    file: File,
    docType: TravelDocSlot["docType"],
  ) {
    setTravelDocs((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, file, loading: true, result: null, eurAmountOverride: null, travelDateOverride: null, vendorOverride: null, confirmed: false }
          : t,
      ),
    );
    try {
      const extractFile = await toExtractFile(file);
      if (!extractFile) {
        setTravelDocs((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, loading: false, result: unsupportedFormatResult() } : t,
          ),
        );
        return;
      }
      const fd = new FormData();
      fd.append("image", extractFile);
      fd.append("doc_type", docType);
      const res = await fetch(fnUrl("extract_travel_doc"), { method: "POST", headers: authHdr(), body: fd });
      const result: ApiResult = res.ok
        ? await res.json()
        : { error: "extraction_failed", detail: `HTTP ${res.status}`, model: "client_error" };
      setTravelDocs((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const updated: TravelDocSlot = { ...t, loading: false, result };
          if (!result.error && docType !== "smjestaj") {
            const td = result.travel_details as Record<string, unknown> | null;
            if (!t.transportFrom && td?.route_from) updated.transportFrom = String(td.route_from);
            if (!t.transportTo && td?.route_to) updated.transportTo = String(td.route_to);
          }
          return updated;
        }),
      );
    } catch (err) {
      setTravelDocs((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, loading: false, result: { error: "extraction_failed", detail: String(err), model: "client_error" } }
            : t,
        ),
      );
    }
  }

  async function handleTravelDocFile(
    id: string,
    file: File,
    docType: TravelDocSlot["docType"],
  ) {
    savePhoto(`travel_doc_${id}`, file).catch(() => {});
    setTravelDocs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, transportFrom: "", transportTo: "" } : t)),
    );
    await extractTravelDoc(id, file, docType);
  }

  // Re-run extraction without re-saving the photo (it is already in IndexedDB).
  async function retryTravelDoc(id: string) {
    const slot = travelDocs.find((t) => t.id === id);
    if (!slot) return;
    const file = slot.file ?? (await loadPhoto(`travel_doc_${id}`).catch(() => null));
    if (!file) return;
    await extractTravelDoc(id, file, slot.docType);
  }

  // Manual-entry fallback: synthetic zero-confidence travel-doc result so the
  // confirm gate fires and the slot re-enters validTravelDocs at submit.
  function manualTravelDoc(id: string) {
    updateTravelDoc(id, {
      result: {
        native_amount: 0,
        native_currency: "EUR",
        eur_amount: 0,
        fx_rate: null,
        fx_rate_date: null,
        receipt_date: null,
        vendor: null,
        travel_details: null,
        raw_text: null,
        model: "manual",
        confidence: { native_amount: 0, receipt_date: 0 },
      },
      eurAmountOverride: null,
      travelDateOverride: null,
      vendorOverride: null,
      confirmed: false,
    });
  }

  function addTravelDoc(docType: TravelDocSlot["docType"]) {
    setTravelDocs((prev) => [...prev, emptyTravelDoc(docType)]);
  }

  function removeTravelDoc(id: string) {
    deletePhoto(`travel_doc_${id}`).catch(() => {});
    setTravelDocs((prev) => prev.filter((t) => t.id !== id));
  }

  return {
    handlePlate, handleOdometerStart, handleOdometer,
    updateReceipt, handleReceiptFile, handleReceiptFiles, retryReceipt, manualReceipt,
    addReceipt, removeReceipt,
    updateTravelDoc, handleTravelDocFile, retryTravelDoc, manualTravelDoc,
    addTravelDoc, removeTravelDoc,
  };
}
