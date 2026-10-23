import { parseAmount } from "@/lib/money";

// Reads a units-and-tenancies spreadsheet: a CSV file, or cells copied straight out of Excel or
// Google Sheets (tab-separated). Headers are matched loosely ("House no", "Unit", "Unit ref"),
// and Kenyan date and money formats are accepted. What it can't read is reported per row here;
// everything else is checked by the database (public.import_units) against the real rules.

export type ImportRow = {
  row: number;
  label: string;
  layout?: string;
  bedrooms?: string;
  default_rent?: string;
  tenant_name?: string;
  tenant_phone?: string;
  tenant_email?: string;
  start_date?: string;
  rent_amount?: string;
  due_day?: string;
  deposit_held?: string;
  opening_balance?: string;
  opening_balance_note?: string;
};
export type RowProblem = { row: number; message: string };
export type ParsedImport = { rows: ImportRow[]; problems: RowProblem[]; missingLabel: boolean; columns: string[] };

const HEADERS: Record<keyof Omit<ImportRow, "row">, string[]> = {
  label: ["unit", "unit label", "unit ref", "unit reference", "unit no", "unit number", "house", "house no", "house number", "door", "room"],
  layout: ["layout", "type", "unit type", "house type"],
  bedrooms: ["bedrooms", "beds", "bedroom"],
  default_rent: ["usual rent", "default rent", "asking rent", "market rent"],
  tenant_name: ["tenant", "tenant name", "name", "occupant"],
  tenant_phone: ["phone", "tenant phone", "mobile", "phone number", "tel"],
  tenant_email: ["email", "tenant email", "e-mail"],
  start_date: ["start", "start date", "move in", "move-in", "move in date", "moved in", "tenancy start"],
  rent_amount: ["rent", "monthly rent", "rent amount", "rent (ksh)", "rent ksh", "rent (kes)"],
  due_day: ["due day", "due date", "rent due day", "pay day"],
  deposit_held: ["deposit", "deposit held", "deposit paid"],
  opening_balance: ["opening balance", "balance", "arrears", "balance owed", "balance b/f"],
  opening_balance_note: ["note", "notes", "balance note", "opening balance note"],
};

const LAYOUTS: Array<[RegExp, string]> = [
  [/^(single|single room|singo)$/, "single_room"],
  [/^(double|double room)$/, "double_room"],
  [/^(bedsitter|bedsit|studio|bedsitter \/ studio)$/, "bedsitter_studio"],
  [/^(\d+)\s*(br|bed|bedroom|bedrooms|-bedroom)$/, "bedroom_home"],
  [/^(one|1) bedroom$/, "bedroom_home"],
  [/^(two|2) bedroom$/, "bedroom_home"],
  [/^(three|3) bedroom$/, "bedroom_home"],
  [/^(bedroom home|bedroom|apartment|flat)$/, "bedroom_home"],
];

const norm = (s: string) => s.trim().toLowerCase().replace(/[_*:]/g, " ").replace(/\s+/g, " ");

/** Splits delimited text into cells, honouring quotes. The delimiter is detected from line 1. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

/** DD/MM/YYYY (the Kenyan default), D-M-YYYY, YYYY-MM-DD, or "1 Sep 2026" → YYYY-MM-DD. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else {
    const t = Date.parse(`${s} 12:00 UTC`);
    if (Number.isNaN(t)) return null;
    const dt = new Date(t);
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function money(input: string, allowNegative = false): string | null | undefined {
  const s = input.trim();
  if (!s) return undefined;
  const neg = allowNegative && /^-|^\(.*\)$/.test(s);
  const n = parseAmount(s.replace(/^-|^\(|\)$/g, ""));
  if (n === null) return undefined;
  if (Number.isNaN(n)) return null;
  return String(neg ? -n : n);
}

export function parseImport(text: string): ParsedImport {
  const grid = parseDelimited(text);
  if (grid.length === 0) return { rows: [], problems: [], missingLabel: true, columns: [] };
  const header = grid[0].map(norm);
  const index: Partial<Record<keyof typeof HEADERS, number>> = {};
  for (const [key, names] of Object.entries(HEADERS) as Array<[keyof typeof HEADERS, string[]]>) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0 && !Object.values(index).includes(i)) index[key] = i;
  }
  const columns = Object.keys(index);
  if (index.label === undefined) return { rows: [], problems: [], missingLabel: true, columns };

  const rows: ImportRow[] = [];
  const problems: RowProblem[] = [];
  grid.slice(1).forEach((cells, i) => {
    const rowNo = i + 2; // spreadsheet row number, counting the header as row 1
    const get = (k: keyof typeof HEADERS) => (index[k] === undefined ? "" : (cells[index[k]!] ?? "").trim());
    const r: ImportRow = { row: rowNo, label: get("label") };
    const issues: string[] = [];

    const type = norm(get("layout"));
    if (type) {
      const hit = LAYOUTS.find(([re]) => re.test(type));
      if (!hit) issues.push(`Unknown unit type "${get("layout")}". Use single, double, bedsitter or e.g. "2 bedroom".`);
      else {
        r.layout = hit[1];
        const beds = type.match(/^(\d+)|^(one|two|three)/);
        if (hit[1] === "bedroom_home" && beds) r.bedrooms = beds[1] ?? String(["one", "two", "three"].indexOf(beds[2]) + 1);
      }
    }
    if (get("bedrooms")) {
      if (!/^\d{1,2}$/.test(get("bedrooms"))) issues.push("Bedrooms must be a whole number.");
      else { r.bedrooms = get("bedrooms"); r.layout ??= "bedroom_home"; }
    }
    for (const [key, label] of [["default_rent", "Usual rent"], ["rent_amount", "Rent"], ["deposit_held", "Deposit"]] as const) {
      const v = money(get(key));
      if (v === null) issues.push(`${label} "${get(key)}" isn't an amount in KSh.`);
      else if (v !== undefined) r[key] = v;
    }
    const ob = money(get("opening_balance"), true);
    if (ob === null) issues.push(`Opening balance "${get("opening_balance")}" isn't an amount in KSh.`);
    else if (ob !== undefined && Number(ob) !== 0) r.opening_balance = ob;
    if (get("start_date")) {
      const d = parseDate(get("start_date"));
      if (!d) issues.push(`Start date "${get("start_date")}" isn't a date. Use DD/MM/YYYY.`);
      else r.start_date = d;
    }
    if (get("due_day")) {
      const n = Number(get("due_day").replace(/(st|nd|rd|th)$/i, ""));
      if (!Number.isInteger(n) || n < 1 || n > 28) issues.push("Due day must be a day of the month from 1 to 28.");
      else r.due_day = String(n);
    }
    for (const k of ["tenant_name", "tenant_phone", "tenant_email", "opening_balance_note"] as const) if (get(k)) r[k] = get(k);
    if (r.tenant_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.tenant_email)) issues.push(`"${r.tenant_email}" isn't an email address.`);
    if (r.tenant_name && r.opening_balance && !r.opening_balance_note) r.opening_balance_note = "Balance carried over at import";

    if (issues.length) problems.push({ row: rowNo, message: issues.join(" ") });
    else rows.push(r);
  });
  return { rows, problems, missingLabel: false, columns };
}

export const TEMPLATE_CSV =
  "Unit,Type,Tenant name,Phone,Email,Start date,Rent,Due day,Deposit,Opening balance,Note\r\n" +
  "A1,Bedsitter,Wanjiku Mwangi,0712345678,,01/09/2026,9000,5,9000,0,\r\n" +
  "A2,1 bedroom,Otieno Kamau,0722000111,otieno@example.com,15/08/2026,15000,5,15000,4500,Arrears at 30 Sep cut-off\r\n" +
  "B1,2 bedroom,,,,,,,,,\r\n";
