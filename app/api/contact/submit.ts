"use server";

import { contactSchema, type ContactResult, type ContactValues } from "@/lib/contact-schema";

/**
 * The contact form's server action (spec §4.11).
 *
 * ── It lives under /app/api even though it is not a route ─────────────────
 *
 * Because this is where the email integration will go, and the brief asked
 * for that seam to be findable in /app/api. A `route.ts` beside it would be a
 * second way in that nothing calls — dead code with a TODO on it, which is
 * worse than no code with a TODO on it. The form calls this directly; when
 * Resend or a CRM is wired, it is wired HERE and everything else is unchanged.
 *
 * ── Validated again, and not as a formality ───────────────────────────────
 *
 * The client validates with this same schema before it ever calls, which is
 * for the visitor's benefit. This validation is the actual check: a server
 * action is a public endpoint, and anything can post to it with any payload,
 * including one that never went near the form.
 */

/**
 * TODO — DELIVERY IS NOT WIRED. Nothing is sent anywhere.
 *
 * Today a valid submission is validated and written to the server log, and
 * the visitor is told it was received. That is a real gap and not a stub that
 * quietly works: a school that fills this in gets a success message and
 * nobody gets an email.
 *
 * When wiring it, the whole change belongs in the marked block below:
 *
 *   Resend      RESEND_API_KEY in the environment, `resend.emails.send(...)`
 *               to a monitored inbox, and the visitor's address in reply_to.
 *   A CRM       POST the same validated `data` to the intake endpoint.
 *
 * Whatever is chosen has to be able to FAIL: a transport error must come back
 * as { ok: false, formError } so the form says so, rather than being swallowed
 * into a success the sender believes. Logged in TODO.md.
 */
export async function submitContact(values: ContactValues): Promise<ContactResult> {
  const parsed = contactSchema.safeParse(values);

  if (!parsed.success) {
    /* Field-by-field, keyed the same way the form's inputs are, so each
       message can be rendered against the input it belongs to rather than
       dumped in a list at the top. */
    const fieldErrors: Partial<Record<keyof ContactValues, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ContactValues | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  /* ---- the delivery seam. Everything above is validation. ---------------- */
  try {
    /* TODO: send `data` here. See the block above. */
    console.log("[contact] submission received", {
      name: data.name,
      email: data.email,
      organization: data.organization,
      /* The message is logged by length rather than in full: it is a
         stranger's words in a server log, and the count is enough to tell a
         real enquiry from a probe. */
      messageLength: data.message.length,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[contact] delivery failed", err);
    return { ok: false, formError: "Something went wrong sending that. Please email saferidee1@gmail.com." };
  }

  return { ok: true };
}
