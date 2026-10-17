"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeRent, createTenancy, endTenancy } from "@/app/w/[orgId]/rent/actions";
import { ErrorSummary, Field, MoneyInput, Select, TextArea, TextInput, describedBy } from "@/components/ui/form";
import { Button, Notice } from "@/components/ui/primitives";
import { addMonths, currentPeriod, todayEAT } from "@/lib/dates";
import { formatMoney, parseAmount } from "@/lib/money";

// Tenancy setup: tenant, start date, rent, due day, and an opening balance (arrears or
// credit) with an effective date and explanation, so history imported at a cut-off date is
// never counted twice.
export function TenancySetup({
  orgId,
  propertyId,
  unitId,
  defaultRent,
  dueDay,
  occupancy,
}: {
  orgId: string;
  propertyId: string;
  unitId: string;
  defaultRent: number | null;
  dueDay: number;
  occupancy: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | undefined>();
  const [openingType, setOpeningType] = useState<"none" | "arrears" | "credit">("none");

  return (
    <section aria-labelledby="setup" className="rounded-[20px] border border-line bg-surface p-4">
      <h2 id="setup" className="font-display text-[20px] font-bold">
        Set up the current tenancy
      </h2>
      <p className="mt-1 text-[14px] text-muted">
        {occupancy === "vacant" ? "This unit is vacant. Add a tenancy when someone moves in." : "Add the tenant who lives here now."} The tenant doesn&apos;t need an account.
      </p>
      <form
        className="mt-4 flex flex-col gap-4"
        noValidate
        action={(fd) =>
          start(async () => {
            const rent = parseAmount(fd.get("rent_amount"));
            const opening = parseAmount(fd.get("opening_amount"));
            const deposit = parseAmount(fd.get("deposit_held"));
            const res = await createTenancy(orgId, propertyId, {
              unit_id: unitId,
              tenant_name: String(fd.get("tenant_name") ?? ""),
              tenant_phone: String(fd.get("tenant_phone") ?? ""),
              tenant_email: String(fd.get("tenant_email") ?? ""),
              start_date: String(fd.get("start_date") ?? ""),
              rent_amount: rent ?? Number.NaN,
              due_day: Number(fd.get("due_day") ?? dueDay),
              deposit_held: deposit ?? undefined,
              opening_balance: openingType === "none" || !opening ? 0 : openingType === "arrears" ? opening : -opening,
              opening_balance_date: String(fd.get("opening_date") ?? "") || undefined,
              opening_balance_note: String(fd.get("opening_note") ?? "") || undefined,
            });
            if (!res.ok) {
              setErrors(res.fieldErrors ?? {});
              setMessage(res.message);
              return;
            }
            router.refresh();
          })
        }
      >
        <ErrorSummary errors={errors} message={message} />
        <Field label="Tenant's full name" htmlFor="tenant_name" error={errors.tenant_name}>
          <TextInput id="tenant_name" name="tenant_name" autoComplete="off" error={errors.tenant_name} aria-describedby={describedBy("tenant_name", { error: errors.tenant_name })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="tenant_phone" optional>
            <TextInput id="tenant_phone" name="tenant_phone" type="tel" inputMode="tel" />
          </Field>
          <Field label="Email" htmlFor="tenant_email" optional error={errors.tenant_email}>
            <TextInput id="tenant_email" name="tenant_email" type="email" error={errors.tenant_email} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tenancy start date" htmlFor="start_date" error={errors.start_date}>
            <TextInput id="start_date" name="start_date" type="date" defaultValue={todayEAT()} error={errors.start_date} />
          </Field>
          <Field label="Rent due day" htmlFor="due_day" hint="Day of the month rent is due (1–28).">
            <TextInput id="due_day" name="due_day" type="number" min={1} max={28} defaultValue={dueDay} aria-describedby="due_day-hint" />
          </Field>
        </div>
        <Field label="Monthly rent" htmlFor="rent_amount" error={errors.rent_amount}>
          <MoneyInput id="rent_amount" name="rent_amount" suffix="/ month" defaultValue={defaultRent ?? ""} error={errors.rent_amount} />
        </Field>
        <Field label="Deposit held" htmlFor="deposit_held" optional hint="Tracked separately. Deposits never count toward the rent collection rate.">
          <MoneyInput id="deposit_held" name="deposit_held" aria-describedby="deposit_held-hint" />
        </Field>

        <fieldset className="flex flex-col gap-3 rounded-[16px] border border-line p-4">
          <legend className="px-1 text-[14px] font-semibold">Opening balance at a cut-off date</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Opening balance type">
            {(["none", "arrears", "credit"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={openingType === t}
                onClick={() => setOpeningType(t)}
                className={`min-h-11 rounded-full border-[1.5px] px-4 text-[14px] font-semibold ${openingType === t ? "border-ink bg-ink text-white" : "border-line"}`}
              >
                {t === "none" ? "None" : t === "arrears" ? "Tenant owes (arrears)" : "Tenant has credit"}
              </button>
            ))}
          </div>
          {openingType !== "none" ? (
            <>
              <Field label="Amount" htmlFor="opening_amount">
                <MoneyInput id="opening_amount" name="opening_amount" />
              </Field>
              <Field label="Cut-off date" htmlFor="opening_date" hint="The date this balance was true. Don't also import payments from before it.">
                <TextInput id="opening_date" name="opening_date" type="date" defaultValue={todayEAT()} aria-describedby="opening_date-hint" />
              </Field>
              <Field label="Explanation" htmlFor="opening_note" hint='For example "Arrears at 30 Sep from the old ledger".'>
                <TextArea id="opening_note" name="opening_note" maxLength={300} rows={2} aria-describedby="opening_note-hint" />
              </Field>
            </>
          ) : null}
        </fieldset>
        <Button type="submit" size="lg" pending={pending} pendingLabel="Saving">
          Save tenancy
        </Button>
      </form>
    </section>
  );
}

export function TenancyActions({ orgId, propertyId, tenancyId, currentRent }: { orgId: string; propertyId: string; tenancyId: string; currentRent: number | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "rent" | "end">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nextPeriod = addMonths(currentPeriod(), 1);

  if (!mode) {
    return (
      <div className="mt-4 flex flex-wrap gap-2 border-t border-divider pt-3">
        <Button variant="secondary" size="sm" onClick={() => setMode("rent")}>
          Change rent
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setMode("end")}>
          Tenant moving out
        </Button>
      </div>
    );
  }
  return (
    <form
      className="mt-4 flex flex-col gap-3 border-t border-divider pt-4"
      action={(fd) =>
        start(async () => {
          setError(null);
          const res =
            mode === "rent"
              ? await changeRent(orgId, propertyId, tenancyId, `${String(fd.get("effective"))}-01`, parseAmount(fd.get("amount")) ?? Number.NaN, String(fd.get("note") ?? ""))
              : await endTenancy(orgId, propertyId, tenancyId, String(fd.get("end_date")), String(fd.get("reason") ?? ""), String(fd.get("occupancy")));
          if (!res.ok) return setError(res.message);
          setMode(null);
          router.refresh();
        })
      }
    >
      {mode === "rent" ? (
        <>
          <p className="text-[14px] text-muted">Current rent: {formatMoney(currentRent)}. New rent applies from the first day of the chosen period; earlier charges keep the old rate.</p>
          <Field label="Applies from" htmlFor="effective">
            <TextInput id="effective" name="effective" type="month" defaultValue={nextPeriod.slice(0, 7)} />
          </Field>
          <Field label="New monthly rent" htmlFor="amount">
            <MoneyInput id="amount" name="amount" suffix="/ month" />
          </Field>
          <Field label="Note" htmlFor="note" optional>
            <TextInput id="note" name="note" maxLength={200} />
          </Field>
        </>
      ) : (
        <>
          <Notice tone="info">Ending the tenancy keeps its balance with this tenant. Nothing moves to the next tenant.</Notice>
          <Field label="Move-out date" htmlFor="end_date">
            <TextInput id="end_date" name="end_date" type="date" defaultValue={todayEAT()} />
          </Field>
          <Field label="Unit becomes" htmlFor="occupancy">
            <Select id="occupancy" name="occupancy" defaultValue="vacant">
              <option value="vacant">Vacant</option>
              <option value="reserved">Let / reserved</option>
              <option value="unavailable">Unavailable</option>
            </Select>
          </Field>
          <Field label="Reason" htmlFor="reason" optional>
            <TextInput id="reason" name="reason" maxLength={200} />
          </Field>
        </>
      )}
      {error ? <p role="alert" className="text-[14px] font-semibold text-error">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setMode(null)} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" pending={pending} variant={mode === "end" ? "dark" : "primary"} className="flex-1">
          {mode === "rent" ? "Save rent change" : "End tenancy"}
        </Button>
      </div>
    </form>
  );
}
