import { z } from "zod";

/**
 * The contact form's shape, in ONE place.
 *
 * The client validates with it so a visitor is told about a bad email before
 * a round trip, and the server action validates with it again because
 * client-side validation is a convenience and never a check — anything can
 * POST to a server action. Two schemas would be two chances to disagree, and
 * the disagreement would show up as a form that passes in the browser and
 * fails silently on the server.
 *
 * The messages are what the visitor reads, so they say what to do rather than
 * what went wrong: "Enter your full name", not "Invalid input".
 */
export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(100, "That is longer than 100 characters."),
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("That does not look like an email address.")
    .max(254, "That is longer than an email address can be."),
  organization: z
    .string()
    .trim()
    .min(2, "Enter your school or organisation.")
    .max(140, "That is longer than 140 characters."),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little about your fleet — at least 10 characters.")
    .max(2000, "That is longer than 2000 characters."),
});

export type ContactValues = z.infer<typeof contactSchema>;

/** What the server action hands back. A discriminated union so the form
 *  cannot read `fieldErrors` off a success. */
export type ContactResult =
  | { ok: true }
  | { ok: false; formError?: string; fieldErrors?: Partial<Record<keyof ContactValues, string>> };
