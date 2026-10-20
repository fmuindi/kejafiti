import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { roleHome } from "@/lib/role-home";

// Landing step after sign-in when no specific page was waiting.
export default async function ContinueAfterSignIn() {
  await requireUser("/auth/continue");
  redirect(await roleHome());
}
