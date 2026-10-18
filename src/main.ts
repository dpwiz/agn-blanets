import "@fontsource/gloock/400.css";
import "@fontsource/barlow-semi-condensed/400.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "./style.css";
import { createScene } from "./render/scene";
import { TORUS_CAMERA, World } from "./render/world";
import { mountDock } from "./ui/dock";
import { mountIntro } from "./ui/intro";
import { mountModelPanel } from "./ui/model-panel";
import { mountTimebar } from "./ui/timebar";
import { store } from "./state";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ctx = createScene(byId<HTMLCanvasElement>("scene"));
const world = new World(ctx, byId("labels"));
ctx.camera.position.set(0, 160, 260);
mountModelPanel(byId("model-panel"));
mountDock(byId("dock"), ctx.onFrame);
mountTimebar(byId("timebar"), ctx.onFrame);
mountIntro(byId<HTMLDialogElement>("intro"), byId("about-open"), () => {
  ctx.flyTo(TORUS_CAMERA.position, TORUS_CAMERA.target, 3.2);
  store.set({ playing: true });
});

if (import.meta.env.DEV) Object.assign(window, { blanets: { store, world, ctx } });
