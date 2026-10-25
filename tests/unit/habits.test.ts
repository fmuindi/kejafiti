import { describe, expect, it } from "vitest";
import { byConcern, formatDays, habitOf, habitSentence, type HabitRow } from "@/lib/rent/habits";

const row = (o: Partial<HabitRow>): HabitRow => ({
  tenancy_id: "t", property_id: "p", property_name: "Sunrise", unit_id: "u", unit_label: "A1", tenant_name: "T", start_date: "2026-01-01",
  months_due: 12, on_time: 12, late: 0, overdue: 0, avg_days_late: null, max_days_late: null, on_time_streak: 12, recent: [],
  last_paid_on: null, owed: 0, promises_kept: 0, promises_broken: 0, reports: 0, ...o,
});

describe("payment habits", () => {
  it("labels by the share of due months paid on time", () => {
    expect(habitOf(row({ months_due: 12, on_time: 11 }))).toBe("on_time");
    expect(habitOf(row({ months_due: 12, on_time: 10 }))).toBe("usually");
    expect(habitOf(row({ months_due: 12, on_time: 8 }))).toBe("usually");
    expect(habitOf(row({ months_due: 12, on_time: 7 }))).toBe("often_late");
  });

  it("is too new to tell with fewer than two due months", () => {
    expect(habitOf(row({ months_due: 1, on_time: 0 }))).toBe("new");
    expect(habitOf(row({ months_due: 0, on_time: 0 }))).toBe("new");
  });

  it("says it in a sentence", () => {
    expect(habitSentence(row({ months_due: 12, on_time: 4, late: 7, overdue: 1, avg_days_late: 9.71 }))).toBe(
      "On time 4 of 12 months · late ones 9.7 days on average · 1 overdue now",
    );
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(18)).toBe("18 days");
  });

  it("puts overdue tenants first, then often late, and settled good payers last", () => {
    const rows = [
      row({ unit_label: "A1" }),
      row({ unit_label: "B2", on_time: 3, late: 9, max_days_late: 22 }),
      row({ unit_label: "A2", on_time: 4, overdue: 1, max_days_late: 20 }),
      row({ unit_label: "N1", months_due: 1, on_time: 1 }),
      row({ unit_label: "B1", on_time: 9, late: 3, max_days_late: 11 }),
    ];
    expect(rows.sort(byConcern).map((r) => r.unit_label)).toEqual(["A2", "B2", "B1", "A1", "N1"]);
  });
});
