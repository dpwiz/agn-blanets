import { store, type AppState, type ColorBy, type ViewMode } from "../state";
import { simTime, sci } from "../format";
import { cssColor, FATE_COLOR, massColor, REGIME_COLOR, REMNANT_COLOR } from "../render/palette";
import { FATE_LABEL } from "../physics/fate";
import { h, segmented } from "./dom";
import { eraRow } from "./era";

function legend(colorBy: ColorBy, eraMode: boolean): HTMLElement {
  const items = legendItems(colorBy);
  if (eraMode) items.append(h("span", {}, h("i", { style: `background:${cssColor(REMNANT_COLOR)}` }), "Dead star"));
  return items;
}

function legendItems(colorBy: ColorBy): HTMLElement {
  const item = (color: string, label: string) => h("span", {}, h("i", { style: `background:${color}` }), label);
  if (colorBy === "regime") {
    return h("div", { class: "legend" }, item(cssColor(REGIME_COLOR.hill), "Hill"), item(cssColor(REGIME_COLOR.bondi), "Bondi"), item(cssColor(REGIME_COLOR.geometric), "Geometric"));
  }
  if (colorBy === "fate") {
    return h(
      "div",
      { class: "legend" },
      ...(["frozen", "growing", "unlit", "star", "bhProgenitor", "imbhProgenitor"] as const).map((f) => item(cssColor(FATE_COLOR[f]), FATE_LABEL[f])),
    );
  }
  return h(
    "div",
    { class: "legend" },
    ...[
      [-0.5, "0.3 Mjup"],
      [0.5, "3 Mjup"],
      [1.3, "20 Mjup"],
      [1.9, "80 Mjup"],
      [3, "1 M☉"],
    ].map(([lg, label]) => item(cssColor(massColor(lg as number)), label as string)),
  );
}

export function mountTimebar(root: HTMLElement, onFrame: (hook: (dt: number) => void) => void): void {
  const play = h("button", { class: "play", type: "button" });
  play.addEventListener("click", () => store.set({ playing: !store.state.playing }));
  const clock = h("div", { class: "clock" }, h("strong", { text: "0 yr" }), h("span", { text: "since you arrived" }));
  const speedInput = h("input", { type: "range", min: 0, max: 6, step: 0.01, value: Math.log10(store.state.speedYrPerSec), "aria-label": "Simulation speed" });
  const speedLabel = h("span", {});
  const updateSpeedLabel = () => {
    speedLabel.textContent = `${sci(store.state.speedYrPerSec, 2)} years per second`;
  };
  speedInput.addEventListener("input", () => {
    store.state.speedYrPerSec = 10 ** Number(speedInput.value);
    updateSpeedLabel();
  });
  updateSpeedLabel();
  const speed = h("label", { class: "speed" }, speedLabel, speedInput);
  const legendSlot = h("div", {});
  const stretch = h("input", { type: "range", min: 1, max: 12, step: 0.5, value: store.state.zExaggeration, "aria-label": "Vertical stretch" });
  stretch.addEventListener("input", () => store.set({ zExaggeration: Number(stretch.value) }));

  const render = (s: AppState) => {
    play.textContent = s.playing ? "❚❚" : "▶";
    play.setAttribute("aria-label", s.playing ? "Pause time" : "Run time");
    legendSlot.replaceChildren(legend(s.colorBy, s.eraMode));
    colorSelect.value = s.colorBy;
  };

  const viewControl = segmented<ViewMode>(
    "View",
    [
      { value: "torus", label: "Whole torus" },
      { value: "local", label: "Neighbourhood" },
    ],
    store.state.view,
    (v) => store.set({ view: v }),
  );
  const viewSwitch = viewControl.querySelector(".segmented") as HTMLElement;
  viewSwitch.classList.add("view-switch");
  const colorSelect = h(
    "select",
    { "aria-label": "Colour bodies by" },
    h("option", { value: "mass", text: "Colour by mass" }),
    h("option", { value: "regime", text: "Colour by accretion regime" }),
    h("option", { value: "fate", text: "Colour by likely fate" }),
  );
  colorSelect.addEventListener("change", () => store.set({ colorBy: colorSelect.value as ColorBy }));

  const mobileSwitch = h("div", { class: "mobile-switch segmented", role: "group", "aria-label": "Show panel" });
  for (const [cls, label] of [["show-model", "Model"], ["show-dock", "Tools"]] as const) {
    const b = h("button", { type: "button", "aria-pressed": "false", text: label });
    b.addEventListener("click", () => {
      const on = !document.body.classList.contains(cls);
      document.body.classList.remove("show-model", "show-dock");
      if (on) document.body.classList.add(cls);
      for (const other of mobileSwitch.querySelectorAll("button")) if (other !== eraToggle) other.setAttribute("aria-pressed", String(other === b && on));
    });
    mobileSwitch.append(b);
  }
  const eraToggle = h("button", { type: "button", "aria-pressed": "false", text: "Era" });
  eraToggle.addEventListener("click", () => {
    const on = document.body.classList.toggle("show-era");
    eraToggle.setAttribute("aria-pressed", String(on));
  });
  mobileSwitch.append(eraToggle);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--timebar-h", `${root.offsetHeight}px`);
  }).observe(root);

  root.append(
    mobileSwitch,
    play,
    clock,
    speed,
    h("div", { class: "group" }, viewSwitch),
    h("div", { class: "group" }, colorSelect),
    h("label", { class: "group" }, h("span", { text: "Vertical stretch" }), stretch),
    h("div", { class: "spacer" }),
    legendSlot,
    eraRow(onFrame),
  );
  render(store.state);
  store.subscribe((s, changed) => {
    if (changed.has("playing") || changed.has("colorBy") || changed.has("eraMode")) render(s);
    if (changed.has("speedYrPerSec")) {
      speedInput.value = String(Math.log10(s.speedYrPerSec));
      updateSpeedLabel();
    }
    if (changed.has("view")) {
      for (const b of root.querySelectorAll<HTMLButtonElement>(".view-switch button")) {
        b.setAttribute("aria-pressed", String(b.textContent === (s.view === "torus" ? "Whole torus" : "Neighbourhood")));
      }
    }
  });
  let acc = 0;
  onFrame((dt) => {
    acc += dt;
    if (acc < 0.1) return;
    acc = 0;
    (clock.firstChild as HTMLElement).textContent = simTime(store.state.timeYr);
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      store.set({ playing: !store.state.playing });
    }
  });
}
