/**
 * The phone tour's three.js scene. Vanilla three, dynamically imported.
 *
 * Everything here is driven by one number: `progress`, 0 to 1 across the
 * section's runway. No internal clock, no tweens, no ScrollTrigger. Stop
 * scrolling and the phone stops where it is, mid-turn.
 *
 * ── Why a container leans and a child spins ───────────────────────────────
 *
 * The spec originally said "rotate about world Y". A phone leaning 10 degrees
 * off vertical, spun about world Y, sweeps a cone — at 180 degrees it leans
 * the other way, and the lean precesses through the turn. It reads as a
 * tumble. So: `leanGroup` carries the lean, `spinGroup` inside it carries the
 * rotation. The lean stays constant relative to the viewer, and the screen
 * normal used for the swap stays stable instead of moving with the turn.
 *
 * The model's own long axis is world Y in its untouched frame (spec §4: local
 * Z maps to world Y), so spinning `spinGroup` about Y IS spinning the phone
 * about its long axis.
 *
 * ── The screen swap ───────────────────────────────────────────────────────
 *
 * Fired from the actual screen normal against the camera, never from a
 * rotation range.
 *
 * MID-BACK, not at the crossing. The first version triggered on the edge where
 * the dot crosses zero — but that IS edge-on, the sliver moment, not the back.
 * The guard caught it: swaps landed at dot -0.07. The window is now dot < -0.5,
 * comfortably around the half-turn where the dot reaches -1.
 *
 * The check is level-triggered and made idempotent by `bind` returning early
 * when the chapter is already bound, rather than by an edge latch. An edge
 * latch looked equivalent and was not: a scroll that JUMPS past the back
 * window never produces a crossing, so the texture stayed on the wrong
 * chapter forever. Anchor links and flicks do that. Those bind late and are
 * recorded as "recovery" so a guard can tell the two apart.
 *
 * The normal's sign is calibrated at load rather than hardcoded: the phone is
 * front-facing at progress 0 by construction, so whichever of +X/-X points at
 * the camera then is "front" for the rest of the session. Spec §4 says the
 * thin axis is X; it does not say which way round, and guessing would be the
 * kind of thing that works on this export and breaks on the next.
 */

import {
  PHONE_SIDE_X, LEAN_DEG, readTuning,
} from "./constants";

/* One read, at module load, shared by sideFraction and the layout. */
const TUNING = readTuning();

export type SwapRecord = {
  chapter: number;
  dot: number;
  progress: number;
  /** "swap" fired mid-back, as designed. "recovery" fired front-facing because
   *  the scroll JUMPED past the back window — an anchor link, a flick, a
   *  scripted scrollTo — and showing the wrong screen is worse than a visible
   *  change. */
  kind: "swap" | "recovery";
};

export type SceneDebug = {
  ready: boolean;
  /** Frames drawn since the scene was created. Must not advance while the
   *  section is off screen. */
  renders: number;
  /** The phone's size: its projected box at the centre of the frame. */
  phoneHeightPx: number;
  /** What the layout actually solved. `h`/`w` are the worst the projected box
   *  gets ANYWHERE in the section, which is more than `phoneHeightPx` by the
   *  perspective shear at the ends of the descent. */
  footprint: {
    h: number; w: number; margin: number;
    descentRoomPx: number; descentPx: number;
    sideX: number; sideXAsked: number;
  };
  screenDotCamera: number;
  boundChapter: number;
  swaps: SwapRecord[];
  phoneCentreXPx: number;
  /** Spec §5.2a. The guard asserts this MOVES between rest points while the
   *  text's rect does not. */
  phoneCentreYPx: number;
  viewportW: number;
  toneMapping: string;
  outputColorSpace: string;
  screenTextureColorSpace: string;
  transmissionFactor: number | null;
  texturesUploaded: number;
  /** Instrumentation only — what the material ACTUALLY holds after
   *  GLTFLoader has parsed it, which is not necessarily what the file says. */
  material: {
    type: string;
    color: number[];
    toneMapped: boolean;
    mapColorSpace: string;
    mapFlipY: boolean;
    boundTextureIndex: number;
    /** The tint as authored, sRGB hex. The guard multiplies the source by it,
     *  so a deliberate dim is not read as a failure to reproduce. */
    colorHex: string;
  };
  toneMappingExposure: number;
  textureColorSpaces: string[];
  /** The two coupled knobs, as actually applied. */
  tuning: { knee: number; crossFraction: number; restFraction: number; descentUse: number; exposure: number; fov: number; maxPhonePx: number; edgeMargin: number; crossStart: number; crossEnd: number };
  /** Which environment path actually ran. Without this, a render diff between
   *  two modes cannot tell "identical output" from "the switch did nothing". */
  envMode: string;
  /** What envMapIntensity the BODY materials actually hold, so a null result
   *  from sweeping it can be told from the sweep never landing. */
  bodyEnvIntensity: number[];
  /*
   * The screen mesh's projected bounding box, in CSS px relative to the
   * canvas. Handed out because the colour harness was searching a crop for
   * "the most orange pixel" and, when the screen showed nothing orange, it
   * quietly settled on the titanium frame and reported the frame's distance
   * from the source card as the wash. A search that cannot fail has no way to
   * say "the card is not here". Crop to this rect instead.
   */
  screenRect: { x: number; y: number; w: number; h: number };
  /*
   * The display quad's four corners, projected to canvas CSS px, each tagged
   * with its UV. Lets a harness map a point in the SOURCE texture to the pixel
   * that shows it, so both images are sampled at the same feature instead of
   * each searching for its own — which on chapters 2 and 3 found a small
   * saturated badge in the source and a larger, paler element in the render,
   * and read the difference as a wash.
   */
  screenQuad: { u: number; v: number; x: number; y: number }[];
  /** The WHOLE phone's projected box, CSS px relative to the canvas. The
   *  overlap guard needs the body, not just the display. */
  phoneRect: { x: number; y: number; w: number; h: number };
};

export type TourScene = {
  setProgress(p: number): void;
  resize(): void;
  dispose(): void;
  debug(): SceneDebug;
  /**
   * Resolves when there is NOTHING LEFT TO BLOCK ON: model parsed, textures
   * uploaded, shaders compiled, environment prefiltered, and a frame lit by
   * that environment presented.
   *
   * `createScene` resolving is not the same thing and never was — it returns
   * with the environment still to build, which is the single most expensive
   * step and the one that lands as a freeze a second or two later. The load
   * screen waits on this instead, so the cost is paid where it is invisible.
   */
  settled: Promise<void>;
};

/** Section geometry, kept here so nothing downstream types a literal. */
export const CHAPTERS = 3;
export const TURNS = CHAPTERS - 1; // two transitions, 360 degrees each

/*
 * Geometry and timing constants live in ./constants, imported by both this
 * module and the DOM around it. Re-exported here so existing importers and
 * the spec's references keep working.
 */
export {
  MAX_PHONE_PX, EDGE_MARGIN_PX, PHONE_SIDE_X, DESCENT_USE, LEAN_DEG, FADE_KNEE, readTuning,
} from "./constants";

/**
 * The screen's tint. 0xffffff reproduces the source texture exactly; lower
 * values dim it. The screens read hot against the warm paper ground, so this
 * is the knob for that — the material colour, never the texture.
 */
export const SCREEN_TINT = 0xffffff;

/**
 * PMREM prefilter blur. Measured on an AMD Vega 8 via ANGLE/D3D11 — a real
 * GPU, not a software rasteriser — the prefilter cost 2588ms and was the
 * single largest block on the critical path.
 */
export const PMREM_SIGMA = 0;

/**
 * The cubemap the environment is prefiltered FROM, in pixels per face.
 *
 * `PMREMGenerator.fromScene` prefilters at a fixed 256 and offers no way to
 * ask for less, so the environment is rendered into a small cube target
 * first and prefiltered from that. Fourfold fewer texels per face at 64.
 *
 * This is the only thing the phone's reflections come from — it is what makes
 * the body read as an object rather than a flat shape — so the size is
 * justified by a render diff, not by the timing alone.
 */
export const PMREM_CUBE_PX = 64;

/** Which environment the scene ships with. See the block in createScene. */
export const ENV_MODE: "pmrem" | "cube" | "none" | "defer" = "pmrem";

/** Which chapter the scroll is heading toward. Flips at the half-turn, which
 *  is exactly where the back faces the camera — so by the time the away-edge
 *  fires, this is already the chapter to bind. */
export function targetChapter(p: number): number {
  return Math.max(0, Math.min(CHAPTERS - 1, Math.round(p * TURNS)));
}

/*
 * `sideOf` and `sideFraction` are BACK, and the note is deliberate.
 *
 * They were deleted one commit ago with a comment arguing that a helper still
 * computing superseded behaviour is a hazard. That was right at the time: the
 * phone held one side. The alternation has since been reinstated with the
 * text alternating too, so the reason no longer holds and the functions
 * describe the build again. Recorded here so the next reader finds the
 * reversal explained rather than wondering whether the deletion was an
 * accident.
 *
 * What did NOT come back is `smoothstep`. It eased the old traverse across
 * the whole transition; the crossing now runs on an ease-out inside a much
 * narrower window, and the descent stays linear against a linear spin.
 */

/** Right, left, right (spec §5.1). The TEXT takes the opposite side. */
export function sideOf(chapter: number): 1 | -1 {
  return chapter % 2 === 0 ? 1 : -1;
}

/** Ease out, so the phone settles onto its new side rather than stopping. */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Where the phone sits horizontally, in [-1, 1].
 *
 * The crossing happens INSIDE the fade's dead zone and nowhere else: it has
 * not started while the outgoing text is still legible, and it has finished
 * long before the incoming one appears.
 */
export function sideFraction(p: number): number {
  const t = Math.min(1, Math.max(0, p)) * TURNS;
  const i = Math.min(TURNS - 1, Math.floor(t));
  const local = Math.min(1, Math.max(0, t - i));
  const k = easeOutCubic(
    Math.min(1, Math.max(0, (local - TUNING.crossStart) / (TUNING.crossEnd - TUNING.crossStart))),
  );
  const from = sideOf(i);
  const to = sideOf(i + 1);
  return from + (to - from) * k;
}

/*
 * Load-stage marks. MARKS ONLY — nothing here changes what is fetched, when,
 * or in what order. The point is to find out which stage dominates before
 * anything is altered, because "the model is slow" has four candidate causes
 * and three of them would be fixed by a change that does nothing.
 *
 * All values are milliseconds since navigation start, so they line up with
 * PerformanceResourceTiming without any arithmetic at the far end.
 */
export type LoadMarks = Record<string, number>;
const marks: LoadMarks = {};
const mark = (k: string) => { marks[k] = +performance.now().toFixed(1); };

export async function createScene(
  canvas: HTMLCanvasElement,
  screenUrls: string[],
  opts: { keepTransmission?: boolean } = {},
): Promise<TourScene> {
  mark("createScene");
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");

  mark("threeImported");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  mark("rendererMade");
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  /*
   * Spec §6.2. §4 tuned emissiveStrength 2.0 against a black base TO SURVIVE
   * ACES. Without it that tuning is not unused, it is wrong — the screen blows
   * out. sRGB output and sRGB texture colour space go with it.
   */
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TUNING.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  /*
   * Spec §6.3. The GLB carries no lights and no cameras, and its materials use
   * clearcoat, specular and transmission — all of which render flat or black
   * with no environment. RoomEnvironment is procedural: nothing to download.
   */
  /*
   * EVERY FETCH STARTS FIRST, then the environment is prefiltered while they
   * are in flight.
   *
   * Measured, these ran strictly one after another: the PMREM prefilter
   * occupied 6863-9451ms and only then did the GLB request go out, finishing
   * at 10160ms, with the textures after that. Nothing required that order —
   * the prefilter needs no model and the model needs no environment until it
   * is rendered. Sequencing them cost the download time outright.
   */
  mark("glbStart");
  const gltfPromise = new GLTFLoader().loadAsync("/models/iphone_16_saferide_max.glb");
  const texLoader = new THREE.TextureLoader();
  mark("texStart");
  const texturePromises = screenUrls.map((u) => texLoader.loadAsync(u));
  /* Both promises are already rejecting-capable; a failure surfaces at the
     await below, inside the caller's existing try/catch. Attaching a no-op
     catch here keeps Node/browsers from reporting an unhandled rejection in
     the window between starting and awaiting. */
  gltfPromise.catch(() => {});
  texturePromises.forEach((p) => p.catch(() => {}));

  /*
   * Warm the context before timing anything else on it.
   *
   * PMREM's cost did not respond to sigma (2588 vs 2571) or to a fourfold
   * cut in source resolution, and its shader compile measures 4ms. That
   * pattern says the number is not PMREM's work — it is whatever the first
   * GPU operation on a fresh context pays for. This renders one empty frame
   * first so the attribution lands where the cost actually is.
   */
  mark("warmStart");
  renderer.setSize(2, 2, false);
  renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera());
  mark("warmDone");

  /*
   * THE ENVIRONMENT, and why it is not a PMREM prefilter any more.
   *
   * The prefilter cost 2055-2588ms on an AMD Vega 8 over ANGLE/D3D11 — a real
   * GPU, not a software rasteriser — and it was the largest single block on
   * the critical path. Four hypotheses were tested and all four rejected:
   *
   *   sigma 0 instead of 0.04        2588 -> 2571ms   no effect
   *   64px source instead of 256     2571 -> 2263ms   plus 400ms to render it
   *   shader compilation                        4ms   not the cost
   *   cold-context warm-up                     24ms   not the cost
   *
   * The passes themselves are simply expensive here, and PMREM's output size
   * is fixed regardless of what it prefilters FROM, which is why resolution
   * barely moved it.
   *
   * So the environment comes straight off a small cube render. `envMode` in
   * the query string selects between the three candidates so they can be
   * photographed from one build rather than three.
   */
  const envMode = new URLSearchParams(location.search).get("envMode") ?? ENV_MODE;
  mark("envStart");
  const roomScene = new RoomEnvironment();
  mark("roomBuilt");
  let pmrem: import("three").PMREMGenerator | null = null;
  let envRT: import("three").WebGLRenderTarget | null = null;
  const cubeRT = new THREE.WebGLCubeRenderTarget(PMREM_CUBE_PX);

  /*
   * Sub-marked, because "the environment costs 2.0-2.6s" turned out to be a
   * claim about one line inside this function and the function measured
   * 4.6s. Three candidates live here — rendering the room into a cube, the
   * prefilter itself, and the material recompile that assigning
   * scene.environment forces on the NEXT render — and they are not
   * separable from outside.
   */
  const buildEnvironment = () => {
    mark("envCubeStart");
    const cubeCam = new THREE.CubeCamera(0.1, 1000, cubeRT);
    cubeCam.update(renderer, roomScene);
    mark("envCubeDone");
    pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromCubemap(cubeRT.texture);
    mark("envPmremDone");
    scene.environment = envRT.texture;
  };

  const buildRawCube = () => {
    /* Kept only as a measured negative result: assigning a raw cube texture
       to scene.environment does NOT skip PMREM. three prefilters it lazily on
       first use, so the output is pixel-identical to "pmrem" across 1.29M
       pixels and the 2s simply moves into the first render, where it is worse
       (3978ms against 1579ms). */
    const cubeCam = new THREE.CubeCamera(0.1, 1000, cubeRT);
    cubeCam.update(renderer, roomScene);
    scene.environment = cubeRT.texture;
  };
  mark("envDone");

  const camera = new THREE.PerspectiveCamera(TUNING.fov, 1, 0.01, 100);
  camera.position.set(0, 0, 1);

  /* lean outside, spin inside — see the header. */
  const leanGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  leanGroup.rotation.z = THREE.MathUtils.degToRad(LEAN_DEG);
  leanGroup.add(spinGroup);
  scene.add(leanGroup);

  const gltf = await gltfPromise;
  mark("glbDone");
  const model = gltf.scene;
  spinGroup.add(model);

  /* ---- the screen mesh and its material (spec §4, taken as given) ------- */
  let screenMesh: import("three").Mesh | null = null;
  let screenMat: import("three").MeshStandardMaterial | null = null;
  let transmissionFactor: number | null = null;

  model.traverse((o) => {
    const mesh = o as import("three").Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as import("three").MeshPhysicalMaterial;
    if (!mat) return;
    if (mat.name === "screen.001") {
      screenMesh = mesh;
      screenMat = mat as unknown as import("three").MeshStandardMaterial;
    }
    /*
     * Spec §6.4. glass.002 sits behind the screen and shows nothing from the
     * front, but transmission costs three.js a full extra render pass every
     * frame. Off by default; --keep-transmission measures the other side.
     */
    if (mat.name === "glass.002" && typeof mat.transmission === "number") {
      transmissionFactor = opts.keepTransmission ? mat.transmission : 0;
      mat.transmission = transmissionFactor;
      mat.needsUpdate = true;
    }
  });
  if (!screenMesh || !screenMat) throw new Error("phone tour: screen.001 material not found");

  /* Diagnostic knob: how much the environment contributes to the BODY. The
     screen is replaced with an unlit material below and never sees this. */
  if (TUNING.envIntensity !== 1) {
    model.traverse((o) => {
      const m = (o as import("three").Mesh).material as
        import("three").MeshStandardMaterial | undefined;
      if (m && typeof m.envMapIntensity === "number") m.envMapIntensity = TUNING.envIntensity;
    });
  }

  /* ---- screen textures ------------------------------------------------- */
  let uploadMs = 0;
  const textures = await Promise.all(
    texturePromises.map(async (pending) => {
      const t = await pending;
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false; // glTF convention
      /*
       * Spec §5.3 as amended. A 1080x2314 texture uploaded on first use costs
       * a frame, and it costs it at the exact moment the swap is supposed to
       * be invisible. Upload all three now.
       */
      const u0 = performance.now();
      renderer.initTexture(t);
      uploadMs += performance.now() - u0;
      return t;
    }),
  );
  mark("texDone");
  marks.uploadMs = +uploadMs.toFixed(1);

  /*
   * THE SCREEN IS UNLIT. This supersedes §4's material pinning, and the
   * numbers are in the spec.
   *
   * §4 pinned baseColorFactor black + emissiveTexture + emissiveStrength 2.0
   * "to survive ACES tone mapping". Measured against the source texture at the
   * orange Current Trip card, that setup renders 93 units off: ACES desaturates
   * bright saturated colour toward white, which is exactly the wash. No value
   * of emissiveIntensity fixes it — 1 measures 59, 2 measures 93.
   *
   * A display is not a lit surface. MeshBasicMaterial has no lighting term, so
   * scene.environment cannot reach it — which was the contribution that could
   * not be isolated through envMapIntensity — no emissive path, so the KHR
   * extension stops mattering, and toneMapped false keeps it out of ACES
   * entirely. It draws the texture as authored.
   *
   * The pinning existed to survive a tone curve this material never enters.
   */
  const screenTex = (i: number) => textures[i];
  /*
   * side is CARRIED OVER, not defaulted, and it is the whole reason the first
   * unlit attempt drew nothing at all.
   *
   * Constructing a material from scratch throws away every flag GLTFLoader set
   * from the file. This display plane's winding faces INTO the phone, and the
   * glTF marks it doubleSided so it draws anyway. MeshBasicMaterial defaults
   * to FrontSide, so the plane was back-face culled at every angle — invisible
   * front-on, hidden behind the body from behind.
   *
   * That produced a whole run of misleading evidence: the tint sweep gave
   * three identical numbers, hiding the glass changed nothing, and the colour
   * harness kept finding its "most orange pixel" on the titanium frame and
   * reporting the frame's distance from the source card as the wash. Nothing
   * was measuring the screen because the screen was never rasterised.
   */
  const basicMat = new THREE.MeshBasicMaterial({
    map: screenTex(0),
    color: SCREEN_TINT,
    toneMapped: false,
    side: (screenMat as unknown as import("three").MeshStandardMaterial).side,
  });
  (screenMesh as unknown as import("three").Mesh).material = basicMat;

  let boundChapter = 0;
  const swaps: SwapRecord[] = [];
  const bind = (chapter: number) => {
    if (chapter === boundChapter) return false;
    basicMat.map = screenTex(chapter);
    basicMat.needsUpdate = true;
    boundChapter = chapter;
    return true;
  };

  /* ---- layout: solved against the phone's real projected footprint ----- */
  /*
   * THE FOOTPRINT IS NOT THE PHONE'S HEIGHT, and that gap was the clipping.
   *
   * The old solve took `modelHeight` from a world AABB measured at the raw
   * glTF orientation — which on this export is EDGE-ON, thin axis across the
   * view. Turned front-on the phone presents its WIDTH to the lean, and the
   * lean folds that width into the height: 10 degrees of a 77mm width adds
   * 13mm to a 163mm phone. Perspective adds more again, because at fov 35 the
   * near half of a spinning phone is about 10% closer than the far half, and
   * more again at the ends of the descent, where the whole box is off-axis
   * and shears.
   *
   * Measured on the shipped build at 1440x900: the layout solved for 620px,
   * the phone drew 652px at the centre and 664px at its worst, and the
   * descent then handed out every "remaining" pixel on the strength of the
   * 620. Result: 39px off the top at chapter 1, 39px off the bottom at
   * chapter 3, the phone touching a boundary at 12 of 202 scroll positions.
   * The bottom-right corner goes first because the phone leans.
   *
   * So nothing here is solved from a single upright measurement any more.
   * Both the size and the placement are solved against the projected box of
   * the model's own corners, swept across the full rotation AND the full
   * descent.
   */

  /*
   * The model's box in spinGroup-local space, and the phone centred on the
   * spin axis IN THAT FRAME.
   *
   * Measured with both groups at identity on purpose. `Box3.setFromObject`
   * returns a WORLD box, so taken with the lean applied it already has the
   * lean folded in — and the old code then subtracted that world centre from
   * a spinGroup-local position, which is only correct when the lean is zero.
   */
  const localHalf = (() => {
    const lz = leanGroup.rotation.z;
    const sy = spinGroup.rotation.y;
    const lp = leanGroup.position.clone();
    leanGroup.rotation.z = 0;
    spinGroup.rotation.y = 0;
    leanGroup.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(model);
    model.position.sub(b.getCenter(new THREE.Vector3()));
    leanGroup.rotation.z = lz;
    spinGroup.rotation.y = sy;
    leanGroup.position.copy(lp);
    scene.updateMatrixWorld(true);
    return b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  })();

  /* The eight corners of that box, and the lean, as plain numbers. This runs
     a few thousand times per layout and once per binary-search step; Vector3
     allocation at that rate is the kind of thing that shows up as a hitch on
     resize. */
  const CORNERS: number[][] = [];
  for (let i = 0; i < 8; i++) {
    CORNERS.push([
      (i & 1 ? 1 : -1) * localHalf.x,
      (i & 2 ? 1 : -1) * localHalf.y,
      (i & 4 ? 1 : -1) * localHalf.z,
    ]);
  }
  const LEAN_COS = Math.cos(THREE.MathUtils.degToRad(LEAN_DEG));
  const LEAN_SIN = Math.sin(THREE.MathUtils.degToRad(LEAN_DEG));

  /**
   * Where the phone's box lands on the canvas, in CSS px, for a given spin
   * and offset. The same transform the render uses — spin about Y inside a
   * lean about Z — followed by the same perspective divide.
   *
   * Written out rather than done with `Vector3.project` because it has to be
   * evaluated for poses the scene is NOT currently in, which is the whole
   * point: the descent has to be solved against the worst pose, not the
   * current one.
   */
  function projectBox(
    theta: number, offX: number, offY: number,
    d: number, W: number, H: number, tanHalf: number,
  ) {
    const aspect = W / H;
    const cs = Math.cos(theta), sn = Math.sin(theta);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of CORNERS) {
      const sx = c[0] * cs + c[2] * sn;
      const sz = -c[0] * sn + c[2] * cs;
      const lx = sx * LEAN_COS - c[1] * LEAN_SIN + offX;
      const ly = sx * LEAN_SIN + c[1] * LEAN_COS + offY;
      const dz = d - sz;
      const px = (W / 2) * (1 + lx / (tanHalf * aspect * dz));
      const py = (H / 2) * (1 - ly / (tanHalf * dz));
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
    return { x0, y0, x1, y1 };
  }

  let visibleW = 1;
  let visibleH = 1;
  /** The footprint at the centre of the frame: the phone's size. */
  let phoneHeightPx = 0;
  /** The worst the box gets anywhere in the section — what has to fit. */
  let footprintMaxH = 0;
  let footprintMaxW = 0;
  /** Total vertical travel, world units, before descentUse is applied. */
  let descentRoom = 0;
  let descentWorld = 0;
  /** PHONE_SIDE_X, reduced if the frame is too narrow to hold it. */
  let sideXEff = PHONE_SIDE_X;

  function layout() {
    const W = canvas.clientWidth || 1;
    const H = canvas.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const margin = TUNING.edgeMargin;

    /** The tallest the box gets over a full turn, at a given distance. */
    const spanH = (dd: number) => {
      let m = 0;
      for (let i = 0; i < 72; i++) {
        const b = projectBox((i / 72) * Math.PI * 2, 0, 0, dd, W, H, tanHalf);
        if (b.y1 - b.y0 > m) m = b.y1 - b.y0;
      }
      return m;
    };

    /* Solve the distance so the tallest pose projects to the cap. Projected
       height goes as 1/distance to first order, so the ratio converges in a
       few steps and does not need a search. */
    const solve = (target: number) => {
      let d = (2 * localHalf.y * H) / (2 * target * tanHalf);
      for (let i = 0; i < 8; i++) d *= spanH(d) / target;
      return d;
    };
    let targetPx = Math.min(TUNING.maxPhonePx, H * TUNING.restFraction);
    let d = solve(targetPx);
    /* A frame too short to hold the phone at all: shrink to fit rather than
       clip. Nothing in the tuning range reaches here at any real viewport;
       it exists so the guard's answer is "small" rather than "cut off". */
    if (spanH(d) > H - 2 * margin) {
      targetPx = Math.max(1, H - 2 * margin);
      d = solve(targetPx);
    }
    camera.position.set(0, 0, d);
    camera.updateProjectionMatrix();
    visibleH = 2 * d * tanHalf;
    visibleW = visibleH * camera.aspect;
    phoneHeightPx = spanH(d);

    const theta = (p: number) => baseSpin + p * TURNS * Math.PI * 2;

    /*
     * HOW FAR CAN IT DESCEND? Binary search, not arithmetic.
     *
     * `H - phoneHeightPx` is the wrong answer even with the footprint right,
     * because perspective shears the box as it moves off-axis: the same phone
     * projects taller at the top of the frame than at the middle, by about
     * 20px at this distance. Searching the actual placement is the only form
     * of this that cannot be off by a term nobody thought of.
     */
    const verticalFits = (travel: number) => {
      for (let s = 0; s <= 60; s++) {
        const p = s / 60;
        const b = projectBox(theta(p), 0, (0.5 - p) * travel, d, W, H, tanHalf);
        if (b.y0 < margin || b.y1 > H - margin) return false;
      }
      return true;
    };
    if (!verticalFits(0)) {
      descentRoom = 0;
    } else {
      let lo = 0, hi = visibleH;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (verticalFits(mid)) lo = mid; else hi = mid;
      }
      descentRoom = lo;
    }
    descentWorld = descentRoom * TUNING.descentUse;

    /*
     * The horizontal is clamped by moving the phone IN, never by making it
     * smaller: a narrow viewport is a placement problem, and shrinking the
     * phone to solve it would trade the thing the visitor came for against a
     * constraint that only bites at one width. x and y are independent here —
     * the horizontal projection does not involve offY, and the vertical does
     * not involve offX — so the two searches do not interact.
     */
    const horizontalFits = (sx: number) => {
      for (let s = 0; s <= 60; s++) {
        const p = s / 60;
        const b = projectBox(theta(p), sideFraction(p) * sx * visibleW,
          (0.5 - p) * descentWorld, d, W, H, tanHalf);
        if (b.x0 < margin || b.x1 > W - margin) return false;
      }
      return true;
    };
    if (horizontalFits(PHONE_SIDE_X)) {
      sideXEff = PHONE_SIDE_X;
    } else if (!horizontalFits(0)) {
      sideXEff = 0;
    } else {
      let lo = 0, hi = PHONE_SIDE_X;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (horizontalFits(mid)) lo = mid; else hi = mid;
      }
      sideXEff = lo;
    }

    footprintMaxH = 0;
    footprintMaxW = 0;
    for (let s = 0; s <= 200; s++) {
      const p = s / 200;
      const b = projectBox(theta(p), sideFraction(p) * sideXEff * visibleW,
        (0.5 - p) * descentWorld, d, W, H, tanHalf);
      if (b.y1 - b.y0 > footprintMaxH) footprintMaxH = b.y1 - b.y0;
      if (b.x1 - b.x0 > footprintMaxW) footprintMaxW = b.x1 - b.x0;
    }
  }

  /* ---- which way is "front"? calibrated, not assumed ------------------- */
  /*
   * THE FACING AXIS, AND THE BASE ROTATION THAT AIMS IT AT THE CAMERA.
   *
   * Four attempts, and the failures are worth keeping because three of them
   * produced plausible-looking numbers:
   *
   *   1. hardcoded local X (what §4's "thin axis: X" says) — read 0.00 at the
   *      rest points. Perpendicular to the view: impossible for a screen.
   *   2. the average of the geometry's normals — also 0.00. The screen mesh is
   *      a BOX, so its normals cancel and the normalised sum is noise.
   *   3. the thinnest bounding-box axis — a clean cosine with the WRONG PHASE,
   *      0.00 at every rest point and +/-1.00 at the eighth-turns.
   *   4. picking whichever axis flipped most between spin 0 and spin pi — this
   *      READ +1.00 at every rest point and drove swaps at dot -1.000, and the
   *      capture showed the phone EDGE-ON the whole time. Rotating 180 degrees
   *      flips the screen normal and the width axis equally, so the test was a
   *      tie and candidate order broke it.
   *
   * Number 4 is the one to remember: every number said correct and the picture
   * said otherwise. The measurement was self-consistent and measuring the
   * wrong axis.
   *
   * What was actually wrong underneath all four: nothing makes the model face
   * the camera at spin 0. It does not. So the normal is taken from the slab's
   * thinnest axis — which is what a screen's normal IS — and then a BASE
   * rotation is computed to aim it at the camera. Spin proceeds from there.
   */
  const { normalLocal, baseSpin } = (() => {
    /*
     * WHICH WAY DOES THE SCREEN FACE?
     *
     * Five attempts, four of them wrong, and every wrong one had the same
     * shape: take the geometry's THINNEST bounding-box axis as the normal —
     * which gives a line, not a direction — and then infer the sign from
     * something else. Screen origin minus model origin. Screen bbox centre
     * minus body bbox centre. Render both and score the pixels against the
     * texture's mean colour. Each inference was plausible, each produced
     * confident numbers, and each aimed the BACK of the phone at the camera.
     *
     * The mesh was never ambiguous. It is a single flat surface: 112
     * triangles, 99.9% of the area on ONE normal, (1, 0, 0), with no opposing
     * face anywhere in the tally. The direction is not something to deduce
     * from centroids — it is recorded in the normal attribute, and reading it
     * is a measurement rather than an inference.
     *
     * Area-weighted, so a re-export that adds bezel geometry or rotates the
     * mesh still lands on the display face rather than on a rounded corner.
     */
    const g = (screenMesh as unknown as import("three").Mesh).geometry;
    const nAttr = g.getAttribute("normal");
    const pAttr = g.getAttribute("position");
    const idx = g.getIndex();
    const tally = new Map<string, { n: import("three").Vector3; area: number }>();
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
    const nv = new THREE.Vector3();
    const triCount = idx ? idx.count / 3 : pAttr.count / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      p0.fromBufferAttribute(pAttr, i0);
      p1.fromBufferAttribute(pAttr, i1);
      p2.fromBufferAttribute(pAttr, i2);
      const area = p1.clone().sub(p0).cross(p2.clone().sub(p0)).length() / 2;
      nv.fromBufferAttribute(nAttr, i0);
      const key = [nv.x, nv.y, nv.z].map((v) => v.toFixed(2)).join(",");
      const e = tally.get(key) ?? { n: nv.clone(), area: 0 };
      e.area += area;
      tally.set(key, e);
    }
    const dominant = [...tally.values()].sort((x, y) => y.area - x.area)[0];
    if (!dominant) throw new Error("phone tour: screen mesh has no normals");
    const axis = dominant.n.clone().normalize();

    /*
     * The face normal gives the plane's orientation; it does not promise to
     * point out of the phone, and on this model it does not — the display's
     * winding faces inward. The sense comes from the body: the display sits at
     * the surface and the body's mass is behind it, so the vector from the
     * model's centre to the screen's centre points out through the display.
     *
     * Both centres are GEOMETRY centres in world space. An earlier version
     * used the mesh's object origin, which on this export is not inside the
     * mesh at all.
     */
    {
      g.computeBoundingBox();
      const screenCentre = g.boundingBox!.getCenter(new THREE.Vector3());
      (screenMesh as unknown as import("three").Object3D).localToWorld(screenCentre);
      const bodyCentre = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      const outward = screenCentre.sub(bodyCentre);
      const nmSign = new THREE.Matrix3().getNormalMatrix(
        (screenMesh as unknown as import("three").Object3D).matrixWorld,
      );
      if (axis.clone().applyMatrix3(nmSign).dot(outward) < 0) axis.negate();
    }

    /*
     * Aim it at the camera. The camera sits on +Z looking at the origin, so
     * the base spin is whatever rotation about Y brings the normal's azimuth
     * to zero. Spin proceeds from there, and the lean is applied by the parent
     * group so it does not enter this calculation.
     */
    spinGroup.rotation.y = 0;
    scene.updateMatrixWorld(true);
    const nm = new THREE.Matrix3().getNormalMatrix(
      (screenMesh as unknown as import("three").Object3D).matrixWorld,
    );
    const w = axis.clone().applyMatrix3(nm).normalize();
    const base = -Math.atan2(w.x, w.z);
    spinGroup.rotation.y = base;
    scene.updateMatrixWorld(true);

    return { normalLocal: axis, baseSpin: base };
  })();
  /*
   * AFTER the facing calibration, not before it.
   *
   * The layout solves the descent against the pose the phone is actually in
   * at each point of the section, and `baseSpin` is what makes progress 0
   * mean front-on. Solved before it, the sweep would be phase-shifted by 90
   * degrees — and since front-on is both the tallest pose AND where the
   * descent reaches the top and bottom of the frame, that is exactly the
   * coincidence the fit has to account for.
   */
  layout();
  const worldNormal = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  /**
   * How much the screen faces the viewer: +1 dead front, -1 dead back.
   *
   * Measured against the CAMERA'S DIRECTION, not against the vector from the
   * screen to the camera. That distinction is the whole bug the guard caught:
   * the phone sits 25% of the viewport off-centre, so the line from screen to
   * camera is well off the screen's axis, and a front-facing screen measured
   * -0.24 rather than +1. The swap window then never opened where the phone
   * was actually back-on, and a whole transition went unswapped.
   *
   * The camera only ever looks down -Z here and the phone only translates in
   * X, so using the view direction makes this a pure function of rotation —
   * which is what "is the back facing us" actually means.
   */
  function screenFacing(): number {
    screenMesh!.updateWorldMatrix(true, false);
    normalMatrix.getNormalMatrix(screenMesh!.matrixWorld);
    worldNormal.copy(normalLocal).applyMatrix3(normalMatrix).normalize();
    camera.getWorldDirection(camDir);
    return -worldNormal.dot(camDir);
  }

  const sign = 1; // baseSpin already aims the normal at the camera

  /* ---- the one input -------------------------------------------------- */
  /*
   * How many frames this scene has drawn. Instrumentation, and the only way
   * to assert the thing that matters: the tour used to render a full
   * viewport of reflective phone on every rAF from the moment it was ready,
   * including the whole time the visitor is eight screens above watching the
   * hero. A guard on "the page feels smooth" cannot catch that; a guard on
   * "this counter does not move while the section is off screen" can.
   */
  let renders = 0;
  let lastDot = sign * screenFacing();
  let lastProgress = 0;

  /** Comfortably into the back half. The dot reaches -1 at the half-turn, so
   *  this window is wide and centred on it — "mid-back, not a frame early or
   *  late". Zero would be edge-on. */
  const BACK = -0.5;
  /** A progress step larger than this in one frame is a jump, not a scroll. */
  const JUMP = 0.05;

  function setProgress(p: number) {
    const clamped = Math.min(1, Math.max(0, p));
    const prev = lastProgress;
    lastProgress = clamped;
    spinGroup.rotation.y = baseSpin + clamped * TURNS * Math.PI * 2;
    /*
     * ALTERNATING, and downward. Spec §5.1 as amended again.
     *
     * Horizontal and vertical come off the same `clamped` but on different
     * curves, and that is the whole point: on one curve the phone travels
     * diagonally and passes through the text's band while still crossing,
     * which is the collision the alternation was originally ruled out for.
     * Horizontal finishes inside the fade's dead zone; vertical runs the
     * whole transition.
     *
     * Both come off `clamped`, the same value that drives the rotation —
     * there is no second timeline to fall out of step with. The descent is
     * linear because the rotation is: an eased descent against a linear spin
     * reads as the phone slowing down while still turning at full rate.
     *
     * Both amplitudes were SOLVED in layout() against the phone's projected
     * box at every pose it passes through, so there is no arithmetic left to
     * do here and no number here that can go stale when the cap, the
     * fraction, the lean or the fov change.
     */
    leanGroup.position.x = sideFraction(clamped) * sideXEff * visibleW;
    leanGroup.position.y = (0.5 - clamped) * descentWorld;
    scene.updateMatrixWorld(true);

    const dot = sign * screenFacing();
    lastDot = dot;
    const target = targetChapter(clamped);

    if (target !== boundChapter) {
      if (dot < BACK) {
        if (bind(target)) swaps.push({ chapter: target, dot, progress: +clamped.toFixed(4), kind: "swap" });
      } else if (Math.abs(clamped - prev) > JUMP) {
        /* The scroll skipped the back window entirely. Bind anyway. */
        if (bind(target)) swaps.push({ chapter: target, dot, progress: +clamped.toFixed(4), kind: "recovery" });
      }
    }

    renderer.render(scene, camera);
    renders++;
  }

  /*
   * THE ENVIRONMENT GOES IN BEFORE THE COMPILE, and that ordering is worth
   * about two seconds.
   *
   * Assigning scene.environment invalidates every material that can see it,
   * so a compile that ran before the assignment compiles the no-envMap
   * variant and then the next render compiles the whole set again. The
   * deferred build did exactly that, and the second compile is what the
   * environment's measured cost was mostly made of:
   *
   *     room -> cube render                342ms
   *     PMREM prefilter                   2096ms
   *     re-render with the environment    2120ms   <- the second compile
   *
   * Only the first two are the environment. The third was the price of
   * having compiled without it. Measured end to end, building it here
   * instead took the load screen's lift from 9.6s to 6.0s and the worst
   * freeze from 4.6s to 2.6s.
   *
   * Deferring was the right call when the phone had to appear as early as
   * possible, and it is the wrong one now: the load screen holds until the
   * scene has settled, so there is no longer any value in an early frame
   * that is missing its reflections and will pay for them a second later.
   * "defer" stays reachable by query string, as the measured alternative.
   */
  if (envMode === "pmrem") buildEnvironment();
  if (envMode === "cube") buildRawCube();

  /*
   * Compile every material's shader BEFORE the first render rather than
   * during it. The first render measured 1435ms and most of it was this;
   * done here it happens behind the load screen, where the cost is invisible,
   * instead of at the moment the phone is supposed to appear.
   */
  mark("compileStart");
  renderer.compile(scene, camera);
  mark("compileDone");

  mark("beforeFirstRender");
  setProgress(0);
  mark("firstFrame");

  /*
   * DEFERRED ENVIRONMENT.
   *
   * PMREM costs ~2.0-2.6s on an AMD Vega 8 over ANGLE/D3D11 and cannot be
   * made cheaper: sigma, source resolution, shader precompilation and context
   * warm-up were each measured and each rejected. It also cannot be skipped,
   * because three prefilters any cube texture assigned to scene.environment
   * anyway. So the only remaining lever is WHEN it is paid.
   *
   * Paid here, it lands after the phone is already on screen and holding
   * still at chapter 1 rest — which is precisely where the environment
   * matters least. Measured against the fully-lit render, chapter 1 at rest
   * differs by 0.40% of pixels without it, while the edge-on mid-transition
   * frames differ by 6.36%. The visitor cannot reach an edge-on frame without
   * scrolling, and by then this has long since run.
   *
   * Two frames of delay, not one: the first render must have reached the
   * compositor before this blocks the thread again.
   */
  const settled = envMode === "defer"
    ? new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        mark("deferredEnvStart");
        buildEnvironment();
        setProgress(lastProgress);
        mark("deferredEnvDone");
        /* One more frame before resolving, so "settled" means the
           environment-lit frame has been PRESENTED rather than submitted.
           Resolving on the same tick would hand the load screen a promise
           that keeps its own last freeze on the wrong side of the lift. */
        requestAnimationFrame(() => { mark("settled"); resolve(); });
      }));
    })
    /* One frame here too, so "settled" means the same thing in both modes:
       a finished frame on screen, not a finished function. */
    : new Promise<void>((resolve) => {
      requestAnimationFrame(() => { mark("settled"); resolve(); });
    });
  (window as unknown as { __tourMarks?: LoadMarks }).__tourMarks = marks;

  /* Colour lab: query-param gated so it is absent in normal operation. It
     exists to measure candidate fixes against the source texture rather than
     argue about them. */
  if (new URLSearchParams(location.search).has("colourLab")) {
    (window as unknown as { __screenLab?: unknown }).__screenLab = {
      /** Sweep the screen tint. The material colour, never the texture. */
      tint(hex: number) {
        basicMat.color.setHex(hex);
        basicMat.needsUpdate = true;
        setProgress(lastProgress);
      },
    };
  }

  return {
    setProgress,
    settled,
    resize() { layout(); setProgress(lastProgress); },
    dispose() {
      textures.forEach((t) => t.dispose());
      envRT?.dispose();
      pmrem?.dispose();
      cubeRT.dispose();
      renderer.dispose();
    },
    debug(): SceneDebug {
      return {
        ready: true,
        renders,
        phoneHeightPx,
        screenDotCamera: +lastDot.toFixed(4),
        boundChapter,
        swaps,
        phoneCentreXPx:
          (canvas.clientWidth || 0) / 2 + (leanGroup.position.x / visibleW) * (canvas.clientWidth || 0),
        phoneCentreYPx: (canvas.clientHeight || 0) / 2
          - (leanGroup.position.y / visibleH) * (canvas.clientHeight || 0),
        footprint: {
          /* The size, and the worst it gets anywhere in the section. The two
             differ by the perspective shear at the ends of the descent, which
             is the term the old layout had no place for. */
          h: +footprintMaxH.toFixed(1),
          w: +footprintMaxW.toFixed(1),
          margin: TUNING.edgeMargin,
          /* How much travel the frame HAS, and how much of it is used. A
             descent guard that only reads the distance cannot tell "the
             design gave up travel" from "the frame has no more to give". */
          descentRoomPx: +(descentRoom / visibleH * (canvas.clientHeight || 1)).toFixed(1),
          descentPx: +(descentWorld / visibleH * (canvas.clientHeight || 1)).toFixed(1),
          sideX: +sideXEff.toFixed(4),
          sideXAsked: PHONE_SIDE_X,
        },
        viewportW: canvas.clientWidth || 0,
        toneMapping: renderer.toneMapping === THREE.ACESFilmicToneMapping ? "ACESFilmic" : String(renderer.toneMapping),
        outputColorSpace: renderer.outputColorSpace,
        screenTextureColorSpace: textures[0]?.colorSpace ?? "",
        transmissionFactor,
        texturesUploaded: textures.length,
        material: {
          type: basicMat.type,
          color: basicMat.color.toArray(),
          toneMapped: basicMat.toneMapped,
          mapColorSpace: basicMat.map?.colorSpace ?? "(none)",
          mapFlipY: basicMat.map?.flipY ?? false,
          boundTextureIndex: textures.findIndex((t) => t === basicMat.map),
          colorHex: basicMat.color.getHexString(),
        },
        toneMappingExposure: renderer.toneMappingExposure,
        textureColorSpaces: textures.map((t) => t.colorSpace),
        envMode,
        bodyEnvIntensity: (() => {
          const seen = new Set<number>();
          model.traverse((o) => {
            const m = (o as import("three").Mesh).material as
              import("three").MeshStandardMaterial | undefined;
            if (m && typeof m.envMapIntensity === "number") seen.add(+m.envMapIntensity.toFixed(2));
          });
          return [...seen];
        })(),
        tuning: {
          knee: TUNING.knee, crossFraction: TUNING.crossFraction,
          restFraction: TUNING.restFraction, descentUse: TUNING.descentUse,
          /* Read off the RENDERER and the CAMERA, not the config object: what
             was requested and what is applied are different claims. */
          exposure: renderer.toneMappingExposure, fov: camera.fov,
          maxPhonePx: TUNING.maxPhonePx, edgeMargin: TUNING.edgeMargin,
          crossStart: +TUNING.crossStart.toFixed(4), crossEnd: +TUNING.crossEnd.toFixed(4),
        },
        screenRect: (() => {
          const g = screenMesh!.geometry;
          g.computeBoundingBox();
          const bb = g.boundingBox!;
          const W = canvas.clientWidth || 0;
          const H = canvas.clientHeight || 0;
          screenMesh!.updateWorldMatrix(true, false);
          const v = new THREE.Vector3();
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (let i = 0; i < 8; i++) {
            v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
            v.applyMatrix4(screenMesh!.matrixWorld).project(camera);
            const px = (v.x * 0.5 + 0.5) * W;
            const py = (-v.y * 0.5 + 0.5) * H;
            x0 = Math.min(x0, px); x1 = Math.max(x1, px);
            y0 = Math.min(y0, py); y1 = Math.max(y1, py);
          }
          return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
        })(),
        phoneRect: (() => {
          const W = canvas.clientWidth || 0;
          const H = canvas.clientHeight || 0;
          const bb = new THREE.Box3().setFromObject(model);
          const v = new THREE.Vector3();
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (let i = 0; i < 8; i++) {
            v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
            v.project(camera);
            const px = (v.x * 0.5 + 0.5) * W;
            const py = (-v.y * 0.5 + 0.5) * H;
            x0 = Math.min(x0, px); x1 = Math.max(x1, px);
            y0 = Math.min(y0, py); y1 = Math.max(y1, py);
          }
          return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
        })(),
        screenQuad: (() => {
          const g = screenMesh!.geometry;
          const uv = g.getAttribute("uv");
          const pos = g.getAttribute("position");
          const W = canvas.clientWidth || 0;
          const H = canvas.clientHeight || 0;
          screenMesh!.updateWorldMatrix(true, false);
          return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([tu, tv]) => {
            let bi = 0, bd = Infinity;
            for (let i = 0; i < uv.count; i++) {
              const du = uv.getX(i) - tu, dv = uv.getY(i) - tv;
              const d = du * du + dv * dv;
              if (d < bd) { bd = d; bi = i; }
            }
            const v = new THREE.Vector3().fromBufferAttribute(pos, bi);
            (screenMesh as unknown as import("three").Object3D).localToWorld(v);
            v.project(camera);
            return {
              u: +uv.getX(bi).toFixed(4), v: +uv.getY(bi).toFixed(4),
              x: +((v.x * 0.5 + 0.5) * W).toFixed(1), y: +((-v.y * 0.5 + 0.5) * H).toFixed(1),
            };
          });
        })(),
      };
    },
  };
}
