// Pure date/number formatting helpers for the transfer page
// (plan11 phase 2 step 2 — moved verbatim out of app/transfer/page.tsx).

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function fmt2(n: number) {
  return n.toFixed(2);
}

export function fmtPhotoTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function isoToLocalDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}
