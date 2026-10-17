// Turns database and network errors into plain-language messages. Our SQL functions raise
// errors whose message is already written for people (with a machine code in DETAIL);
// anything else gets a safe generic message so internals are never shown.

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; message: string; code?: string; fieldErrors?: Record<string, string> };

type DbError = { message?: string; details?: string | null; code?: string; hint?: string | null } | null | undefined;

const GENERIC = "Something went wrong and nothing was saved. Check your connection and try again.";

export function friendlyError(error: DbError): { message: string; code?: string } {
  if (!error) return { message: GENERIC };
  // P0001 = raised by our functions via app.raise_error
  if (error.code === "P0001" && error.message) return { message: error.message, code: error.details ?? undefined };
  if (error.code === "42501") return { message: "You do not have permission to do that.", code: "forbidden" };
  if (error.code === "23505") return { message: "This already exists. Reload to see the latest version.", code: "duplicate" };
  if (error.code === "23514") return { message: "One of the values isn't allowed. Check the form and try again.", code: "check" };
  if (error.code === "PGRST301" || error.code === "PGRST302") {
    return { message: "Your session has expired. Sign in again; your work on this page is kept.", code: "not_signed_in" };
  }
  return { message: GENERIC };
}

export function fail(error: DbError): { ok: false; message: string; code?: string } {
  const f = friendlyError(error);
  if (process.env.NODE_ENV !== "production" && error && error.code !== "P0001") {
    console.error("[db]", error);
  }
  return { ok: false, ...f };
}
