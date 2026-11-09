// unpdf uses pdf.js under the hood and works in Deno edge environments.
// pdf-parse was removed because it imports Node.js built-ins at startup
// that crash the Supabase edge runtime (BOOT_ERROR).
// deno-lint-ignore-file no-explicit-any
import { extractText } from "npm:unpdf";

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { text } = await extractText(bytes, { mergePages: true }) as any;
  return (typeof text === "string" ? text : "").trim();
}
