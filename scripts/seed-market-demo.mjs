// Demo marketplace for LOCAL development only: ~55 published listings modelled on the
// researched market-rate dataset (real areas, rents, layouts and charges), advertised by
// fictional agents and landlords with .test emails and dummy phone numbers, illustrated with
// labelled sample images. Listings go through the same RPCs as the app (start, submit, admin
// review), so every check runs for real.
//
//   npx supabase start && npm run seed:market-demo
//
// Safe to run after seed:demo; refuses to run twice. Refuses a non-local Supabase URL.

import { readFileSync } from "node:fs";
import { as, ensureAdmin, ensureUser, must, sampleImage, ADMIN_PERSON } from "./lib/demo.mjs";

const DATASET = "data/market-rates/2026-11/listings.json";

// Fictional advertisers. Phone numbers are dummies for local testing only.
const ADVERTISERS = [
  { key: "jacaranda", email: "jacaranda@nyumbani.test", name: "Jacaranda Homes (demo)", kind: "agency", role: "agent", phone: "0700000101", replies: "usually replies within an hour" },
  { key: "mvule", email: "mvule@nyumbani.test", name: "Mvule Lettings (demo)", kind: "agency", role: "agent", phone: "0700000102", replies: "usually replies same day" },
  { key: "baraka", email: "baraka@nyumbani.test", name: "Baraka Property Managers (demo)", kind: "agency", role: "property_manager", phone: "0700000103", replies: "usually replies same day" },
  { key: "wanjiru", email: "wanjiru@nyumbani.test", name: "Wanjiru Homes (demo)", kind: "landlord", role: "owner", phone: "0700000104", replies: "usually replies same day" },
  { key: "otieno", email: "otieno@nyumbani.test", name: "Otieno Rentals (demo)", kind: "landlord", role: "owner", phone: "0700000105", replies: "usually replies within a day" },
  { key: "kariuki", email: "kariuki@nyumbani.test", name: "Kariuki Residences (demo)", kind: "landlord", role: "owner", phone: "0700000106", replies: "usually replies same day" },
];
const BY_ROLE = { agent: ["jacaranda", "mvule"], property_manager: ["baraka"], owner: ["wanjiru", "otieno", "kariuki"] };

// How many listings of each home type, picked round-robin across areas (or styles for houses).
const QUOTA = { bedsitter_studio: 10, "1_bedroom": 10, "2_bedrooms": 10, "3_plus_bedrooms": 12, single_room: 8, double_room: 2 };
const NAMES = ["Acacia", "Baobab", "Cedar", "Jacaranda", "Mvule", "Mugumo", "Nandi Flame", "Olive", "Palm", "Sunbird", "Kei Apple", "Croton", "Bamboo", "Cypress"];
const ONE_OFF = new Set(["agency_fee", "viewing_fee", "utility_deposit", "other_deposit"]);
const STYLE_WORD = { apartment: "apartment", maisonette: "maisonette", bungalow: "bungalow", townhouse: "townhouse", terraced_house: "terraced house", villa: "villa", mansion: "house", cottage: "cottage", farmhouse: "farmhouse", other: "house" };

function roundRobin(rows, groupOf, n) {
  const groups = new Map();
  for (const r of rows) {
    const g = groupOf(r);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const out = [];
  const lists = [...groups.values()];
  for (let i = 0; out.length < n && lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i] && out.length < n) out.push(l[i]);
  return out;
}

function pick(rows) {
  rows = [...rows].sort((a, b) => a.source_url.localeCompare(b.source_url));
  const chosen = [];
  for (const [type, n] of Object.entries(QUOTA)) {
    const pool = rows.filter((r) => r.home_type === type);
    chosen.push(...roundRobin(pool, (r) => (type === "3_plus_bedrooms" ? r.building_style : r.area), n));
  }
  // Always include the DSQs and guest wings, so the SQ / DSQ category isn't empty.
  for (const r of rows) if (r.origin && !chosen.includes(r)) chosen.push(r);
  return chosen;
}

function title(r) {
  const where = `in ${r.area}`;
  if (r.origin === "dsq") return `DSQ ${r.layout === "bedroom_home" ? `${r.bedrooms}-bedroom ` : ""}${where}`;
  if (r.origin === "guest_wing") return `${r.bedrooms ? `${r.bedrooms}-bedroom ` : ""}guest wing ${where}`;
  if (r.layout === "single_room") {
    const kind = r.rental_scope === "shared_room" ? "Shared room" : r.rental_scope === "bedspace" ? "Bedspace" : "Single room";
    return `${r.student ? "Student " + kind.toLowerCase() : kind} ${where}`;
  }
  if (r.layout === "double_room") return `Double room (room and parlour) ${where}`;
  const furnished = r.furnishing === "fully" ? "Furnished " : "";
  if (r.layout === "bedsitter_studio") return `${furnished ? "Furnished studio" : "Bedsitter"} ${where}`;
  const style = STYLE_WORD[r.building_style] ?? "home";
  return `${furnished}${r.bedrooms}-bedroom ${style} ${where}`;
}

function imageKind(r) {
  if (r.origin) return "bungalow";
  if (["single_room", "double_room"].includes(r.layout) && r.building_style !== "apartment") return "rooms";
  if (["maisonette", "townhouse", "terraced_house", "villa", "mansion"].includes(r.building_style)) return "house";
  if (["bungalow", "cottage", "farmhouse"].includes(r.building_style)) return "bungalow";
  if (r.building_style === "other") return "rooms";
  return "apartment";
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
const daysFromToday = (n) => new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);

async function main() {
  const rows = pick(JSON.parse(readFileSync(DATASET, "utf8")));
  await ensureAdmin();

  const clients = {}, orgs = {};
  for (const a of ADVERTISERS) {
    await ensureUser(a);
    clients[a.key] = await as(a);
    const existing = must("workspaces", await clients[a.key].rpc("my_workspaces"));
    if (existing.length) {
      console.log("Market demo listings already exist. Run `npx supabase db reset` first to start over.");
      return;
    }
    orgs[a.key] = must(`workspace ${a.key}`, await clients[a.key].rpc("create_workspace", { p_name: a.name, p_kind: a.kind, p_advertiser_role: a.role, p_phone: a.phone }));
    must("replies", await clients[a.key].from("organizations").update({ usually_replies: a.replies }).eq("id", orgs[a.key]));
  }

  const created = [];
  const turn = { agent: 0, property_manager: 0, owner: 0 };
  let seed = 0;
  for (const [i, r] of rows.entries()) {
    const role = BY_ROLE[r.advertiser_role] ? r.advertiser_role : "owner";
    const key = BY_ROLE[role][turn[role]++ % BY_ROLE[role].length];
    const adv = ADVERTISERS.find((a) => a.key === key);
    const c = clients[adv.key], org = orgs[adv.key];

    const style = r.building_style ?? "apartment";
    const name = `${NAMES[i % NAMES.length]} ${style === "apartment" ? "Apartments" : style === "other" ? "Court" : "Homes"} (demo)`;
    const property = must("property", await c.from("properties").insert({ org_id: org, name, area: r.area, town: r.town, county: r.county, road: r.road, building_style: style }).select("id").single()).id;
    const listingId = must("start listing", await c.rpc("start_listing", { p: { org_id: org, property_id: property, unit_label: "Main", layout: r.layout, rental_scope: r.rental_scope, bedrooms: r.layout === "bedroom_home" ? r.bedrooms : null, copy_from: "none" } }));
    const { data: l } = await c.from("listings").select("unit_id").eq("id", listingId).single();
    must("unit", await c.from("units").update({ building_style: style, origin: r.origin, bathrooms: r.bathrooms, size_sqm: r.size_sqm, facts: r.facts ?? {} }).eq("id", l.unit_id));
    must("listing", await c.from("listings").update({
      title: title(r),
      description: `Fictional demo listing. The rent, charges and layout are modelled on current asking rents in ${r.area}, ${r.town ?? r.county} (November 2026 market survey). The advertiser, phone number and photos are made up.`,
      rent_amount: r.rent_amount, price_period: r.price_period, price_basis: r.price_basis,
      deposit_months: r.deposit_months ?? (r.price_period === "semester" ? 0 : 1),
      furnishing: r.furnishing ?? "unfurnished", student: r.student,
      available_from: daysFromToday((i * 3) % 28), contact_call: true, contact_whatsapp: true, contact_phone: adv.phone,
      viewing_instructions: "Call or WhatsApp to book a time; the caretaker will meet you at the gate.", wizard_step: 6,
    }).eq("id", listingId));
    const charges = (r.charges ?? []).map((ch, pos) => ({
      listing_id: listingId, position: pos, compulsory: true, kind: ch.kind, label: ch.label ?? null, amount: ch.amount ?? null,
      billing: ch.billing, frequency: ONE_OFF.has(ch.kind) ? "one_off" : "monthly",
    }));
    if (charges.length) must("charges", await c.from("listing_charges").insert(charges));
    const kind = imageKind(r);
    for (let shot = 0; shot < 4; shot++) {
      const path = `${org}/${listingId}/sample-${shot}.png`;
      const up = await c.storage.from("listing-media").upload(path, sampleImage(kind, shot, seed++), { contentType: "image/png", upsert: false });
      if (up.error) throw new Error(`upload: ${up.error.message}`);
      must("photo row", await c.from("listing_photos").insert({ listing_id: listingId, org_id: org, storage_path: path, position: shot, is_cover: shot === 0, media_label: "sample", alt_text: `Illustration ${shot + 1} (sample image, not this unit)` }));
    }
    must(`submit ${title(r)}`, await c.rpc("submit_listing", { p_listing: listingId }));
    created.push(listingId);
  }

  const adminClient = await as(ADMIN_PERSON);
  for (const id of created) must("publish", await adminClient.rpc("admin_review_listing", { p_listing: id, p_decision: "publish", p_note: null }));
  for (const org of Object.values(orgs)) must("onboarding", await adminClient.rpc("admin_update_onboarding", { p_org: org, p_status: "approved", p_identity_checked: today }));

  const byType = rows.reduce((a, r) => ((a[r.home_type] = (a[r.home_type] ?? 0) + 1), a), {});
  console.log(`Published ${created.length} demo listings:`, byType);
  console.log("Browse them logged out at http://localhost:3200/search");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
