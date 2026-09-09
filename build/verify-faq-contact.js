/**
 * FAQ and Contact — the parts that are behaviour, not markup (§4.10, §4.11).
 *
 * Everything here is asserted by DRIVING the component and reading what
 * happened. A markup check would pass on an accordion whose arrow keys do
 * nothing, on a plus icon that never rotates, and on a form whose errors are
 * rendered but never associated with an input — all three are defects you
 * cannot see in the HTML, and two of them are invisible to a sighted mouse
 * user as well.
 *
 * The one thing checked from source rather than behaviour is that the answers
 * are in the SERVER's HTML, because that is a claim about a moment the
 * browser has already passed by the time it can be asked.
 *
 * Usage: node build/verify-faq-contact.js <profile> [--port=] [--w=1440]
 */
const { spawn } = require("child_process");
const http = require("http");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2];
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith("--" + k + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const BASE = arg("url", "http://localhost:3100/");
const PORT0 = +arg("port", 9930);
const VW = +arg("w", 1440), VH = +arg("h", 900);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getRaw = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(d)); }).on("error", rej));

const fails = [];
const check = (name, ok, detail = "") => {
  console.log("   " + (ok ? "PASS" : "FAIL") + "  " + name + (detail ? "   " + detail : ""));
  if (!ok) fails.push(name);
};

let seq = 0;
async function session({ reduced } = {}) {
  const port = PORT0 + seq++;
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=" + port, "--user-data-dir=" + P + "-" + port,
    "--window-size=" + VW + "," + VH, "about:blank"], { stdio: "ignore" });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(500);
    try { t = JSON.parse(await getRaw("http://127.0.0.1:" + port + "/json/list")).find((x) => x.type === "page"); } catch {}
  }
  if (!t) throw new Error("verify-faq-contact: no debugger target on " + port);
  const WebSocket = require("ws");
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2 ** 28 });
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pend = new Map();
  ws.on("message", (m) => { const x = JSON.parse(m.toString()); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async (e) => {
    const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      throw new Error("in-page: " + JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails));
    }
    return r.result?.result?.value;
  };
  /* Real key events through the input pipeline, not element.focus() and a
     synthetic KeyboardEvent — the point is that a keyboard works, and a
     dispatched event proves only that a handler exists. */
  const key = async (k, code, windowsVirtualKeyCode) => {
    /*
     * Enter carries a carriage return as its text and Space carries a space. A key dispatched with
     * no text arrives as rawKeyDown, which moves focus and fires handlers but
     * does NOT activate a button — so an Enter sent that way reported "Enter
     * does not toggle" on a component where Enter works perfectly in a real
     * browser. Keys that are not text (arrows, Home, End, Escape) must stay
     * rawKeyDown, or they generate spurious input.
     */
    const text = k === "Enter" ? "\r" : (k.length === 1 ? k : undefined);
    await send("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      key: k, code, windowsVirtualKeyCode, text,
      unmodifiedText: text,
    });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode });
    await sleep(200);
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: BASE });
  for (let i = 0; i < 120; i++) {
    if (await ev("!document.querySelector('[data-load-screen]')")) break;
    await sleep(500);
  }
  await sleep(800);
  return { ev, send, key, close: () => { ws.close(); ch.kill(); } };
}

const KEYS = {
  ArrowDown: ["ArrowDown", "ArrowDown", 40],
  ArrowUp: ["ArrowUp", "ArrowUp", 38],
  Home: ["Home", "Home", 36],
  End: ["End", "End", 35],
  Escape: ["Escape", "Escape", 27],
  Enter: ["Enter", "Enter", 13],
  Space: [" ", "Space", 32],
};

(async () => {
  console.log("\n  FAQ AND CONTACT — " + BASE + "   " + VW + "x" + VH + "\n");

  /* ---- the answers exist before JavaScript ---------------------------- */
  const html = await getRaw(BASE);
  console.log("   THE ANSWERS ARE IN THE DOCUMENT, OPEN OR NOT");
  const answers = [
    "encrypted mathematical embedding",
    "every 10-15 seconds",
    "cached on the device",
    "school ERPs and classroom platforms",
    "emergency operator simultaneously",
    "onboarding period",
    "Full English and Arabic today",
  ];
  const missing = answers.filter((a) => !html.includes(a));
  check("all seven answers are server-rendered while collapsed", missing.length === 0,
    missing.length ? "missing: " + missing.join(" | ") : "7 of 7 in the initial HTML");
  check("every panel is a labelled region and every trigger owns one",
    (html.match(/role="region"/g) || []).length === 7
    && (html.match(/aria-controls="/g) || []).length >= 7,
    (html.match(/role="region"/g) || []).length + " regions");

  const s = await session();

  /* ---- one open at a time, and the icon ------------------------------- */
  console.log("\n   OPENING AND CLOSING");
  const faqState = () => s.ev(`JSON.stringify((() => {
    const t = [...document.querySelectorAll('#faq button[aria-expanded]')];
    return {
      expanded: t.map((b) => b.getAttribute('aria-expanded')),
      rotation: t.map((b) => {
        const m = new DOMMatrixReadOnly(getComputedStyle(b.querySelector('svg')).transform);
        return Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI);
      }),
      rows: t.map((b) => {
        const panel = document.getElementById(b.getAttribute('aria-controls'));
        return getComputedStyle(panel.parentElement.parentElement).gridTemplateRows;
      }),
      inert: t.map((b) => document.getElementById(b.getAttribute('aria-controls')).hasAttribute('inert')),
      focused: document.activeElement ? document.activeElement.textContent.slice(0, 24) : null
    };
  })())`);

  /*
   * Click, then confirm it took, then try once more if it did not.
   *
   * On a server that has just restarted, the first request compiles and the
   * page is painted before React has hydrated — the markup is all there and
   * the buttons do nothing yet. That produced three red checks on a build
   * that passes every time on a warm server, which is a flaky guard and
   * therefore a useless one. The retry is bounded, and a click that never
   * takes still fails.
   */
  const clickTrigger = async (i) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const was = JSON.parse(await faqState()).expanded[i];
      await s.ev(`(() => {
        const t = [...document.querySelectorAll('#faq button[aria-expanded]')];
        t[${i}].scrollIntoView({ block: 'center' }); t[${i}].click(); return 1; })()`);
      await sleep(500);
      if (JSON.parse(await faqState()).expanded[i] !== was) return;
    }
  };

  await clickTrigger(0);
  let st = JSON.parse(await faqState());
  check("clicking a question opens it", st.expanded[0] === "true", "expanded: " + st.expanded.join(","));
  check("its plus rotates to 45 degrees", st.rotation[0] === 45, "rotations: " + st.rotation.join(","));
  check("its panel leaves the inert state", st.inert[0] === false, "inert: " + st.inert.join(","));

  await clickTrigger(2);
  st = JSON.parse(await faqState());
  check("opening a second question closes the first — one at a time",
    st.expanded[0] === "false" && st.expanded[2] === "true", "expanded: " + st.expanded.join(","));
  check("the closed one's plus returns to 0 degrees", st.rotation[0] === 0, "rotations: " + st.rotation.join(","));
  check("every collapsed panel is inert (out of tab order and out of the a11y tree)",
    st.inert.filter((x) => x === true).length === 6 && st.inert[2] === false,
    st.inert.map((x, i) => i + (x ? ":inert" : ":live")).join(" "));
  check("collapsed panels are collapsed by grid rows, not by display:none",
    st.rows.every((r) => r !== "none") && st.rows[2] !== st.rows[0],
    "open=" + st.rows[2] + "  closed=" + st.rows[0]);

  /* ---- the keyboard --------------------------------------------------- */
  console.log("\n   THE KEYBOARD");
  const focusTrigger = (i) => s.ev(`(() => {
    const t = [...document.querySelectorAll('#faq button[aria-expanded]')];
    t[${i}].focus(); return document.activeElement === t[${i}]; })()`);
  const focusedIndex = () => s.ev(`(() => {
    const t = [...document.querySelectorAll('#faq button[aria-expanded]')];
    return t.indexOf(document.activeElement); })()`);

  /*
   * EVERY ONE OF THESE STARTS SOMEWHERE THE ANSWER IS NOT.
   *
   * The first version focused trigger 0 and then asserted that ArrowUp landed
   * on 0 and that Home landed on 0. Both passed with the key handler deleted
   * entirely — focus had never left 0, so "it did not move" and "it moved to
   * where it already was" are the same reading. Proved by removing the
   * handler and watching two checks stay green while three went red.
   *
   * So each assertion now begins on a different index from the one it expects,
   * and the starting position is verified before the key is sent.
   */
  const startAt = async (i) => {
    await focusTrigger(i);
    const at = await focusedIndex();
    if (at !== i) throw new Error("verify-faq-contact: could not put focus on trigger " + i + " (got " + at + ")");
  };

  await startAt(0);
  await s.key(...KEYS.ArrowDown);
  check("ArrowDown moves to the next question", (await focusedIndex()) === 1, "index " + (await focusedIndex()));

  await startAt(3);
  await s.key(...KEYS.ArrowUp);
  check("ArrowUp moves back one", (await focusedIndex()) === 2, "from 3, index " + (await focusedIndex()));

  await startAt(0);
  await s.key(...KEYS.ArrowUp);
  check("ArrowUp from the first wraps to the last", (await focusedIndex()) === 6, "index " + (await focusedIndex()));

  await startAt(5);
  await s.key(...KEYS.Home);
  check("Home goes to the first", (await focusedIndex()) === 0, "from 5, index " + (await focusedIndex()));

  await startAt(1);
  await s.key(...KEYS.End);
  check("End goes to the last", (await focusedIndex()) === 6, "from 1, index " + (await focusedIndex()));

  /* Enter and Space have to TOGGLE, and arrow keys must not. */
  await focusTrigger(4);
  const before = JSON.parse(await faqState()).expanded[4];
  await s.key(...KEYS.Enter);
  const afterEnter = JSON.parse(await faqState()).expanded[4];
  check("Enter toggles the focused question", before !== afterEnter, before + " -> " + afterEnter);
  await s.key(...KEYS.Space);
  const afterSpace = JSON.parse(await faqState()).expanded[4];
  check("Space toggles it back", afterSpace === before, afterEnter + " -> " + afterSpace);

  await startAt(3);
  await s.key(...KEYS.Enter);
  await s.key(...KEYS.ArrowDown);
  st = JSON.parse(await faqState());
  const movedTo = await focusedIndex();
  /* Both halves, or this passes on a keyboard that does nothing: "nothing
     opened" is trivially true when focus never moved either. */
  check("an arrow key moves focus WITHOUT opening anything",
    movedTo === 4 && st.expanded[4] === "false" && st.expanded[3] === "true",
    "focus now " + movedTo + ", expanded: " + st.expanded.join(","));

  await s.key(...KEYS.Escape);
  st = JSON.parse(await faqState());
  check("Escape closes the open panel", st.expanded.every((e) => e === "false"),
    "expanded: " + st.expanded.join(","));

  /* ---- the contact form ------------------------------------------------ */
  console.log("\n   THE CONTACT FORM");
  const fields = JSON.parse(await s.ev(`JSON.stringify(
    [...document.querySelectorAll('#contact input, #contact textarea')].map((el) => ({
      name: el.name,
      id: el.id,
      hasLabel: !!(el.id && document.querySelector('label[for="' + el.id + '"]')),
      labelText: el.id ? (document.querySelector('label[for="' + el.id + '"]') || {}).textContent : null,
      placeholder: el.getAttribute('placeholder'),
      autocomplete: el.getAttribute('autocomplete')
    })))`));
  check("every field has a real <label for>", fields.length === 4 && fields.every((f) => f.hasLabel),
    fields.map((f) => f.name + "=" + (f.labelText || "NONE")).join(", "));
  check("no placeholder is standing in for a label", fields.every((f) => !f.placeholder),
    fields.filter((f) => f.placeholder).map((f) => f.name).join(", ") || "none of the four");

  /* Submit empty. Every field should come back with its own message, tied to
     its own input. */
  await s.ev(`(() => { const f = document.querySelector('#contact form');
    f.scrollIntoView({ block: 'center' });
    f.querySelector('button[type=submit]').click(); return 1; })()`);
  await sleep(900);
  const errs = JSON.parse(await s.ev(`JSON.stringify(
    [...document.querySelectorAll('#contact input, #contact textarea')].map((el) => {
      const d = el.getAttribute('aria-describedby');
      const msg = d ? document.getElementById(d) : null;
      return { name: el.name, invalid: el.getAttribute('aria-invalid'),
        describedBy: d, message: msg ? msg.textContent.trim().slice(0, 40) : null,
        role: msg ? msg.getAttribute('role') : null };
    }))`));
  check("submitting empty marks every field invalid", errs.every((e) => e.invalid === "true"),
    errs.map((e) => e.name + "=" + e.invalid).join(" "));
  check("each message is tied to its own input by aria-describedby",
    errs.every((e) => e.describedBy && e.message && e.message.length > 3),
    errs.map((e) => e.name + ': "' + (e.message || "NONE") + '"').join("  "));
  check("each message is announced (role=alert)", errs.every((e) => e.role === "alert"),
    errs.map((e) => e.name + "=" + e.role).join(" "));
  check("the submit status region is in the tree BEFORE any submit outcome",
    await s.ev("!!document.querySelector('#contact [role=status][aria-live]')"));

  /* A valid submission reaches the server action and comes back a success. */
  const ok = await s.ev(`(async () => {
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    set('#contact input[name=name]', 'Amira Hassan');
    set('#contact input[name=email]', 'amira@example.com');
    set('#contact input[name=organization]', 'Modern School Cairo');
    set('#contact textarea[name=message]', 'We run eleven buses and would like a demo for our routes.');
    await new Promise((r) => setTimeout(r, 250));
    document.querySelector('#contact form button[type=submit]').click();
    await new Promise((r) => setTimeout(r, 2500));
    const st = document.querySelector('#contact [role=status]');
    return JSON.stringify({ text: st ? st.textContent.trim().slice(0, 60) : null,
      formGone: !document.querySelector('#contact form') });
  })()`);
  const res = JSON.parse(ok);
  check("a valid submission returns a success state", res.formGone && /received/i.test(res.text || ""),
    JSON.stringify(res));

  /* ---- dead links ------------------------------------------------------ */
  console.log("\n   NOTHING POINTS AT NOTHING");
  const links = JSON.parse(await s.ev(`JSON.stringify(
    [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')))`));
  const dead = links.filter((h) => h === "#" || h === "" || h === "javascript:void(0)");
  check("no link on the page points at '#'", dead.length === 0, dead.length + " dead links");
  const hashes = links.filter((h) => h.startsWith("#") && h.length > 1);
  const broken = JSON.parse(await s.ev(`JSON.stringify(${JSON.stringify(hashes)}
    .filter((h) => !document.querySelector(h)))`));
  check("every in-page link resolves to a real target", broken.length === 0,
    broken.length ? "broken: " + broken.join(" ") : hashes.length + " in-page links all resolve");
  check("the footer carries no social icons", !(await s.ev(`(() => {
    const f = document.querySelector('footer');
    if (!f) return true;
    return [...f.querySelectorAll('a')].some((a) => !a.textContent.trim());
  })()`)), "no icon-only links in the footer");
  s.close();

  /* ---- reduced motion -------------------------------------------------- */
  console.log("\n   REDUCED MOTION");
  const rm = await session({ reduced: true });
  const durations = JSON.parse(await rm.ev(`JSON.stringify((() => {
    const t = [...document.querySelectorAll('#faq button[aria-expanded]')];
    const svg = getComputedStyle(t[0].querySelector('svg')).transitionDuration;
    const panel = document.getElementById(t[0].getAttribute('aria-controls'));
    const grid = getComputedStyle(panel.parentElement.parentElement).transitionDuration;
    return { svg, grid };
  })())`));
  /*
   * "No motion" here means the project's own reduced-motion reset, which sets
   * transition-duration to 0.01ms rather than to 0 — deliberately, so that a
   * transitionend listener still fires and nothing waits forever for an event
   * that a duration of exactly zero would never send. 0.01ms is 1e-05s, which
   * is what this reads back.
   *
   * So the assertion is "at most a millisecond", not "exactly zero". Checking
   * for zero failed a build whose reduced-motion handling is correct.
   */
  const seconds = (v) => Math.max(...String(v).split(",").map((x) => parseFloat(x) || 0));
  const none = (v) => seconds(v) <= 0.001;
  check("the accordion has no transition at all under reduced motion — not a shorter one",
    none(durations.svg) && none(durations.grid),
    "icon " + durations.svg + ", panel " + durations.grid);
  /* And it still WORKS: removing motion must not remove the behaviour. */
  await rm.ev(`(() => { const t = [...document.querySelectorAll('#faq button[aria-expanded]')];
    t[1].scrollIntoView({block:'center'}); t[1].click(); return 1; })()`);
  await sleep(300);
  check("and it still opens", (await rm.ev(`document.querySelectorAll('#faq button[aria-expanded]')[1].getAttribute('aria-expanded')`)) === "true");
  rm.close();

  console.log("\n  " + (fails.length ? "FAILED: " + fails.join(" | ") : "all checks pass") + "\n");
  process.exit(fails.length ? 1 : 0);
})();
