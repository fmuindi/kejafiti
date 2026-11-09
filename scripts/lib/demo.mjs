// Shared helpers for the LOCAL demo seed scripts: env loading, signed-in clients and a tiny
// PNG painter for labelled sample illustrations (no image dependencies).

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
export const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
export const ADMIN_PERSON = { email: "admin@nyumbani.test", name: "Platform Admin" };

export async function ensureUser({ email, name }) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users?.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  return data.user.id;
}

export async function ensureAdmin() {
  const id = await ensureUser(ADMIN_PERSON);
  must("admin row", await admin.from("platform_admins").upsert({ user_id: id, role: "admin" }));
  must("alert email", await admin.from("app_settings").upsert({ key: "admin_alert_email", value: ADMIN_PERSON.email }));
  return id;
}

export async function as(person) {
  const c = createClient(URL, PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: person.email, password: DEMO_PASSWORD });
  if (error) throw new Error(`${person.email}: ${error.message}`);
  return c;
}

export function must(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

// --- PNG encoding -----------------------------------------------------------------------------
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

// A minimal RGB canvas: rectangles and gable roofs are all the illustrations need.
export function canvas(w, h, bg) {
  const px = Buffer.alloc(w * h * 3);
  const set = (x, y, c) => { const o = (y * w + x) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; };
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(h, Math.round(y1)); y++)
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(w, Math.round(x1)); x++) set(x, y, c);
  };
  // Isosceles triangle with its apex at (cx, top) and base from x0 to x1 at y = base.
  const roof = (x0, x1, top, base, c) => {
    const cx = (x0 + x1) / 2;
    for (let y = Math.max(0, Math.round(top)); y < Math.min(h, Math.round(base)); y++) {
      const t = (y - top) / (base - top), half = ((x1 - x0) / 2) * t;
      for (let x = Math.max(0, Math.round(cx - half)); x < Math.min(w, Math.round(cx + half)); x++) set(x, y, c);
    }
  };
  rect(0, 0, w, h, bg);
  const png = () => {
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  };
  return { w, h, rect, roof, png };
}

const PALETTES = [
  { sky: [226, 236, 240], wall: [244, 238, 228], trim: [143, 168, 184], roof: [150, 95, 80] },
  { sky: [240, 232, 220], wall: [250, 246, 240], trim: [176, 150, 120], roof: [110, 110, 115] },
  { sky: [222, 232, 226], wall: [246, 248, 244], trim: [130, 160, 150], roof: [160, 110, 85] },
  { sky: [232, 228, 240], wall: [238, 232, 222], trim: [150, 140, 170], roof: [95, 105, 120] },
];

// The original apartment-block illustration used by the first demo seed.
export function placeholderPng(seed, w = 960, h = 600) {
  return sampleImage("apartment", 0, seed, w, h);
}

// Labelled sample illustrations: an exterior that matches the building style, then interiors.
// kind: apartment | house (2 storeys) | bungalow (1 storey) | rooms (row of single rooms)
export function sampleImage(kind, shot, seed, w = 960, h = 600) {
  const p = PALETTES[seed % PALETTES.length];
  const c = canvas(w, h, p.sky);
  const ground = [205, 200, 190];
  if (shot === 0 || shot === 3) {
    const grass = shot === 3 ? [180, 200, 165] : ground;
    if (kind === "apartment") {
      const x0 = w * (shot === 3 ? 0.08 : 0.18), x1 = w * (shot === 3 ? 0.62 : 0.82);
      c.rect(x0, h * 0.22, x1, h, p.wall);
      for (let x = x0 + 25; x + 45 < x1; x += 90) for (let y = h * 0.22 + 25; y + 45 < h * 0.9; y += 95) c.rect(x, y, x + 45, y + 45, p.trim);
      if (shot === 3) c.rect(w * 0.68, h * 0.5, w * 0.92, h, p.wall);
    } else if (kind === "house" || kind === "bungalow") {
      const top = kind === "house" ? h * 0.38 : h * 0.55, x0 = w * 0.16, x1 = w * 0.84;
      c.roof(x0 - 30, x1 + 30, top - h * 0.2, top, p.roof);
      c.rect(x0, top, x1, h * 0.9, p.wall);
      const rows = kind === "house" ? [top + 30, top + (h * 0.9 - top) / 2 + 10] : [top + 30];
      for (const y of rows) for (let x = x0 + 40; x + 70 < x1; x += 130) c.rect(x, y, x + 70, y + 55, p.trim);
      c.rect(w * 0.47, h * 0.9 - 110, w * 0.53, h * 0.9, p.roof);
    } else {
      for (let i = 0; i < 5; i++) {
        const x0 = w * 0.06 + i * w * 0.18;
        c.rect(x0, h * 0.5, x0 + w * 0.16, h * 0.9, p.wall);
        c.rect(x0 + w * 0.05, h * 0.62, x0 + w * 0.11, h * 0.9, p.trim);
      }
      c.rect(w * 0.04, h * 0.46, w * 0.96, h * 0.5, p.roof);
    }
    c.rect(0, h * 0.9, w, h, grass);
  } else {
    // Interiors: wall, floor, a window and one piece of furniture.
    const floor = shot === 1 ? [190, 165, 135] : [215, 205, 190];
    c.rect(0, 0, w, h, p.wall);
    c.rect(0, h * 0.68, w, h, floor);
    c.rect(w * 0.58, h * 0.14, w * 0.86, h * 0.5, p.sky);
    c.rect(w * 0.715, h * 0.14, w * 0.725, h * 0.5, p.trim);
    if (shot === 1) {
      c.rect(w * 0.1, h * 0.5, w * 0.48, h * 0.62, p.trim);
      c.rect(w * 0.1, h * 0.62, w * 0.48, h * 0.76, p.trim.map((v) => v - 25));
    } else {
      c.rect(w * 0.08, h * 0.56, w * 0.5, h * 0.8, [245, 245, 245]);
      c.rect(w * 0.08, h * 0.46, w * 0.13, h * 0.8, p.roof);
    }
  }
  return c.png();
}
