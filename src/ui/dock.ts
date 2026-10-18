import { store, type AppState, type DockTab } from "../state";
import { h } from "./dom";
import { renderClocks, tickClocks } from "./clocks";
import { renderExplore } from "./explore";
import { renderHop } from "./hop";
import { refreshRoute, renderSignal, tickNetwork, tickSignal } from "./signal";

const TABS: { id: DockTab; label: string }[] = [
  { id: "explore", label: "Explore" },
  { id: "hop", label: "Fly" },
  { id: "signal", label: "Signal" },
  { id: "clocks", label: "Clocks" },
];

const RERENDER_ON: (keyof AppState)[] = [
  "tab",
  "selected",
  "origin",
  "target",
  "armedSlot",
  "hopKind",
  "torchAccelerationG",
  "exhaustFractionC",
  "orbitalExhaustKms",
  "ship",
  "params",
  "band",
  "rig",
  "network",
  "route",
  "showNetwork",
  "clockSyncYr",
  "view",
  "focus",
  "eraMode",
];

export function mountDock(root: HTMLElement, onFrame: (hook: (dt: number) => void) => void): void {
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const body = h("div", { class: "tab-body", role: "tabpanel" });
  root.append(tabs, body);

  const renderTabs = (s: AppState) => {
    tabs.replaceChildren(
      ...TABS.map((t) => {
        const b = h("button", { type: "button", role: "tab", "aria-selected": String(s.tab === t.id), text: t.label });
        b.addEventListener("click", () => store.set({ tab: t.id, armedSlot: null, hopPreview: null }));
        return b;
      }),
    );
  };

  const renderBody = (s: AppState) => {
    const scroll = body.scrollTop;
    const content =
      s.tab === "explore" ? renderExplore(s) : s.tab === "hop" ? renderHop(s) : s.tab === "signal" ? renderSignal(s) : renderClocks(s);
    body.replaceChildren(content);
    body.scrollTop = scroll;
  };

  renderTabs(store.state);
  renderBody(store.state);
  store.subscribe((s, changed) => {
    if (changed.has("tab")) renderTabs(s);
    if ((changed.has("origin") || changed.has("target")) && refreshRoute(s)) return;
    if (RERENDER_ON.some((k) => changed.has(k))) renderBody(s);
    else if (changed.has("eraYr") && s.eraMode && (s.tab === "explore" || s.tab === "signal")) renderBody(s);
  });

  let acc = 0;
  let renderedEraYr = store.state.eraYr;
  onFrame((dt) => {
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    const s = store.state;
    if (s.eraSweeping && s.tab === "explore" && s.selected && s.eraYr !== renderedEraYr) {
      renderedEraYr = s.eraYr;
      renderBody(s);
    }
    if (s.tab === "signal") {
      tickSignal(s);
      tickNetwork(s);
    }
    if (s.tab === "clocks") tickClocks(s);
  });
}
