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
  viewportW: number;
  toneMapping: string;
  outputColorSpace: string;
  screenTextureColorSpace: string;
  transmissionFactor: number | null;
  texturesUploaded: number;
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
/** Spec §5.4: 8-12 degrees. */
export const LEAN_DEG = 10;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Which chapter the scroll is heading toward. Flips at the half-turn, which
 *  is exactly where the back faces the camera — so by the time the away-edge
 *  fires, this is already the chapter to bind. */
export function targetChapter(p: number): number {
  return Math.max(0, Math.min(CHAPTERS - 1, Math.round(p * TURNS)));
}

/** Right, left, right. Sides alternate (spec §5.1). */
export function sideOf(chapter: number): 1 | -1 {
  return chapter % 2 === 0 ? 1 : -1;
}

/** Horizontal position as a fraction of half the visible width, eased inside
 *  each transition so it settles at rest points. Still a pure function of
 *  scroll — no time, no inertia. */
export function sideFraction(p: number): number {
  const t = p * TURNS;
  const i = Math.min(TURNS - 1, Math.floor(t));
  const local = smoothstep(Math.min(1, Math.max(0, t - i)));
  const from = sideOf(i);
  const to = sideOf(i + 1);
  return from + (to - from) * local;
}

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

  let boundChapter = -1;
  const swaps: SwapRecord[] = [];
  const bind = (chapter: number) => {
    if (chapter === boundChapter) return false;
    const t = textures[chapter];
    /*
     * BOTH slots. baseColorTexture and emissiveTexture reference the same
     * image (texture index 1) in this GLB, so GLTFLoader may hand the same
     * Texture to `map` and `emissiveMap`. Setting only one leaves the other
     * pointing at the previous image — and since baseColorFactor is black, the
     * visible one is emissiveMap.
     */
    screenMat!.map = t;
    screenMat!.emissiveMap = t;
    screenMat!.needsUpdate = true;
    boundChapter = chapter;
    return true;
  };
  bind(0);

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
    const targetPx = Math.min(MAX_PHONE_PX, h * 0.62);
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
    const g = (screenMesh as unknown as import("three").Mesh).geometry;
    g.computeBoundingBox();
    const e = new THREE.Vector3().subVectors(g.boundingBox!.max, g.boundingBox!.min);
    const axis = e.x <= e.y && e.x <= e.z
      ? new THREE.Vector3(1, 0, 0)
      : e.y <= e.z
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);

    /* Where does that axis point, in world, before we spin anything? */
    spinGroup.rotation.y = 0;
    scene.updateMatrixWorld(true);
    const nm = new THREE.Matrix3().getNormalMatrix(
      (screenMesh as unknown as import("three").Object3D).matrixWorld,
    );

    /*
     * WHICH WAY IS OUT? The thin axis gives a line, not a direction, and
     * getting the direction wrong aims the BACK of the phone at the camera —
     * which is what the previous version did, with a textbook facing curve and
     * swaps at dot -1.000 to say it was fine. The capture showed the camera
     * bump and the Apple logo.
     *
     * The screen sits at the surface; the body's centroid is inside. So the
     * vector from the model's centre to the screen's centre points out through
     * the display, and that settles the sign without anyone squinting at a
     * render.
     */
    const screenWorld = new THREE.Vector3();
    (screenMesh as unknown as import("three").Object3D).getWorldPosition(screenWorld);
    const bodyWorld = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    const outward = screenWorld.sub(bodyWorld).normalize();
    if (axis.clone().applyMatrix3(nm).normalize().dot(outward) < 0) axis.negate();

    const w = axis.clone().applyMatrix3(nm).normalize();

    /* Aim it at the camera (+Z) by rotating about Y. atan2 gives the angle of
       the normal's XZ projection; negating it brings the normal to +Z. */
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
    leanGroup.position.x = sideFraction(clamped) * visibleW * 0.25;
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
        viewportW: canvas.clientWidth || 0,
        toneMapping: renderer.toneMapping === THREE.ACESFilmicToneMapping ? "ACESFilmic" : String(renderer.toneMapping),
        outputColorSpace: renderer.outputColorSpace,
        screenTextureColorSpace: textures[0]?.colorSpace ?? "",
        transmissionFactor,
        texturesUploaded: textures.length,
      };
    },
  };
}
