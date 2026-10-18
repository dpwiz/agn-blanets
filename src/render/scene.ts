import { Timer, Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type FrameHook = (dt: number) => void;

export interface SceneContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  canvas: HTMLCanvasElement;
  onFrame(hook: FrameHook): void;
  project(p: Vector3): { x: number; y: number; visible: boolean };
  flyTo(position: Vector3, target: Vector3, seconds: number): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new Color(0x000000), 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.01, 2000);
  camera.position.set(0, 34, 62);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.5;
  controls.maxDistance = 400;
  controls.target.set(0, 0, 0);

  const hooks: FrameHook[] = [];
  const timer = new Timer();
  timer.connect(document);
  let flight: { from: Vector3; to: Vector3; fromT: Vector3; toT: Vector3; t: number; duration: number } | null = null;

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? Math.min(85, 45 / camera.aspect ** 0.8) : 45;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  const tmp = new Vector3();
  const ctx: SceneContext = {
    renderer,
    scene,
    camera,
    controls,
    canvas,
    onFrame(hook) {
      hooks.push(hook);
    },
    project(p) {
      tmp.copy(p).project(camera);
      return {
        x: ((tmp.x + 1) / 2) * window.innerWidth,
        y: ((1 - tmp.y) / 2) * window.innerHeight,
        visible: tmp.z < 1 && tmp.z > -1,
      };
    },
    flyTo(position, target, seconds) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || seconds <= 0) {
        camera.position.copy(position);
        controls.target.copy(target);
        flight = null;
        return;
      }
      flight = { from: camera.position.clone(), to: position.clone(), fromT: controls.target.clone(), toT: target.clone(), t: 0, duration: seconds };
    },
  };

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    if (flight) {
      flight.t += dt;
      const u = Math.min(flight.t / flight.duration, 1);
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      camera.position.lerpVectors(flight.from, flight.to, e);
      controls.target.lerpVectors(flight.fromT, flight.toT, e);
      if (u >= 1) flight = null;
    }
    controls.update();
    for (const hook of hooks) hook(dt);
    renderer.render(scene, camera);
  });

  return ctx;
}
