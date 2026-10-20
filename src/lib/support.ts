// Support request vocabulary shared by the help pages and the admin queue (IMP-19).

export const SUPPORT_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "account", label: "Signing in or my account" },
  { value: "listing", label: "A listing (mine or one I saw)" },
  { value: "viewing_or_message", label: "A viewing or a message" },
  { value: "rent_records", label: "Rent records or reports" },
  { value: "team", label: "My team and access" },
  { value: "other", label: "Something else" },
];

export const SUPPORT_STATUS: Record<string, { label: string; tone: "waiting" | "success" | "neutral" | "error" }> = {
  open: { label: "Open · waiting for support", tone: "waiting" },
  in_progress: { label: "Support is working on it", tone: "waiting" },
  waiting_on_you: { label: "Waiting for your reply", tone: "error" },
  resolved: { label: "Resolved", tone: "success" },
};

export const categoryLabel = (v: string) => SUPPORT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
