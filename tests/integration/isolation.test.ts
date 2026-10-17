// End-to-end isolation through the real HTTP APIs (PostgREST + Storage) with real user
// sessions. Requires the local stack: `npx supabase start`, then `npm run test:integration`.
// Refuses to run against a non-local project.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
const SECRET = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL)) throw new Error("Integration tests only run against a local Supabase");

const run = Date.now().toString(36);
const PASSWORD = "integration-test-only";
const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

async function user(name: string) {
  const email = `${name}-${run}@integration.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (s.error) throw s.error;
  return { c, email };
}

let owner: SupabaseClient, manager: SupabaseClient, anon: SupabaseClient;
let org: string, prop1: string, prop2: string, entry2: string, path2: string, membership: string, entry1: string;

beforeAll(async () => {
  const o = await user("owner");
  const m = await user("manager");
  owner = o.c;
  manager = m.c;
  anon = createClient(URL, KEY, { auth: { persistSession: false } });

  org = (await owner.rpc("create_workspace", { p_name: `Isolation ${run}`, p_kind: "landlord" })).data as string;
  const props = await owner.from("properties").insert([{ org_id: org, name: "Assigned", area: "Ruaka" }, { org_id: org, name: "Unassigned", area: "Kilimani" }]).select("id, name");
  prop1 = props.data!.find((p) => p.name === "Assigned")!.id;
  prop2 = props.data!.find((p) => p.name === "Unassigned")!.id;
  const units = await owner.from("units").insert([{ org_id: org, property_id: prop1, label: "A1" }, { org_id: org, property_id: prop2, label: "B1" }]).select("id, property_id");
  const t1 = (await owner.rpc("create_tenancy", { p: { unit_id: units.data!.find((u) => u.property_id === prop1)!.id, tenant_name: "One", start_date: "2026-01-01", rent_amount: 10000 } })).data as string;
  const t2 = (await owner.rpc("create_tenancy", { p: { unit_id: units.data!.find((u) => u.property_id === prop2)!.id, tenant_name: "Two", start_date: "2026-01-01", rent_amount: 20000 } })).data as string;
  entry1 = ((await owner.rpc("save_payment_entry", { p: { client_request_id: crypto.randomUUID(), tenancy_id: t1, amount: 500, paid_on: "2026-09-01", allocations: [], action: "draft" } })).data as { id: string }).id;
  entry2 = ((await owner.rpc("save_payment_entry", { p: { client_request_id: crypto.randomUUID(), tenancy_id: t2, amount: 900, paid_on: "2026-09-01", allocations: [], action: "draft" } })).data as { id: string }).id;
  path2 = `${org}/${prop2}/${entry2}/receipt.png`;
  const up = await owner.storage.from("private-docs").upload(path2, new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), { contentType: "image/png" });
  if (up.error) throw up.error;
  const reg = await owner.rpc("register_attachment", { p: { entry_id: entry2, storage_path: path2, file_name: "receipt.png", mime_type: "image/png", size_bytes: 4 } });
  if (reg.error) throw reg.error;

  const inv = await owner.rpc("invite_member", { p_org: org, p: { display_name: "Manager", email: m.email, role: "manager", property_ids: [prop1], can_enter_payments: true, can_confirm: true, can_view_attachments: true } });
  const acc = await manager.rpc("accept_invitation", { p_token: (inv.data as { token: string }).token });
  if (acc.error) throw acc.error;
  membership = (inv.data as { membership_id: string }).membership_id;
}, 60_000);

describe("property isolation over the real APIs", () => {
  it("the owner can open the private receipt", async () => {
    const { data, error } = await owner.storage.from("private-docs").download(path2);
    expect(error).toBeNull();
    expect(data?.size).toBe(4);
  });

  it("an unassigned manager cannot open the receipt by its exact path", async () => {
    const dl = await manager.storage.from("private-docs").download(path2);
    expect(dl.data).toBeNull();
    const signed = await manager.storage.from("private-docs").createSignedUrl(path2, 60);
    expect(signed.data?.signedUrl).toBeFalsy();
    const list = await manager.storage.from("private-docs").list(`${org}/${prop2}/${entry2}`);
    expect(list.data ?? []).toHaveLength(0);
  });

  it("a signed-out visitor cannot open the receipt", async () => {
    const dl = await anon.storage.from("private-docs").download(path2);
    expect(dl.data).toBeNull();
  });

  it("direct API reads by id return nothing for another property", async () => {
    expect((await manager.from("payment_entries").select("id").eq("id", entry2)).data).toEqual([]);
    expect((await manager.from("attachments").select("id").eq("entry_id", entry2)).data).toEqual([]);
    expect((await manager.from("properties").select("id").eq("id", prop2)).data).toEqual([]);
    expect((await manager.rpc("rent_register", { p_property: prop2, p_period: "2026-09-01" })).data).toEqual([]);
  });

  it("the manager can work on the assigned property", async () => {
    expect((await manager.from("payment_entries").select("id").eq("id", entry1)).data).toHaveLength(1);
  });

  it("suspension blocks the very next request on the same session", async () => {
    const s = await owner.rpc("set_member_status", { p_membership: membership, p_status: "suspended" });
    expect(s.error).toBeNull();
    expect((await manager.from("payment_entries").select("id").eq("id", entry1)).data).toEqual([]);
    const write = await manager.rpc("save_payment_entry", { p: { client_request_id: crypto.randomUUID(), tenancy_id: "00000000-0000-0000-0000-000000000000", amount: 1, paid_on: "2026-09-01", allocations: [], action: "draft" } });
    expect(write.error).not.toBeNull();
  });
});
