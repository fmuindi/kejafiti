"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { saveCosts, saveDetails, saveHome, saveLocation, submitListing } from "@/app/w/[orgId]/listings/actions";
import { Checkbox, ChoiceChips, Field, MoneyInput, Select, TextArea, TextInput, textInputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { PlaceAutocomplete } from "@/components/ui/place-autocomplete";
import { Button, Notice, cx } from "@/components/ui/primitives";
import { EDITABLE_FACTS, STYLE_LABEL } from "@/lib/listing/catalog";
import { CHARGE_LABEL, computeCosts, type ListingCharge } from "@/lib/listing/costs";
import { formatAmount, parseAmount } from "@/lib/money";
import { DescribeHelper } from "./describe-helper";
import { PhotoStep, type WizardPhoto } from "./photo-step";

type FactValue = "yes" | "no" | "unknown";

export type WizardData = {
  orgId: string;
  listingId: string;
  ref: string;
  status: string;
  reviewNote: string | null;
  canEditBuilding: boolean;
  placesEnabled: boolean;
  /** AI-04 "Help me describe this home" is available. */
  aiDraft: boolean;
  location: { area: string; town: string; county: string; road: string; landmark: string; viewing_address: string; unit_label: string; property_name: string; latitude: number | null; longitude: number | null };
  home: {
    rental_scope: "entire_home" | "private_room" | "shared_room" | "bedspace";
    layout: "single_room" | "double_room" | "multiroom" | "bedsitter_studio" | "bedroom_home";
    bedrooms: number | null;
    bathrooms: number | null;
    floor_level: number | null;
    size_sqm: number | null;
    building_style: "apartment" | "bungalow" | "maisonette" | "townhouse" | "terraced_house" | "villa" | "mansion" | "cottage" | "farmhouse" | "other" | null;
    origin: "dsq" | "guest_wing" | "conversion" | null;
    furnishing: "unfurnished" | "partly" | "fully" | null;
    student: boolean;
    facts: Record<string, FactValue>;
  };
  costs: {
    rent_amount: number | null;
    price_period: "month" | "week" | "night" | "semester";
    price_basis: "entire_unit" | "per_person" | "per_bed" | "per_room";
    deposit_months: number | null;
    deposit_amount: number | null;
    charges: ListingCharge[];
  };
  photos: WizardPhoto[];
  details: {
    title: string;
    description: string;
    available_from: string | null;
    contact_call: boolean;
    contact_whatsapp: boolean;
    contact_phone: string;
    viewing_instructions: string;
    house_rules: string;
  };
  /** Review checklist from listing_problem_items: required items block submission. */
  issues: Array<{ code: string; message: string; step: number; field: string; required: boolean }>;
};

const STEPS = ["Location", "Home", "Costs", "Photos", "Availability", "Review"];
type SaveState = "idle" | "saving" | "saved" | "failed" | "offline";

/** Debounced autosave: shows Saving, Saved, Failed or Offline draft truthfully. */
function useAutosave<T>(value: T, save: (v: T) => Promise<{ ok: boolean; message?: string }>, enabled: boolean) {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  // Compare by content, not identity: objects are rebuilt on every render.
  const key = JSON.stringify(value);
  const run = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState("offline");
      return false;
    }
    setState("saving");
    try {
      const r = await save(latest.current);
      setState(r.ok ? "saved" : "failed");
      setError(r.ok ? null : (r.message ?? "Not saved."));
      return r.ok;
    } catch {
      setState("failed");
      setError("Not saved. Check your connection.");
      return false;
    }
  }, [save]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!enabled) return;
    const t = setTimeout(() => void run(), 1200);
    return () => clearTimeout(t);
  }, [key, enabled, run]);
  return { state, error, saveNow: run };
}

function SaveBadge({ state }: { state: SaveState }) {
  const text = { idle: "", saving: "Saving…", saved: "Draft saved", failed: "Not saved", offline: "Offline: not saved yet" }[state];
  return (
    <p aria-live="polite" className={cx("inline-flex items-center gap-1 text-[0.8125rem] font-semibold", state === "saved" ? "text-success" : state === "failed" || state === "offline" ? "text-error" : "text-muted")}>
      {state === "saved" ? <Icon name="check" size={15} strokeWidth={2.4} /> : null}
      {text}
    </p>
  );
}

export function Wizard({ data, step, focus, fromReview = false }: { data: WizardData; step: number; focus?: string; fromReview?: boolean }) {
  const router = useRouter();
  const base = `/w/${data.orgId}/listings/${data.listingId}`;
  const go = (s: number) => router.push(`${base}?step=${s}`, { scroll: true });
  // Arriving from a review checklist link: focus the field that fixes it (IMP-13).
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      const el = document.getElementById(focus);
      el?.scrollIntoView({ block: "center" });
      el?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [focus, step]);
  const review = fromReview ? () => go(6) : undefined;

  return (
    <div className="flex flex-col gap-5">
      {data.status === "published" ? (
        <Notice tone="info" title="This listing is live">
          Rent, charges, features and dates update straight away. Changes to the title, description, contact details, viewing
          instructions or house rules, and new photos, are checked first; the listing is hidden from search until they are.
        </Notice>
      ) : null}
      {data.status === "needs_correction" && data.reviewNote ? (
        <Notice tone="waiting" title="Our team asked for a correction">&quot;{data.reviewNote}&quot; Fix it, then submit again.</Notice>
      ) : null}
      <nav aria-label="Listing steps">
        <p className="font-mono text-[0.75rem] tracking-[0.6px] text-muted uppercase">
          Step {step} of 6 · {STEPS[step - 1]}
        </p>
        <ol className="mt-2 grid grid-cols-6 gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s}>
              <Link href={`${base}?step=${i + 1}`} aria-current={i + 1 === step ? "step" : undefined} className="block py-2" aria-label={`Step ${i + 1}: ${s}`}>
                <span className={cx("block h-1.5 rounded-full", i + 1 <= step ? "bg-success" : "bg-divider")} />
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      {step === 1 ? <LocationStep data={data} onNext={() => go(2)} /> : null}
      {step === 2 ? <HomeStep data={data} onBack={() => go(1)} onNext={() => go(3)} /> : null}
      {step === 3 ? <CostsStep data={data} onBack={() => go(2)} onNext={() => go(4)} onReview={review} /> : null}
      {step === 4 ? <PhotoStep orgId={data.orgId} listingId={data.listingId} unitLabel={data.location.unit_label} initial={data.photos} onBack={() => go(3)} onNext={() => go(5)} onReview={review} /> : null}
      {step === 5 ? <DetailsStep data={data} onBack={() => go(4)} onNext={() => go(6)} onReview={review} /> : null}
      {step === 6 ? <ReviewStep data={data} onBack={() => go(5)} /> : null}
    </div>
  );
}

function StepNav({ onBack, onNext, onReview, nextLabel, pending, state }: { onBack?: () => void; onNext: () => void; onReview?: () => void; nextLabel: string; pending?: boolean; state?: SaveState }) {
  return (
    <div className="safe-bottom sticky bottom-[58px] -mx-4 flex flex-col gap-2 border-t border-line bg-cream px-4 pt-3 md:static md:mx-0 md:border-0 md:p-0">
      {state ? <SaveBadge state={state} /> : null}
      <div className="flex gap-3">
        {onBack ? (
          <Button type="button" variant="secondary" size="lg" onClick={onBack} className="flex-1">
            Back
          </Button>
        ) : null}
        <Button type="button" size="lg" pending={pending} onClick={onNext} className="flex-[1.6]">
          {nextLabel}
        </Button>
      </div>
      {onReview ? (
        <Button type="button" variant="dark" size="lg" onClick={onReview}>
          Save and back to review
        </Button>
      ) : null}
      <p className="text-[0.78125rem] text-muted">You can leave and continue later. Publishing is always a separate final step.</p>
    </div>
  );
}

// 1. Location ------------------------------------------------------------------------------
function LocationStep({ data, onNext }: { data: WizardData; onNext: () => void }) {
  const [v, setV] = useState(data.location);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useCallback(async (x: typeof v) => {
    const r = await saveLocation(data.orgId, data.listingId, x);
    if (!r.ok) setErrors(r.fieldErrors ?? {});
    else setErrors({});
    return r;
  }, [data.orgId, data.listingId]);
  const { state, saveNow } = useAutosave(v, save, true);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <section aria-labelledby="s1" className="flex flex-col gap-4">
      <h1 id="s1" className="font-display text-[1.625rem] leading-[1.1] font-bold tracking-[-0.5px]">Where is the home?</h1>
      <p className="-mt-2 text-[0.90625rem] text-muted">Tenants see the area and a nearby landmark. The exact address is shared only after a viewing is confirmed.</p>
      {!data.canEditBuilding ? <Notice tone="info">Building details are managed by the workspace owner. You can edit the unit reference.</Notice> : null}
      <Field label="Area or estate" htmlFor="area" error={errors.area} hint={data.placesEnabled ? "Start typing and pick the estate, road or building to fill in the details below." : undefined}>
        <PlaceAutocomplete
          id="area"
          enabled={data.placesEnabled}
          value={v.area}
          // Typed text no longer matches the pinned place, so drop its coordinates.
          onChange={(area) => setV((x) => ({ ...x, area, latitude: null, longitude: null }))}
          onPlace={(p) => {
            if (!p) return;
            // A new place replaces the old address; only a landmark the advertiser typed survives.
            setV((x) => ({
              ...x,
              area: p.area || x.area,
              town: p.town,
              county: p.county,
              road: p.road,
              landmark: p.landmark || x.landmark,
              latitude: p.latitude,
              longitude: p.longitude,
            }));
          }}
          fallback={["Ruaka", "Kilimani", "Kileleshwa", "Lavington", "Westlands", "Kasarani", "Juja", "Syokimau", "Rongai", "Embakasi", "Ngong", "Thika"]}
          disabled={!data.canEditBuilding}
          aria-invalid={errors.area ? true : undefined}
          className={textInputClass(errors.area)}
        />
      </Field>
      {v.latitude !== null && v.longitude !== null ? (
        <p className="-mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-success">
          <Icon name="pin" size={15} /> Location pinned on the map
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Town" htmlFor="town" optional>
          <TextInput id="town" value={v.town} onChange={set("town")} disabled={!data.canEditBuilding} />
        </Field>
        <Field label="County" htmlFor="county" optional>
          <TextInput id="county" value={v.county} onChange={set("county")} disabled={!data.canEditBuilding} />
        </Field>
      </div>
      <Field label="Road" htmlFor="road" optional>
        <TextInput id="road" value={v.road} onChange={set("road")} disabled={!data.canEditBuilding} />
      </Field>
      <Field label="Nearby landmark" htmlFor="landmark" optional hint="For example a school, stage or shopping centre.">
        <TextInput id="landmark" value={v.landmark} onChange={set("landmark")} disabled={!data.canEditBuilding} />
      </Field>
      <Field label="Exact address for confirmed viewings" htmlFor="viewing_address" optional hint="Private. Shown only to tenants with a confirmed viewing.">
        <TextArea id="viewing_address" rows={2} value={v.viewing_address} onChange={set("viewing_address")} disabled={!data.canEditBuilding} />
      </Field>
      <Field label="Unit reference" htmlFor="unit_label" error={errors.unit_label} hint="How you refer to this unit, for example B4 or Main house.">
        <TextInput id="unit_label" value={v.unit_label} onChange={set("unit_label")} error={errors.unit_label} />
      </Field>
      <StepNav state={state} nextLabel="Continue to home details" onNext={async () => { if (await saveNow()) onNext(); }} />
    </section>
  );
}

// 2. Home ----------------------------------------------------------------------------------
function HomeStep({ data, onBack, onNext }: { data: WizardData; onBack: () => void; onNext: () => void }) {
  const [v, setV] = useState(data.home);
  const [msg, setMsg] = useState<string | null>(null);
  const save = useCallback(async (x: typeof v) => {
    const r = await saveHome(data.orgId, data.listingId, x);
    setMsg(r.ok ? null : r.message);
    return r;
  }, [data.orgId, data.listingId]);
  const { state, saveNow } = useAutosave(v, save, true);
  const num = (s: string) => (s === "" ? null : Number(s));
  return (
    <section aria-labelledby="s2" className="flex flex-col gap-5">
      <h1 id="s2" className="font-display text-[1.625rem] leading-[1.1] font-bold tracking-[-0.5px]">What is being rented?</h1>
      {msg ? <Notice tone="error" role="alert">{msg}</Notice> : null}
      <ChoiceChips name="scope" legend="Tenants rent" value={v.rental_scope} onChange={(x) => setV({ ...v, rental_scope: x as typeof v.rental_scope })}
        options={[{ value: "entire_home", label: "The entire home" }, { value: "private_room", label: "A private room" }, { value: "shared_room", label: "A shared room" }, { value: "bedspace", label: "A bed (bedspace)" }]} />
      <ChoiceChips name="layout" legend="Layout" value={v.layout} onChange={(x) => setV({ ...v, layout: x as typeof v.layout })}
        options={[{ value: "single_room", label: "Single room" }, { value: "double_room", label: "Double room (two rooms)" }, { value: "bedsitter_studio", label: "Bedsitter / studio" }, { value: "bedroom_home", label: "Home with bedrooms" }, { value: "multiroom", label: "Other multi-room" }]}
        hint="A bedsitter or studio has one main room with its own cooking area and bathroom. A curtain or light partition doesn't make a bedroom." />
      {v.layout === "bedroom_home" ? (
        <Field label="Separate bedrooms" htmlFor="bedrooms" hint="Count only enclosed bedrooms. Staff quarters (DSQ) are separate.">
          <TextInput id="bedrooms" type="number" min={1} max={30} inputMode="numeric" value={v.bedrooms ?? ""} onChange={(e) => setV({ ...v, bedrooms: num(e.target.value) })} />
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bathrooms" htmlFor="bathrooms" optional>
          <TextInput id="bathrooms" type="number" min={0} inputMode="numeric" value={v.bathrooms ?? ""} onChange={(e) => setV({ ...v, bathrooms: num(e.target.value) })} />
        </Field>
        <Field label="Floor" htmlFor="floor" optional hint="0 = ground floor">
          <TextInput id="floor" type="number" min={-5} max={100} inputMode="numeric" value={v.floor_level ?? ""} onChange={(e) => setV({ ...v, floor_level: num(e.target.value) })} />
        </Field>
        <Field label="Size (m²)" htmlFor="size" optional hint="Owner-reported">
          <TextInput id="size" type="number" min={1} inputMode="decimal" value={v.size_sqm ?? ""} onChange={(e) => setV({ ...v, size_sqm: num(e.target.value) })} />
        </Field>
      </div>
      <Field label="Building style" htmlFor="style" optional>
        <Select id="style" value={v.building_style ?? ""} onChange={(e) => setV({ ...v, building_style: (e.target.value || null) as typeof v.building_style })}>
          <option value="">Not specified</option>
          {Object.entries(STYLE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select>
      </Field>
      <Checkbox checked={v.origin === "dsq"} onChange={(e) => setV({ ...v, origin: e.target.checked ? "dsq" : null })} label="This is a staff quarter (SQ/DSQ) or guest wing" />
      <ChoiceChips name="furnishing" legend="Furnishing" value={v.furnishing ?? ""} onChange={(x) => setV({ ...v, furnishing: (x || null) as typeof v.furnishing })}
        options={[{ value: "unfurnished", label: "Unfurnished" }, { value: "partly", label: "Partly furnished" }, { value: "fully", label: "Furnished" }]} />
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[0.875rem] font-semibold">Facts tenants filter by</legend>
        <p className="mb-2 text-[0.8125rem] text-muted">Answer Yes, No or Not sure. &quot;Not sure&quot; is shown as Unknown; it never counts as Yes.</p>
        <div className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
          {EDITABLE_FACTS.map((f) => (
            <div key={f.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5" role="radiogroup" aria-label={f.label}>
              <span className="text-[0.90625rem]">{f.label}</span>
              <span className="flex gap-1">
                {(["yes", "no", "unknown"] as const).map((val) => {
                  const on = (v.facts[f.key] ?? "unknown") === val;
                  return (
                    <button key={val} type="button" role="radio" aria-checked={on} onClick={() => setV({ ...v, facts: { ...v.facts, [f.key]: val } })}
                      className={cx("min-h-10 rounded-full border-[1.5px] px-3 text-[0.8125rem] font-semibold", on ? "border-ink bg-ink text-white" : "border-line")}>
                      {val === "yes" ? "Yes" : val === "no" ? "No" : "Not sure"}
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      </fieldset>
      <Checkbox checked={v.student} onChange={(e) => setV({ ...v, student: e.target.checked })} label="Suitable for students" description="Shows the home under Student accommodation too. No duplicate listing is created." />
      <StepNav state={state} onBack={onBack} nextLabel="Continue to costs" onNext={async () => { if (await saveNow()) onNext(); }} />
    </section>
  );
}

// 3. Costs ---------------------------------------------------------------------------------
const OTHER_KINDS = ["garbage", "security", "internet", "parking", "utility_deposit", "other_deposit", "agency_fee", "other"] as const;

function CostsStep({ data, onBack, onNext, onReview }: { data: WizardData; onBack: () => void; onNext: () => void; onReview?: () => void }) {
  const initService = data.costs.charges.find((c) => c.kind === "service_charge");
  const initWater = data.costs.charges.find((c) => c.kind === "water");
  const initPower = data.costs.charges.find((c) => c.kind === "electricity");
  const [rent, setRent] = useState(data.costs.rent_amount ? String(data.costs.rent_amount) : "");
  const [period, setPeriod] = useState(data.costs.price_period);
  const [basis, setBasis] = useState(data.costs.price_basis);
  const [serviceMode, setServiceMode] = useState<"none" | "on_top" | "included" | "unknown">(initService ? (initService.billing === "included" ? "included" : initService.amount === null ? "unknown" : "on_top") : "none");
  const [service, setService] = useState(initService?.amount ? String(initService.amount) : "");
  const [deposit, setDeposit] = useState<string>(data.costs.deposit_amount !== null ? "other" : data.costs.deposit_months !== null ? String(data.costs.deposit_months) : "1");
  const [depositAmount, setDepositAmount] = useState(data.costs.deposit_amount !== null ? String(data.costs.deposit_amount) : "");
  const [water, setWater] = useState<"metered" | "included" | "unknown">((initWater?.billing as "metered" | "included" | "unknown") ?? "unknown");
  const [power, setPower] = useState<"metered" | "included" | "unknown">((initPower?.billing as "metered" | "included" | "unknown") ?? "unknown");
  const [others, setOthers] = useState<ListingCharge[]>(data.costs.charges.filter((c) => !["service_charge", "water", "electricity"].includes(c.kind)));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rentNum = parseAmount(rent);
  const serviceNum = parseAmount(service);
  const charges: ListingCharge[] = [
    ...(serviceMode === "none" ? [] : [{ kind: "service_charge" as const, label: null, amount: serviceMode === "on_top" && serviceNum !== null && Number.isFinite(serviceNum) ? serviceNum : null, frequency: "monthly" as const, billing: (serviceMode === "included" ? "included" : "fixed") as ListingCharge["billing"], compulsory: true }]),
    { kind: "water", label: null, amount: null, frequency: "monthly", billing: water, compulsory: true },
    { kind: "electricity", label: null, amount: null, frequency: "monthly", billing: power, compulsory: true },
    ...others,
  ];
  const depositMonths = deposit === "other" ? null : Number(deposit);
  const depositAmt = deposit === "other" ? parseAmount(depositAmount) : null;
  const summary = computeCosts({ rent: rentNum && Number.isFinite(rentNum) ? rentNum : null, depositMonths, depositAmount: depositAmt && Number.isFinite(depositAmt) ? depositAmt : deposit === "other" ? null : null, charges, pricePeriod: period });

  const payload = { rent_amount: rentNum && Number.isFinite(rentNum) ? rentNum : null, price_period: period, price_basis: basis, deposit_months: depositMonths, deposit_amount: deposit === "other" && depositAmt !== null && Number.isFinite(depositAmt) ? depositAmt : null, charges };
  const save = useCallback(async (x: typeof payload) => saveCosts(data.orgId, data.listingId, x), [data.orgId, data.listingId]);
  const { state, saveNow } = useAutosave(payload, save, true);

  function validate() {
    const e: Record<string, string> = {};
    if (!rentNum || !Number.isFinite(rentNum)) e.rent = `Enter the rent in KES per ${period}.`;
    if (serviceMode === "on_top" && (serviceNum === null || !Number.isFinite(serviceNum))) e.service = "Enter the monthly service charge in KES, or choose Not sure.";
    if (deposit === "other" && (depositAmt === null || !Number.isFinite(depositAmt))) e.deposit = "Enter the deposit amount in KES, or 0 if there is none.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <section aria-labelledby="s3" className="flex flex-col gap-5">
      <h1 id="s3" className="font-display text-[1.625rem] leading-[1.1] font-bold tracking-[-0.5px]">What will the tenant pay?</h1>
      <p className="-mt-2 text-[0.90625rem] text-muted">Tenants see these exact figures. Listings with complete costs get more serious enquiries.</p>
      <Field label="Rent" htmlFor="rent" error={errors.rent}>
        <MoneyInput id="rent" currency="KES" suffix={`/ ${period}`} value={rent} onChange={(e) => setRent(e.target.value)} error={errors.rent} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rent period" htmlFor="period">
          <Select id="period" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="month">Per month</option>
            <option value="semester">Per semester</option>
            <option value="week">Per week</option>
            <option value="night">Per night</option>
          </Select>
        </Field>
        <Field label="Price covers" htmlFor="basis">
          <Select id="basis" value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)}>
            <option value="entire_unit">The whole unit</option>
            <option value="per_person">Per person</option>
            <option value="per_bed">Per bed</option>
            <option value="per_room">Per room</option>
          </Select>
        </Field>
      </div>
      <ChoiceChips name="service" legend="Service charge" value={serviceMode} onChange={(x) => setServiceMode(x as typeof serviceMode)}
        options={[{ value: "none", label: "None" }, { value: "on_top", label: "Paid on top" }, { value: "included", label: "Included in rent" }, { value: "unknown", label: "Not sure yet" }]}
        error={serviceMode === "unknown" ? "Tenants will see \"Service charge not confirmed\" and an incomplete total." : undefined} />
      {serviceMode === "on_top" ? (
        <Field label="Service charge amount" htmlFor="service_amt" error={errors.service}>
          <MoneyInput id="service_amt" currency="KES" suffix="/ month" value={service} onChange={(e) => setService(e.target.value)} error={errors.service} />
        </Field>
      ) : null}
      <Field label="Rent deposit" htmlFor="deposit" error={errors.deposit}>
        <Select id="deposit" value={deposit} onChange={(e) => setDeposit(e.target.value)}>
          <option value="0">No deposit</option>
          <option value="1">1 month&apos;s rent{rentNum ? ` (KES ${formatAmount(rentNum)})` : ""}</option>
          <option value="2">2 months&apos; rent</option>
          <option value="3">3 months&apos; rent</option>
          <option value="other">Other amount</option>
        </Select>
      </Field>
      {deposit === "other" ? (
        <Field label="Deposit amount" htmlFor="deposit_amt">
          <MoneyInput id="deposit_amt" currency="KES" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
        </Field>
      ) : null}
      <ChoiceChips name="water" legend="Water" value={water} onChange={(x) => setWater(x as typeof water)} options={[{ value: "metered", label: "Metered, paid separately" }, { value: "included", label: "Included" }, { value: "unknown", label: "Not sure" }]} />
      <ChoiceChips name="power" legend="Electricity" value={power} onChange={(x) => setPower(x as typeof power)} options={[{ value: "metered", label: "Own token meter / paid separately" }, { value: "included", label: "Included" }, { value: "unknown", label: "Not sure" }]} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[0.875rem] font-semibold">Other compulsory charges <span className="font-normal text-muted">(optional)</span></legend>
        {others.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-[14px] border border-line bg-surface p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
            <Select aria-label="Charge type" value={c.kind} onChange={(e) => setOthers(others.map((o, j) => (j === i ? { ...o, kind: e.target.value as ListingCharge["kind"] } : o)))}>
              {OTHER_KINDS.map((k) => <option key={k} value={k}>{CHARGE_LABEL[k]}</option>)}
            </Select>
            <MoneyInput aria-label="Amount" currency="KES" value={c.amount ?? ""} onChange={(e) => { const n = parseAmount(e.target.value); setOthers(others.map((o, j) => (j === i ? { ...o, amount: n !== null && Number.isFinite(n) ? n : null } : o))); }} className="min-h-[50px]" />
            <Select aria-label="How often" value={c.frequency} onChange={(e) => setOthers(others.map((o, j) => (j === i ? { ...o, frequency: e.target.value as ListingCharge["frequency"] } : o)))}>
              <option value="monthly">Every month</option>
              <option value="one_off">Once, at move-in</option>
            </Select>
            <button type="button" aria-label="Remove charge" onClick={() => setOthers(others.filter((_, j) => j !== i))} className="grid size-11 place-items-center rounded-full hover:bg-cool">
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
        <Button type="button" variant="secondary" icon="plus" onClick={() => setOthers([...others, { kind: "garbage", label: null, amount: null, frequency: "monthly", billing: "fixed", compulsory: true }])} className="self-start">
          Add a charge
        </Button>
        <p className="text-[0.78125rem] text-muted">Leave an amount empty if you don&apos;t know it yet; tenants will see &quot;Charge not confirmed&quot;.</p>
      </fieldset>

      <div className="rounded-[16px] bg-ink p-4 text-white" aria-live="polite">
        <p className="text-[0.8125rem] text-white/75">Tenants will see</p>
        <p className="mt-1 font-display text-[1.375rem] font-extrabold">
          {period === "month"
            ? `KES ${formatAmount(summary.fixedMonthly)} /mo · move-in ${formatAmount(summary.moveIn)}`
            : `KES ${formatAmount(rentNum ?? 0)} / ${period} · no monthly or move-in total`}
        </p>
        {period !== "month" ? <p className="mt-1 text-[0.8125rem] text-white/75">Rent per {period} isn&apos;t converted to months, so tenants see the rent and monthly charges separately.</p> : null}
        {!summary.complete ? <p className="mt-1 text-[0.8125rem] font-semibold text-[#ffd59a]">Total incomplete: a charge is not confirmed.</p> : null}
      </div>
      <StepNav state={state} onBack={onBack} nextLabel="Continue to photos" onNext={async () => { if (validate() && (await saveNow())) onNext(); }}
        onReview={onReview ? async () => { if (validate() && (await saveNow())) onReview(); } : undefined} />
    </section>
  );
}

// 5. Availability and contact ------------------------------------------------------------
function DetailsStep({ data, onBack, onNext, onReview }: { data: WizardData; onBack: () => void; onNext: () => void; onReview?: () => void }) {
  const [v, setV] = useState(data.details);
  const save = useCallback(async (x: typeof v) => saveDetails(data.orgId, data.listingId, x), [data.orgId, data.listingId]);
  const { state, saveNow } = useAutosave(v, save, true);
  return (
    <section aria-labelledby="s5" className="flex flex-col gap-4">
      <h1 id="s5" className="font-display text-[1.625rem] leading-[1.1] font-bold tracking-[-0.5px]">Availability and contact</h1>
      <Field label="Available from" htmlFor="available_from">
        <TextInput id="available_from" type="date" value={v.available_from ?? ""} onChange={(e) => setV({ ...v, available_from: e.target.value || null })} />
      </Field>
      <Field label="Short title" htmlFor="title" hint='Layout, a key feature and the area, e.g. "Bedsitter with private bathroom, Ruaka".'>
        <TextInput id="title" value={v.title} maxLength={140} onChange={(e) => setV({ ...v, title: e.target.value })} />
      </Field>
      <Field label="Description" htmlFor="description" optional>
        <TextArea id="description" rows={4} value={v.description} maxLength={4000} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      {data.aiDraft ? <DescribeHelper orgId={data.orgId} listingId={data.listingId} onApply={(d) => setV({ ...v, title: d.title || v.title, description: d.description })} /> : null}
      <fieldset id="contact" tabIndex={-1} className="flex flex-col gap-2 rounded-[12px] focus:ring-2 focus:ring-deep/40 focus:outline-none">
        <legend className="mb-1 text-[0.875rem] font-semibold">How tenants can reach you</legend>
        <p className="text-[0.8125rem] text-muted">In-app messages are always on. Calls and WhatsApp happen outside nyumbani.</p>
        <Checkbox checked={v.contact_call} onChange={(e) => setV({ ...v, contact_call: e.target.checked })} label="Phone calls" />
        <Checkbox checked={v.contact_whatsapp} onChange={(e) => setV({ ...v, contact_whatsapp: e.target.checked })} label="WhatsApp" />
      </fieldset>
      {v.contact_call || v.contact_whatsapp ? (
        <Field label="Number tenants should use" htmlFor="contact_phone" hint="Shown on the listing. Don't use a staff member's personal number without their agreement.">
          <TextInput id="contact_phone" type="tel" value={v.contact_phone} onChange={(e) => setV({ ...v, contact_phone: e.target.value })} />
        </Field>
      ) : null}
      <Field label="Meeting instructions for confirmed viewings" htmlFor="viewing_instructions" optional hint="Shared only after you confirm a viewing.">
        <TextArea id="viewing_instructions" rows={2} value={v.viewing_instructions} onChange={(e) => setV({ ...v, viewing_instructions: e.target.value })} />
      </Field>
      <Field label="House rules" htmlFor="house_rules" optional>
        <TextArea id="house_rules" rows={3} value={v.house_rules} onChange={(e) => setV({ ...v, house_rules: e.target.value })} />
      </Field>
      <StepNav state={state} onBack={onBack} nextLabel="Review" onNext={async () => { if (await saveNow()) onNext(); }}
        onReview={onReview ? async () => { if (await saveNow()) onReview(); } : undefined} />
    </section>
  );
}

// 6. Review --------------------------------------------------------------------------------
function ReviewStep({ data, onBack }: { data: WizardData; onBack: () => void }) {
  const base = `/w/${data.orgId}/listings/${data.listingId}`;
  const required = data.issues.filter((i) => i.required);
  const suggestions = data.issues.filter((i) => !i.required);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const c = computeCosts({ rent: data.costs.rent_amount, depositAmount: data.costs.deposit_amount, depositMonths: data.costs.deposit_months, charges: data.costs.charges, pricePeriod: data.costs.price_period });
  const canSubmit = ["draft", "needs_correction"].includes(data.status);
  if (done) {
    return (
      <Notice tone="success" role="status" title="Submitted for review">
        Our team checks new listings before they go live. You&apos;ll get a notification when it&apos;s published or if anything needs a correction.
      </Notice>
    );
  }
  return (
    <section aria-labelledby="s6" className="flex flex-col gap-4">
      <h1 id="s6" className="font-display text-[1.625rem] leading-[1.1] font-bold tracking-[-0.5px]">Review and submit</h1>
      {required.length ? (
        <Notice tone="waiting" title="Finish these before submitting">
          <ul className="list-disc pl-5">
            {required.map((p) => (
              <li key={p.code}>
                <Link href={`${base}?step=${p.step}&focus=${p.field}&from=review`} className="font-semibold underline">{p.message}</Link>
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {suggestions.length ? (
        <Notice tone="info" title="Suggestions (optional)">
          <ul className="list-disc pl-5">
            {suggestions.map((p) => (
              <li key={p.code}>
                <Link href={`${base}?step=${p.step}&focus=${p.field}&from=review`} className="underline">{p.message}</Link>
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <dl className="flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface px-4">
        {[
          ["Title", data.details.title || "Not set"],
          ["Area", [data.location.area, data.location.road].filter(Boolean).join(", ") || "Not set"],
          ["Unit", data.location.unit_label],
          ["Monthly total", data.costs.rent_amount === null ? "Rent not set" : c.fixedMonthly === null ? `Priced per ${data.costs.price_period}, no monthly total` : `KES ${formatAmount(c.fixedMonthly)}${c.complete ? "" : " (incomplete)"}`],
          ["Move-in total", c.moveIn === null ? "—" : `KES ${formatAmount(c.moveIn)}`],
          ["Photos", `${data.photos.length}`],
          ["Available from", data.details.available_from ?? "Not set"],
        ].map(([k, val]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5 text-[0.90625rem]">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-semibold">{val}</dd>
          </div>
        ))}
      </dl>
      <Link href={`/homes/${data.ref}`} className="inline-flex items-center gap-1 font-semibold text-primary underline" target="_blank">
        Preview the tenant page <Icon name="arrowRight" size={16} />
      </Link>
      <p className="text-[0.8125rem] text-muted">
        By submitting you confirm the details are accurate and you are authorised to advertise this home. Listing is free; nothing is charged.
      </p>
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      <div className="flex gap-3">
        <Button variant="secondary" size="lg" onClick={onBack} className="flex-1">Back</Button>
        {canSubmit ? (
          <Button size="lg" className="flex-[1.6]" pending={pending} pendingLabel="Submitting" disabled={required.length > 0}
            onClick={() => start(async () => {
              const r = await submitListing(data.orgId, data.listingId);
              if (!r.ok) return setError(r.message);
              setDone(true);
              router.refresh();
            })}>
            Submit for review
          </Button>
        ) : (
          <Button size="lg" className="flex-[1.6]" onClick={() => router.push(`/w/${data.orgId}`)}>Done</Button>
        )}
      </div>
    </section>
  );
}
