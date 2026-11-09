// Shared FX lookup for the extract_* functions.
//
// Frankfurter (ECB reference rates) does not carry BAM or RSD, yet the
// dnevnica destinations include BAM cities (Banja Luka, Sarajevo, Tuzla) and
// Beograd (RSD). BAM is hard-pegged via a currency board (1 EUR = 1.95583 BAM,
// constant), so it is resolved statically and works even without a receipt
// date. Floating currencies missing from the ECB feed (e.g. RSD) return null —
// callers must flag the amount for mandatory review instead of guessing.

export interface FxRateResult {
  // EUR per 1 unit of the native currency
  fx_rate: number;
  fx_rate_date: string | null;
  source: "ecb" | "peg";
}

// EUR per 1 unit. BGN shares the same currency-board peg as BAM.
const PEG_EUR_PER_UNIT: Record<string, number> = {
  BAM: 1 / 1.95583,
  BGN: 1 / 1.95583,
};

export async function fetchFxRate(
  currency: string,
  date: string | null,
): Promise<FxRateResult | null> {
  const peg = PEG_EUR_PER_UNIT[currency];
  if (peg !== undefined) {
    return { fx_rate: peg, fx_rate_date: date ?? null, source: "peg" };
  }

  if (!date) return null;

  const url =
    `https://api.frankfurter.app/${date}?from=${encodeURIComponent(currency)}&to=EUR`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const fx_rate = data?.rates?.EUR;
    const fx_rate_date = typeof data?.date === "string" ? data.date : date;
    if (typeof fx_rate !== "number" || fx_rate <= 0) return null;
    return { fx_rate, fx_rate_date, source: "ecb" };
  } catch {
    return null;
  }
}
