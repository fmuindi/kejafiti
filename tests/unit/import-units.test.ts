import { describe, expect, it } from "vitest";
import { TEMPLATE_CSV, parseDate, parseDelimited, parseImport } from "@/lib/import-units";

describe("spreadsheet import", () => {
  it("reads CSV with quotes, commas and line breaks inside cells", () => {
    expect(parseDelimited('Unit,Note\r\nA1,"Paid, but late"\r\nA2,"Said ""hi""\nthen left"\r\n')).toEqual([
      ["Unit", "Note"], ["A1", "Paid, but late"], ["A2", 'Said "hi"\nthen left'],
    ]);
  });
  it("reads cells pasted from Excel or Google Sheets (tabs) and semicolon CSV", () => {
    expect(parseDelimited("Unit\tRent\nA1\t9,000\n")).toEqual([["Unit", "Rent"], ["A1", "9,000"]]);
    expect(parseDelimited("Unit;Rent\nA1;9000")).toEqual([["Unit", "Rent"], ["A1", "9000"]]);
  });
  it("reads Kenyan dates day-first, and rejects impossible ones", () => {
    expect(parseDate("01/09/2026")).toBe("2026-09-01");
    expect(parseDate("5-9-26")).toBe("2026-09-05");
    expect(parseDate("2026-09-01")).toBe("2026-09-01");
    expect(parseDate("1 Sep 2026")).toBe("2026-09-01");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("next week")).toBeNull();
  });
  it("matches loose headers and normalises unit types, money and dates", () => {
    const p = parseImport("House No,House type,Tenant,Mobile,Move in,Monthly rent,Arrears\nB4,2 bedroom,Achieng O,0711222333,15/08/2026,\"KSh 18,000\",(2500)\n");
    expect(p.missingLabel).toBe(false);
    expect(p.problems).toEqual([]);
    expect(p.rows[0]).toEqual({
      row: 2, label: "B4", layout: "bedroom_home", bedrooms: "2", tenant_name: "Achieng O", tenant_phone: "0711222333",
      start_date: "2026-08-15", rent_amount: "18000", opening_balance: "-2500", opening_balance_note: "Balance carried over at import",
    });
  });
  it("reports unreadable values with the spreadsheet row number", () => {
    const p = parseImport("Unit,Type,Rent,Start date,Due day,Email\nA1,castle,9000,,,\nA2,bedsitter,nine thousand,32/01/2026,31,x@\nA3,single,8000,,5th,\n");
    expect(p.rows.map((r) => r.label)).toEqual(["A3"]);
    expect(p.rows[0].due_day).toBe("5");
    expect(p.problems.map((x) => x.row)).toEqual([2, 3]);
    expect(p.problems[1].message).toContain('Rent "nine thousand"');
    expect(p.problems[1].message).toContain("Due day");
    expect(p.problems[1].message).toContain("isn't an email");
  });
  it("needs a unit column", () => {
    expect(parseImport("Tenant,Rent\nAmina,9000").missingLabel).toBe(true);
  });
  it("reads its own template cleanly", () => {
    const p = parseImport(TEMPLATE_CSV);
    expect(p.problems).toEqual([]);
    expect(p.rows.map((r) => r.label)).toEqual(["A1", "A2", "B1"]);
    expect(p.rows[0].opening_balance).toBeUndefined();
    expect(p.rows[2]).toEqual({ row: 4, label: "B1", layout: "bedroom_home", bedrooms: "2" });
  });
});
