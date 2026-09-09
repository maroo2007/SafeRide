"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { submitContact } from "@/app/api/contact/submit";
import { contactSchema, type ContactValues } from "@/lib/contact-schema";

/**
 * §4.11 Contact — the page's primary conversion.
 *
 * ── Every field has a real label ──────────────────────────────────────────
 *
 * Not a placeholder standing in for one. A placeholder disappears the moment
 * someone types, so a half-filled form stops saying what its own boxes are;
 * it fails autofill, it fails anyone who tabs in from the keyboard and has to
 * remember what field four was, and it is the single most common accessibility
 * defect on a contact form. The labels are above the inputs and permanent, and
 * there are no placeholders at all on this form.
 *
 * ── Errors are announced, not just coloured ───────────────────────────────
 *
 * Each message is rendered next to its own input, tied to it by
 * aria-describedby, with aria-invalid set — so a screen reader hears the
 * field, its state and the reason together. The submit outcome goes to a live
 * region that is ALWAYS in the tree rather than one mounted on success: a
 * region that appears at the same moment as its text is a region a screen
 * reader may never announce.
 *
 * Validation runs on the client for speed and AGAIN in the server action,
 * from the same schema in lib/contact-schema.ts.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

const DETAILS: [string, string, string][] = [
  ["Email", "hello@saferide.app", "mailto:hello@saferide.app"],
  ["Phone", "+20 2 0000 0000", "tel:+20200000000"],
  ["Office", "Cairo, Egypt", ""],
];

const FIELDS: {
  name: keyof ContactValues;
  label: string;
  type: "text" | "email" | "textarea";
  autoComplete?: string;
}[] = [
  { name: "name", label: "Full name", type: "text", autoComplete: "name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "organization", label: "School / organization", type: "text", autoComplete: "organization" },
  { name: "message", label: "Message", type: "textarea" },
];

export function Contact() {
  const base = useId();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    /* Validate when a field is left, then live once it has an error. Validating
       on every keystroke from the start tells someone their email is invalid
       while they are still typing the first letter of it. */
    mode: "onTouched",
  });

  /*
   * Focus moves to the status region in an EFFECT, not in the submit handler.
   *
   * Partly because the lint rule against touching a ref during render is
   * right about the shape even when it is wrong about this call, and partly
   * because it is more correct: the message has to be in the DOM before focus
   * can land on it, and after the render that put it there is exactly when
   * that is true.
   */
  useEffect(() => {
    /* preventScroll: false, deliberately: the status sits at the top of the
       card and the submit button at the bottom, so on a long form the whole
       point is to bring the message into view. A focus that does not scroll
       here would announce an error the sender cannot see. */
    if (formError) statusRef.current?.focus({ preventScroll: false });
  }, [formError]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const res = await submitContact(values);
    if (res.ok) { setSent(true); return; }

    /* The server disagreed with the client. Put each message on its own field
       and move focus to the first one, so the reason is on screen and reachable
       rather than somewhere further up the page. */
    if (res.fieldErrors) {
      const keys = Object.keys(res.fieldErrors) as (keyof ContactValues)[];
      for (const k of keys) setError(k, { message: res.fieldErrors[k] });
      if (keys[0]) setFocus(keys[0]);
    }
    if (res.formError) setFormError(res.formError);
  });

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
      <dl className="space-y-6">
        {DETAILS.map(([label, value, href]) => (
          <div key={label}>
            <dt className="label-mono text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg">
              {href ? (
                <a
                  href={href}
                  className="rounded-sm underline decoration-border underline-offset-4 transition-colors duration-[--dur-micro] hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                >
                  {value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="rounded-brand border border-border p-6 sm:p-8">
        {/*
          ALWAYS IN THE TREE, both of them. The status region is what a screen
          reader announces on submit, and a live region that is created at the
          same moment as its content is frequently not announced at all — the
          same defect that was fixed in Coverage.
        */}
        <div
          ref={statusRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className={sent || formError ? "mb-6" : "sr-only"}
        >
          {sent ? (
            <p className="rounded-brand border border-success/40 bg-success/10 px-4 py-3 text-success">
              Thank you — your message has been received. We will be in touch shortly.
            </p>
          ) : formError ? (
            <p className="rounded-brand border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
              {formError}
            </p>
          ) : null}
        </div>

        {sent ? null : (
          /* noValidate: the browser's own bubbles cannot be styled, are not
             announced consistently, and would fire before the schema that
             actually defines what is valid here. */
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {FIELDS.map((f) => {
              const id = `${base}-${f.name}`;
              const errId = `${id}-error`;
              const err = errors[f.name]?.message;
              const shared = {
                id,
                "aria-invalid": err ? true : undefined,
                "aria-describedby": err ? errId : undefined,
                ...register(f.name),
                className:
                  "w-full rounded-brand border bg-background px-4 py-3 text-foreground " +
                  "transition-colors duration-[--dur-micro] motion-reduce:transition-none " +
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
                  (err ? "border-destructive" : "border-input hover:border-foreground/40"),
              };
              return (
                <div key={f.name}>
                  <label htmlFor={id} className="label-mono block text-muted-foreground">
                    {f.label}
                  </label>
                  <div className="mt-2">
                    {f.type === "textarea" ? (
                      <textarea {...shared} rows={5} />
                    ) : (
                      <input {...shared} type={f.type} autoComplete={f.autoComplete} />
                    )}
                  </div>
                  {/*
                    role="alert" so the message is spoken when it appears, and
                    tied to the input by id so it is also read as part of the
                    field when someone tabs back to it.
                  */}
                  {err ? (
                    <p id={errId} role="alert" className="mt-2 text-sm text-destructive">
                      {err}
                    </p>
                  ) : null}
                </div>
              );
            })}

            <Button type="submit" variant="cta" className="w-full sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send message"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
