/**
 * generatePutniNalog
 *
 * Fills the Putni-nalog Excel template by patching cell values directly in
 * the raw worksheet XML (xl/worksheets/sheet1.xml) inside the XLSX zip.
 *
 * Why raw XML instead of SheetJS?
 *   SheetJS community edition strips all cell styles on write.  The XLSX
 *   format is just a ZIP of XML files.  By modifying only the <v> content of
 *   specific cells (and leaving everything else — styles, merged regions,
 *   borders, column widths — untouched) we get a pixel-perfect output that
 *   looks identical to the template.
 */

import JSZip from "jszip";

export type PutniNalogInput = {
  transferDate: string;       // YYYY-MM-DD
  startedAt: string | null;   // ISO — departure (when Započni was pressed)
  submittedAt: string;        // ISO — return   (when Pošalji was pressed)
  plateHr: string;
  vehicleModel: string;
  kmStart: number | null;
  kmEnd: number;
  routeFrom: string;
  routeTo: string;
  dnevnicaAmount: number | null;
  totalGorivo: number;
  totalCestarina: number;
  totalOstalo: number;        // travel docs (excl. gorivo/cestarina) + ostalo
  transportModes: { label: string; from: string; to: string }[];
  totalSmjestaj: number;
  dnevnicaLocation: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Excel serial date: days since 1899-12-30, using the browser's LOCAL time. */
function isoToExcelDate(iso: string): number {
  const d = new Date(iso);
  const localMs = Date.UTC(
    d.getFullYear(), d.getMonth(), d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds(),
  );
  return (localMs / 86400000) + 25569;
}

function formatCroDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `Zagreb, ${d}.${m}.${y}.`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Cell patchers ────────────────────────────────────────────────────────────
//
// Every target cell in the template is currently empty and self-closing:
//   <c r="C8" s="26"/>
// or has content (shared-string cells like A40):
//   <c r="A40" s="121" t="s"><v>50</v></c>
//
// We replace the whole element, keeping only the style-index attribute (s="N")
// so the template's number format, fill colour, borders, etc. are preserved.

/**
 * Replace the value of a numeric cell (type "n").
 * The cell's existing style index is retained so number formats (date, €) survive.
 */
function patchNum(xml: string, addr: string, value: number): string {
  // Self-closing empty cell: <c r="ADDR" s="N" [optional attrs]/>
  const scRe = new RegExp(`<c r="${addr}" s="(\\d+)"[^>]*/>`);
  // Cell with children: <c r="ADDR" s="N" [optional attrs]>...</c>
  const wcRe = new RegExp(`<c r="${addr}" s="(\\d+)"[^>]*>[\\s\\S]*?</c>`);

  const build = (si: string) => `<c r="${addr}" s="${si}"><v>${value}</v></c>`;

  const m1 = xml.match(scRe);
  if (m1) return xml.replace(scRe, build(m1[1]));

  const m2 = xml.match(wcRe);
  if (m2) return xml.replace(wcRe, build(m2[1]));

  return xml; // cell not found — skip silently
}

/**
 * Replace the value of a string cell using an inline string (t="inlineStr").
 * Inline strings avoid touching the shared-string table and are fully valid XLSX.
 */
function patchStr(xml: string, addr: string, value: string): string {
  const scRe = new RegExp(`<c r="${addr}" s="(\\d+)"[^>]*/>`);
  const wcRe = new RegExp(`<c r="${addr}" s="(\\d+)"[^>]*>[\\s\\S]*?</c>`);

  const build = (si: string) =>
    `<c r="${addr}" s="${si}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;

  const m1 = xml.match(scRe);
  if (m1) return xml.replace(scRe, build(m1[1]));

  const m2 = xml.match(wcRe);
  if (m2) return xml.replace(wcRe, build(m2[1]));

  return xml;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function generatePutniNalog(input: PutniNalogInput): Promise<void> {
  const resp = await fetch("/templates/putni-nalog-template.xlsx");
  if (!resp.ok) throw new Error("Template not found");

  const zip = await JSZip.loadAsync(await resp.arrayBuffer());

  // Force Excel to recalculate all SUM formulas (H33/H37/H38) on open.
  // Without this, Excel uses the cached result from when the template was saved (0).
  const wbFile = zip.file("xl/workbook.xml");
  if (wbFile) {
    let wbXml = await wbFile.async("string");
    wbXml = wbXml.replace(/<calcPr([^/]*)\/>/,
      (_, attrs) => `<calcPr${attrs} fullCalcOnLoad="1"/>`);
    zip.file("xl/workbook.xml", wbXml);
  }

  const wsFile = zip.file("xl/worksheets/sheet1.xml");
  if (!wsFile) throw new Error("Worksheet missing from template");
  let xml = await wsFile.async("string");

  // ── I. Dnevnice ─────────────────────────────────────────────────────────
  // C8/D8 use the template's "m/d/yy h:mm" date format (style s="26"/"27").
  if (input.startedAt) {
    xml = patchNum(xml, "C8", isoToExcelDate(input.startedAt));
  }
  xml = patchNum(xml, "D8", isoToExcelDate(input.submittedAt));

  // G8 uses the template's "#,##0.00 [$€-1]" format.
  if (input.dnevnicaAmount !== null && input.dnevnicaAmount > 0) {
    xml = patchNum(xml, "G8", input.dnevnicaAmount);
  }
  // F8 (count of daily allowances) — intentionally left blank, driver fills manually.

  // ── II. Podaci o prijevozu ───────────────────────────────────────────────
  xml = patchStr(xml, "B16", input.routeFrom);
  xml = patchStr(xml, "C16", input.routeTo);

  // E16/F16 use "General" format → integers display without ".00".
  if (input.kmStart !== null) {
    xml = patchNum(xml, "E16", input.kmStart);
    xml = patchNum(xml, "D16", input.kmEnd - input.kmStart);
    xml = patchNum(xml, "D19", input.kmEnd - input.kmStart);
  }
  xml = patchNum(xml, "F16", input.kmEnd);

  if (input.vehicleModel.trim()) {
    xml = patchStr(xml, "G16", input.vehicleModel.trim());
  }
  xml = patchStr(xml, "H16", input.plateHr);

  // Drugi prijevoz — up to 2 rows (B21/D21/H21, B22/D22/H22)
  const modeRows = [
    { label: "H21", from: "B21", to: "D21" },
    { label: "H22", from: "B22", to: "D22" },
  ] as const;
  input.transportModes.slice(0, 2).forEach((mode, i) => {
    xml = patchStr(xml, modeRows[i].label, mode.label);
    if (mode.from.trim()) xml = patchStr(xml, modeRows[i].from, mode.from.trim());
    if (mode.to.trim()) xml = patchStr(xml, modeRows[i].to, mode.to.trim());
  });

  // ── III. Troškovi ────────────────────────────────────────────────────────
  // H25=Hotel, H27=Gorivo, H28=Cestarine, H32=Ostalo
  if (input.totalSmjestaj > 0)  xml = patchNum(xml, "H25", input.totalSmjestaj);
  if (input.totalGorivo > 0)    xml = patchNum(xml, "H27", input.totalGorivo);
  if (input.totalCestarina > 0) xml = patchNum(xml, "H28", input.totalCestarina);
  if (input.totalOstalo > 0)    xml = patchNum(xml, "H32", input.totalOstalo);
  // H33 / H37 / H38 are SUM formulas — NOT touched; recalculate on open.

  // ── Footer ───────────────────────────────────────────────────────────────
  xml = patchStr(xml, "A40", formatCroDate(input.transferDate));
  xml = patchStr(xml, "F40", "Demo Vozač");

  // ── Write back & download ────────────────────────────────────────────────
  zip.file("xl/worksheets/sheet1.xml", xml);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });

  const year = input.transferDate.split("-")[0];
  const filename = `Putni nalog - ${year} - ${input.dnevnicaLocation}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
