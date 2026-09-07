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
  phoneHeightPx: number;
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
};

export type TourScene = {
  setProgress(p: number): void;
  resize(): void;
  dispose(): void;
  debug(): SceneDebug;
};

/** Section geometry, kept here so nothing downstream types a literal. */
export const CHAPTERS = 3;
export const TURNS = CHAPTERS - 1; // two transitions, 360 degrees each

/** Spec §7.1 as amended: at most 620 CSS px tall, whatever the viewport. */
export const MAX_PHONE_PX = 620;
/** Spec §5.2a. The cap above still wins on tall viewports; this is what
 *  leaves room underneath it for the phone to descend through the frame. */
export const REST_FRACTION = 0.46;
/** Spec §5.1. The phone holds the right side; the text holds the left.
 *  A fraction of the visible width, from centre. */
export const PHONE_SIDE_X = 0.25;
/** Spec §5.2a. How much of the free vertical room the descent uses. 1 would
 *  put the phone flush against both edges at the extremes. */
export const DESCENT_USE = 0.86;
/** Spec §5.4: 8-12 degrees. */
export const LEAN_DEG = 10;

/**
 * The screen's tint. 0xffffff reproduces the source texture exactly; lower
 * values dim it. The screens read hot against the warm paper ground, so this
 * is the knob for that — the material colour, never the texture.
 */
export const SCREEN_TINT = 0xffffff;

/** Which chapter the scroll is heading toward. Flips at the half-turn, which
 *  is exactly where the back faces the camera — so by the time the away-edge
 *  fires, this is already the chapter to bind. */
export function targetChapter(p: number): number {
  return Math.max(0, Math.min(CHAPTERS - 1, Math.round(p * TURNS)));
}

/*
 * `sideOf` and `sideFraction` are GONE, not left in place unused.
 *
 * They described the right/left/right alternation that §5.1 supersedes. An
 * exported helper that still computes the old behaviour is the same hazard as
 * a `side` field that no longer describes anything: the next person to touch
 * this finds a working function with a plausible name and believes it.
 * `smoothstep` went with them — it existed only to ease that traverse, and
 * the descent is deliberately linear against a linear spin.
 */

export async function createScene(
  canvas: HTMLCanvasElement,
  screenUrls: string[],
  opts: { keepTransmission?: boolean } = {},
): Promise<TourScene> {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  /*
   * Spec §6.2. §4 tuned emissiveStrength 2.0 against a black base TO SURVIVE
   * ACES. Without it that tuning is not unused, it is wrong — the screen blows
   * out. sRGB output and sRGB texture colour space go with it.
   */
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  /*
   * Spec §6.3. The GLB carries no lights and no cameras, and its materials use
   * clearcoat, specular and transmission — all of which render flat or black
   * with no environment. RoomEnvironment is procedural: nothing to download.
   */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 0, 1);

  /* lean outside, spin inside — see the header. */
  const leanGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  leanGroup.rotation.z = THREE.MathUtils.degToRad(LEAN_DEG);
  leanGroup.add(spinGroup);
  scene.add(leanGroup);

  const gltf = await new GLTFLoader().loadAsync("/models/iphone_16_saferide_max.glb");
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

  /* ---- screen textures ------------------------------------------------- */
  const texLoader = new THREE.TextureLoader();
  const textures = await Promise.all(
    screenUrls.map(async (u) => {
      const t = await texLoader.loadAsync(u);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false; // glTF convention
      /*
       * Spec §5.3 as amended. A 1080x2314 texture uploaded on first use costs
       * a frame, and it costs it at the exact moment the swap is supposed to
       * be invisible. Upload all three now.
       */
      renderer.initTexture(t);
      return t;
    }),
  );

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

  /* ---- layout: rest scale is a constraint, not an outcome -------------- */
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const centre = new THREE.Vector3();
  box.getCenter(centre);
  model.position.sub(centre); // centre the phone on the spin axis
  const modelHeight = size.y;

  let visibleW = 1;
  let phoneHeightPx = 0;

  function layout() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    /*
     * Solve the camera distance so the phone projects to at most MAX_PHONE_PX,
     * and never more than 62% of the canvas height on short viewports.
     * pxHeight = h * modelHeight / (2 * d * tan(fov/2))
     */
    /*
     * 0.46, not 0.62. The cap is unchanged and still governs tall viewports;
     * the fraction under it dropped to free vertical room for the descent.
     * At 900px of canvas, 0.62 gave a 558px phone and 342px of travel to
     * replace 720px of horizontal — a drift, not a descent. 0.46 gives 414px
     * and about 486px of travel. See spec §5.2a.
     */
    const targetPx = Math.min(MAX_PHONE_PX, h * REST_FRACTION);
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const d = (modelHeight * h) / (2 * targetPx * Math.tan(halfFov));
    camera.position.set(0, 0, d);
    camera.updateProjectionMatrix();

    visibleW = 2 * d * Math.tan(halfFov) * camera.aspect;
    phoneHeightPx = targetPx;
  }
  layout();

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
     * ONE SIDE, and downward. Spec §5.1 / §5.2a supersede the traverse.
     *
     * Both come off `clamped`, the same value that drives the rotation —
     * there is no second timeline to fall out of step with. The descent is
     * linear because the rotation is: an eased descent against a linear spin
     * reads as the phone slowing down while still turning at full rate.
     *
     * The travel is derived from what actually fits: the canvas height less
     * the phone, so the phone never leaves the frame and the number cannot go
     * stale when MAX_PHONE_PX or REST_FRACTION change.
     */
    leanGroup.position.x = PHONE_SIDE_X * visibleW;
    const visibleH = visibleW / camera.aspect;
    const freeH = Math.max(0, visibleH * (1 - phoneHeightPx / (canvas.clientHeight || 1)));
    leanGroup.position.y = (0.5 - clamped) * freeH * DESCENT_USE;
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
  }

  setProgress(0);

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
    resize() { layout(); setProgress(lastProgress); },
    dispose() {
      textures.forEach((t) => t.dispose());
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
    debug(): SceneDebug {
      return {
        ready: true,
        phoneHeightPx,
        screenDotCamera: +lastDot.toFixed(4),
        boundChapter,
        swaps,
        phoneCentreXPx:
          (canvas.clientWidth || 0) / 2 + (leanGroup.position.x / visibleW) * (canvas.clientWidth || 0),
        phoneCentreYPx: (() => {
          const h = canvas.clientHeight || 0;
          const visibleH = visibleW / camera.aspect;
          return h / 2 - (leanGroup.position.y / visibleH) * h;
        })(),
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
