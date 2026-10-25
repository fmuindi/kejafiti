import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/auth", () => ({}));
vi.mock("@/lib/supabase/server", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({}));
const { renderEmail } = await import("@/lib/delivery");
const { summarizeSend, deliveryLabel } = await import("@/lib/tenant-messages");

const base = {
  org_name: "Felix Properties",
  property_name: "Sunrise Apartments",
  unit_label: "A2",
  name: "Grace",
  sender: "Felix Muindi",
  body: null,
  ref: null,
  link: null,
};
const task = (template: string, payload: Record<string, unknown>) => ({ id: "t1", channel: "email", destination: "grace@example.test", template, payload: { ...base, ...payload } });

describe("tenant emails", () => {
  it("an invoice lists the month's charges, the earlier balance and the amount due", () => {
    const m = renderEmail(task("tenant_invoice", {
      subject: "Invoice for October 2026: Sunrise Apartments, unit A2",
      ref: "INV-000042",
      period_label: "October 2026",
      lines: [{ label: "October 2026 rent", amount: 15000, due_date: "2026-10-05" }, { label: "Water", amount: 800, due_date: "2026-10-05" }],
      period_total: 15800,
      earlier_balance: 5000,
      amount_due: 20800,
      credit: 0,
      due_date: "2026-10-05",
      body: "Pay to paybill 123456, account A2.",
    }))!;
    expect(m.subject).toBe("Invoice for October 2026: Sunrise Apartments, unit A2");
    expect(m.text).toContain("invoice INV-000042 from Felix Properties for October 2026");
    expect(m.text).toContain("Water: KSh 800");
    expect(m.text).toContain("Charges for October 2026: KSh 15,800");
    expect(m.text).toContain("Earlier balance still owed: KSh 5,000");
    expect(m.text).toMatch(/Amount due by .*: KSh 20,800/);
    expect(m.text).toContain("Pay to paybill 123456, account A2.");
    expect(m.text).toContain("Replies to this email aren't read");
    expect(m.text).not.toContain("See it online");
  });

  it("an invoice that leaves the tenant in credit says so instead of an amount due", () => {
    const m = renderEmail(task("tenant_invoice", {
      subject: "Invoice", ref: "INV-000043", period_label: "October 2026",
      lines: [{ label: "October 2026 rent", amount: 15000, due_date: "2026-10-05" }],
      period_total: 15000, earlier_balance: -20000, amount_due: 0, credit: 5000, due_date: "2026-10-05",
    }))!;
    expect(m.text).toContain("Credit from earlier payments: KSh 20,000");
    expect(m.text).toContain("Credit in your favour: KSh 5,000");
    expect(m.text).not.toContain("Amount due");
  });

  it("a reminder lists what is outstanding and marks what is overdue", () => {
    const m = renderEmail(task("tenant_reminder", {
      subject: "Rent reminder: KSh 5,000 due", balance: 5000, as_of: "2026-10-23",
      lines: [{ label: "October 2026 rent", outstanding: 5000, due_date: "2026-10-05", overdue: true }],
      link: "/my-rent/abc/messages/def",
    }))!;
    expect(m.text).toContain("KSh 5,000 is due for Sunrise Apartments, unit A2");
    expect(m.text).toMatch(/October 2026 rent · due .* · overdue: KSh 5,000/);
    expect(m.text).toContain("Total due: KSh 5,000");
    expect(m.text).toMatch(/See it online: https?:\/\/[^\s]+\/my-rent\/abc\/messages\/def/);
  });

  it("a message is the sender's words, escaped in the HTML", () => {
    const m = renderEmail(task("tenant_message", { subject: "Water off <Friday>", body: "Repairs 9am–3pm <b>sorry</b>" }))!;
    expect(m.subject).toBe("Water off <Friday>");
    expect(m.text).toContain("Repairs 9am–3pm <b>sorry</b>");
    expect(m.html).toContain("&lt;b&gt;sorry&lt;/b&gt;");
    expect(m.html).not.toContain("<b>sorry</b>");
    expect(m.text).not.toContain("If you've paid recently");
  });

  it("an outside link is never put in the email", () => {
    const m = renderEmail(task("tenant_message", { subject: "Hi", body: "Hi", link: "https://evil.example/x" }))!;
    expect(m.text).not.toContain("evil.example");
  });
});

describe("send results", () => {
  it("say how many went and why the others didn't", () => {
    const s = summarizeSend("reminder", {
      sent: [{ tenancy_id: "a", id: "1", ref: null }],
      skipped: [{ tenancy_id: "b", name: "Peter N", unit_label: "J2", reason: "nothing_owed" }],
    });
    expect(s.title).toBe("1 reminder sent.");
    expect(s.skipped).toEqual(["Peter N (unit J2): nothing owed"]);
  });
  it("say plainly when email is switched off", () => {
    expect(deliveryLabel("queued", false).label).toBe("Waiting: email is off");
    expect(deliveryLabel("accepted", true)).toEqual({ label: "Emailed", tone: "success" });
  });
});
