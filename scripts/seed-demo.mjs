// Demo data for LOCAL development only. Creates fictional accounts and the blueprint's
// "Sunrise Apartments" worked example by calling the same RPCs the app uses, signed in as
// each person (so every permission check runs for real).
//
//   npx supabase start && npm run seed:demo
//
// Sign in locally with any demo email; the one-time code arrives in Mailpit
// (http://127.0.0.1:54324). Refuses to run against a non-local Supabase URL.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* use the process environment */
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !PUBLIC_KEY || !SECRET) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL)) throw new Error(`Refusing to seed a non-local project: ${URL}`);

// Local-only demo password, never used outside this machine's local Supabase.
const DEMO_PASSWORD = "nyumbani-local-demo";
const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

const PEOPLE = {
  admin: { email: "admin@nyumbani.test", name: "Platform Admin" },
  felix: { email: "felix@nyumbani.test", name: "Felix Muindi" },
  esther: { email: "esther@nyumbani.test", name: "Esther Wanjiku" },
  joseph: { email: "joseph@nyumbani.test", name: "Joseph Kamau" },
  ruth: { email: "ruth@nyumbani.test", name: "Ruth Achieng" },
  grace: { email: "grace@nyumbani.test", name: "Grace Wambui" },
  achieng: { email: "achieng@nyumbani.test", name: "Achieng Otieno" },
};

async function ensureUser({ email, name }) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users?.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  return data.user.id;
}

async function as(person) {
  const c = createClient(URL, PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: person.email, password: DEMO_PASSWORD });
  if (error) throw new Error(`${person.email}: ${error.message}`);
  return c;
}

function must(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

// --- tiny PNG generator for labelled placeholder photos (no image dependencies) ----------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function placeholderPng(seed, w = 960, h = 600) {
  const palettes = [
    [[226, 236, 240], [244, 238, 228], [143, 168, 184]],
    [[240, 232, 220], [250, 246, 240], [176, 150, 120]],
    [[222, 232, 226], [246, 248, 244], [130, 160, 150]],
  ];
  const [sky, wall, win] = palettes[seed % palettes.length];
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      let c = sky;
      const inBuilding = x > w * 0.18 && x < w * 0.82 && y > h * 0.22;
      if (inBuilding) {
        c = wall;
        const gx = (x - w * 0.18) % 90, gy = (y - h * 0.22) % 95;
        if (gx > 25 && gx < 70 && gy > 25 && gy < 70) c = win;
      }
      if (y > h * 0.9) c = [205, 200, 190];
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// --- dates relative to today (Africa/Nairobi) ------------------------------------------------
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
const period = `${today.slice(0, 7)}-01`;
const prev = (() => { const [y, m] = period.split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10); })();
const monthsBefore = (p, n) => { const [y, m] = p.split("-").map(Number); return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 10); };
const paidOn = (p, day) => { const d = `${p.slice(0, 8)}${String(day).padStart(2, "0")}`; return d > today ? today : d; };

async function main() {
  const ids = {};
  for (const [k, p] of Object.entries(PEOPLE)) ids[k] = await ensureUser(p);
  must("admin row", await admin.from("platform_admins").upsert({ user_id: ids.admin, role: "admin" }));
  must("alert email", await admin.from("app_settings").upsert({ key: "admin_alert_email", value: PEOPLE.admin.email }));

  const felix = await as(PEOPLE.felix);
  const existing = must("workspaces", await felix.rpc("my_workspaces"));
  if (existing.length) {
    console.log("Demo data already exists. Run `npx supabase db reset` first to start over.");
    return;
  }
  const org = must("workspace", await felix.rpc("create_workspace", { p_name: "Felix Properties", p_kind: "landlord", p_advertiser_role: "owner", p_phone: "0712000412" }));
  await felix.from("organizations").update({ usually_replies: "usually replies same day" }).eq("id", org);

  // Sunrise Apartments: 10 units, 9 tenancies at KSh 15,000 ----------------------------------
  const sunrise = must("sunrise", await felix.from("properties").insert({ org_id: org, name: "Sunrise Apartments", area: "Ruaka", town: "Ruaka", county: "Kiambu", road: "Limuru Rd", rent_due_day: 5, building_style: "apartment" }).select("id").single()).id;
  const labels = ["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3", "B4", "B5"];
  const units = must("units", await felix.from("units").insert(labels.map((label) => ({ org_id: org, property_id: sunrise, label, layout: "bedsitter_studio", default_rent: 15000, floor_level: label.startsWith("A") ? 0 : 1, facts: { private_bathroom: "yes", own_meter: "yes", parking: "unknown" } }))).select("id, label"));
  const unitId = Object.fromEntries(units.map((u) => [u.label, u.id]));
  const tenants = { A1: "Peter Mwangi", A2: "Grace Atieno", A3: "Daniel Kiprop", A4: "Lucy Njoki", B1: "Samuel Otieno", B2: "Faith Njeri", B3: "Kevin Mutua", B4: "Mercy Chebet", B5: "John Kamau" };
  const tenancy = {};
  for (const [label, name] of Object.entries(tenants)) {
    tenancy[label] = must(`tenancy ${label}`, await felix.rpc("create_tenancy", { p: { unit_id: unitId[label], tenant_name: name, start_date: "2025-03-01", rent_amount: 15000, due_day: 5 } }));
  }
  // Ten earlier months of history, so payment habits have something to show.
  const history = Array.from({ length: 10 }, (_, i) => monthsBefore(period, 11 - i));
  for (const p of history) must(`charges ${p}`, await felix.rpc("generate_rent_charges", { p_property: sunrise, p_period: p }));
  must("prev charges", await felix.rpc("generate_rent_charges", { p_property: sunrise, p_period: prev }));
  must("charges", await felix.rpc("generate_rent_charges", { p_property: sunrise, p_period: period }));
  const { data: charges } = await felix.from("rent_charges").select("id, tenancy_id, period_start").eq("property_id", sunrise);
  const chargeFor = (label, p) => charges.find((c) => c.tenancy_id === tenancy[label] && c.period_start === p).id;
  const pay = async (client, label, p, amount, day, action = "confirm", ref) =>
    must(`pay ${label}`, await client.rpc("save_payment_entry", { p: {
      client_request_id: crypto.randomUUID(), tenancy_id: tenancy[label], amount, paid_on: paidOn(p, day), method: "mpesa",
      reference: ref ?? `S${label}${p.slice(5, 7)}${Math.floor(amount / 1000)}K`, allocations: [{ charge_id: chargeFor(label, p), amount }],
      action, acknowledged: action === "confirm" } }));

  // The earlier months, by habit (day of the month each paid; rent is due on the 5th): Peter,
  // Lucy, Mercy and John always on time; Daniel and Samuel usually; Grace, Faith and Kevin often late.
  const days = {
    A1: [3, 2, 4, 3, 1, 3, 4, 2, 3, 3], A3: [4, 5, 3, 9, 4, 2, 5, 4, 3, 4], A4: [1, 2, 1, 3, 2, 1, 2, 4, 1, 2],
    B1: [5, 7, 4, 11, 3, 5, 8, 4, 5, 3], B4: [2, 3, 2, 4, 5, 3, 2, 1, 3, 4], B5: [5, 4, 5, 3, 5, 4, 5, 5, 4, 5],
    A2: [12, 4, 20, 9, 15, 3, 25, 8, 14, 4], B2: [15, 18, 9, 22, 12, 6, 16, 19, 11, 14], B3: [6, 3, 10, 4, 13, 2, 8, 5, 17, 9],
  };
  for (const [i, p] of history.entries()) for (const [label, d] of Object.entries(days)) await pay(felix, label, p, 15000, d[i]);

  // Previous month: everyone paid in full.
  for (const label of Object.keys(tenants)) await pay(felix, label, prev, 15000, 4);

  // Team: Esther (manager, confirms), Joseph (caretaker, submits), Ruth (accountant, view only)
  const invite = async (person, role, extra) => must(`invite ${person.email}`, await felix.rpc("invite_member", { p_org: org, p: { display_name: person.name, email: person.email, role, property_ids: [sunrise], ...extra } }));
  const inv = {
    esther: await invite(PEOPLE.esther, "manager", { can_enter_payments: true, can_confirm: true, can_correct: true, can_manage_tenancies: true, can_export: true, can_view_attachments: true, can_manage_listings: true }),
    joseph: await invite(PEOPLE.joseph, "caretaker", { can_enter_payments: true }),
    ruth: await invite(PEOPLE.ruth, "viewer", { all_properties: true, can_export: true, can_view_attachments: true }),
  };
  const esther = await as(PEOPLE.esther);
  const joseph = await as(PEOPLE.joseph);
  const ruth = await as(PEOPLE.ruth);
  must("accept esther", await esther.rpc("accept_invitation", { p_token: inv.esther.token }));
  must("accept joseph", await joseph.rpc("accept_invitation", { p_token: inv.joseph.token }));
  must("accept ruth", await ruth.rpc("accept_invitation", { p_token: inv.ruth.token }));

  // This month, the worked example: 6 paid, 2 partial, 1 unpaid with a pending caretaker entry.
  for (const label of ["A1", "A3", "A4", "B1", "B4", "B5"]) await pay(esther, label, period, 15000, 3);
  for (const label of ["A2", "B3"]) await pay(esther, label, period, 10000, 4);
  await pay(joseph, "B2", period, 10000, 6, "submit", "SJF2K7Q9PL");
  // A returned entry waiting on Joseph.
  const ret = await pay(joseph, "A2", period, 5000, 7, "submit", "SXX0000000");
  must("return", await esther.rpc("decide_entry", { p_entry: ret.id, p_decision: "return", p_reason: "Reference doesn't match the bank statement. Please check the date." }));

  // Example Court: listings for the marketplace ----------------------------------------------
  const court = must("court", await felix.from("properties").insert({ org_id: org, name: "Example Court", area: "Ruaka", town: "Ruaka", county: "Kiambu", road: "Banana Hill Rd", building_style: "apartment", viewing_address: "Example Court, Banana Hill Rd, gate 2", latitude: -1.2051, longitude: 36.7782 }).select("id").single()).id;
  const listingsSpec = [
    { label: "B4", layout: "bedsitter_studio", rent: 14000, title: "Bedsitter with private bathroom and balcony", floor: 3, facts: { private_bathroom: "yes", own_meter: "yes", balcony: "yes", lift: "no", parking: "unknown" }, charges: [{ kind: "service_charge", label: "Service charge (security, garbage)", amount: 1000, frequency: "monthly", billing: "fixed" }, { kind: "water", amount: null, frequency: "monthly", billing: "metered" }, { kind: "electricity", amount: null, frequency: "monthly", billing: "metered" }] },
    { label: "A2", layout: "bedsitter_studio", rent: 16000, title: "Large bedsitter with kitchenette", floor: 1, facts: { private_bathroom: "yes", balcony: "yes", borehole: "yes", parking: "no" }, charges: [{ kind: "service_charge", amount: null, frequency: "monthly", billing: "fixed" }] },
    { label: "C1", layout: "bedroom_home", bedrooms: 2, rent: 35000, title: "2-bedroom apartment, master en suite", floor: 2, facts: { private_bathroom: "yes", own_meter: "yes", parking: "yes", lift: "yes", balcony: "yes" }, charges: [{ kind: "service_charge", amount: 2000, frequency: "monthly", billing: "fixed" }, { kind: "water", amount: null, frequency: "monthly", billing: "metered" }] },
    { label: "G1", layout: "bedsitter_studio", rent: 11000, title: "Ground-floor bedsitter, own gate", floor: 0, facts: { private_bathroom: "yes", own_meter: "unknown", parking: "unknown" }, charges: [{ kind: "garbage", label: "Garbage and security", amount: 500, frequency: "monthly", billing: "fixed" }, { kind: "water", amount: null, frequency: "monthly", billing: "included" }] },
  ];
  let photoSeed = 0;
  for (const spec of listingsSpec) {
    const listingId = must("start listing", await felix.rpc("start_listing", { p: { org_id: org, property_id: court, unit_label: spec.label, layout: spec.layout, bedrooms: spec.bedrooms ?? null } }));
    const { data: l } = await felix.from("listings").select("unit_id").eq("id", listingId).single();
    must("unit facts", await felix.from("units").update({ facts: spec.facts, floor_level: spec.floor, size_sqm: spec.layout === "bedsitter_studio" ? 24 : 68, bathrooms: spec.bedrooms ? 2 : 1 }).eq("id", l.unit_id));
    must("listing", await felix.from("listings").update({ title: spec.title, rent_amount: spec.rent, deposit_months: 1, furnishing: "unfurnished", available_from: paidOn(period, 28), contact_call: true, contact_whatsapp: true, contact_phone: "0712000412", viewing_instructions: "Meet at the main gate and ask for the caretaker.", description: "Fictional demo listing. Quiet block, tarmac road, 5 minutes to Ruaka stage.", wizard_step: 6 }).eq("id", listingId));
    if (spec.charges.length) must("charges", await felix.from("listing_charges").insert(spec.charges.map((c, i) => ({ listing_id: listingId, position: i, compulsory: true, ...c }))));
    for (let i = 0; i < 4; i++) {
      const path = `${org}/${listingId}/demo-${i}.png`;
      const up = await felix.storage.from("listing-media").upload(path, placeholderPng(photoSeed++), { contentType: "image/png", upsert: false });
      if (up.error) throw new Error(`upload: ${up.error.message}`);
      must("photo row", await felix.from("listing_photos").insert({ listing_id: listingId, org_id: org, storage_path: path, position: i, is_cover: i === 0, media_label: "sample", alt_text: `Illustration ${i + 1} (sample image, not this unit)` }));
    }
    must("submit", await felix.rpc("submit_listing", { p_listing: listingId }));
  }

  // Platform admin publishes three and sends one back.
  const adminClient = await as(PEOPLE.admin);
  const queue = must("queue", await adminClient.rpc("admin_review_queue"));
  for (const [i, item] of queue.entries()) {
    must("review", await adminClient.rpc("admin_review_listing", { p_listing: item.id, p_decision: i === 3 ? "needs_correction" : "publish", p_note: i === 3 ? "Confirm whether the own-meter answer is correct and add a photo of the gate." : null }));
  }
  must("checks", await adminClient.rpc("admin_update_onboarding", { p_org: org, p_status: "approved", p_identity_checked: paidOn(prev, 2) }));

  // Grace: a single-home landlord with one listing awaiting review.
  const grace = await as(PEOPLE.grace);
  const gOrg = must("grace ws", await grace.rpc("create_workspace", { p_name: "Grace W.", p_kind: "landlord" }));
  must("grace listing", await grace.rpc("start_listing", { p: { org_id: gOrg, area: "Kilimani", road: "Argwings Kodhek", unit_label: "Main", layout: "bedroom_home", bedrooms: 1 } }));

  // Achieng: a tenant who enquired and requested a viewing.
  const achieng = await as(PEOPLE.achieng);
  const { data: pub } = await achieng.rpc("search_listings", { params: { q: "Ruaka" } });
  const target = pub.find((r) => r.title?.startsWith("Bedsitter with private"));
  if (target) {
    must("message", await achieng.rpc("start_conversation", { p_ref: target.ref, p_body: "Is the water included in the service charge?", p_client_ref: crypto.randomUUID() }));
    const when = new Date(Date.now() + 3 * 86400000);
    when.setUTCHours(7, 30, 0, 0);
    must("viewing", await achieng.rpc("request_viewing", { p_ref: target.ref, p_start: when.toISOString(), p_note: "Morning works best", p_client_ref: crypto.randomUUID() }));
  }

  console.log("Demo data ready.");
  console.log("Sign in at http://localhost:3200/sign-in with any of:", Object.values(PEOPLE).map((p) => p.email).join(", "));
  console.log("One-time codes arrive in Mailpit: http://127.0.0.1:54324");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
