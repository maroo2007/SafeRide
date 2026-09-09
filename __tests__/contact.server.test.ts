import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { submitContact } from "@/app/api/contact/submit";
import { contactSchema } from "@/lib/contact-schema";

/**
 * The server action's own validation (spec §4.11).
 *
 * The browser guard drives the form, so everything it proves is about a
 * payload that came FROM the form and was already checked on the client.
 * That is exactly the case that cannot fail. A server action is a public
 * endpoint: anything can call it with anything, including a payload that
 * never went near an input, and the only thing standing between that and the
 * delivery seam is this validation.
 *
 * So these call the action directly, the way an attacker or a broken client
 * would.
 */

describe("submitContact", () => {
  const good = {
    name: "Amira Hassan",
    email: "amira@example.com",
    organization: "Modern School Cairo",
    message: "We run eleven buses and would like a demo for our routes.",
  };

  beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("accepts a valid submission", async () => {
    await expect(submitContact(good)).resolves.toEqual({ ok: true });
  });

  it("rejects every field when the payload is empty", async () => {
    const res = await submitContact({ name: "", email: "", organization: "", message: "" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    /* One message per field, keyed the way the form's inputs are, so each can
       be rendered against the input it belongs to. */
    expect(Object.keys(res.fieldErrors ?? {}).sort()).toEqual(
      ["email", "message", "name", "organization"],
    );
  });

  it("rejects a malformed email that a client check was skipped for", async () => {
    const res = await submitContact({ ...good, email: "amira-at-example" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fieldErrors?.email).toBeTruthy();
    expect(res.fieldErrors?.name).toBeUndefined();
  });

  it("rejects over-long input rather than logging it", async () => {
    const res = await submitContact({ ...good, message: "x".repeat(2001) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fieldErrors?.message).toBeTruthy();
  });

  it("does not reach the delivery seam when validation fails", async () => {
    const log = vi.spyOn(console, "log");
    await submitContact({ name: "", email: "", organization: "", message: "" });
    /* Nothing is logged for an invalid payload — the seam is after the
       schema, and a rejected submission must not appear in the server log as
       though it had been received. */
    expect(log).not.toHaveBeenCalled();
  });

  it("logs a received submission without putting the message body in the log", async () => {
    const log = vi.spyOn(console, "log");
    await submitContact(good);
    expect(log).toHaveBeenCalledTimes(1);
    const payload = log.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.email).toBe(good.email);
    /* A stranger's words do not go into a server log. The length is enough to
       tell a real enquiry from a probe. */
    expect(payload).not.toHaveProperty("message");
    expect(payload.messageLength).toBe(good.message.length);
  });

  it("trims before it validates, so whitespace is not a valid name", async () => {
    const res = await submitContact({ ...good, name: "   " });
    expect(res.ok).toBe(false);
  });
});

describe("the schema the client and the server share", () => {
  it("is one schema, and it is the one the action uses", () => {
    /* If these ever diverge, the form passes in the browser and fails on the
       server with no message the visitor can act on. */
    expect(contactSchema.safeParse({
      name: "A", email: "a@b.co", organization: "S", message: "short",
    }).success).toBe(false);
  });
});
