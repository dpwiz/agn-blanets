import type { Blanet } from "../physics/bodies";
import { circularOrbitClockRate } from "../physics/clocks";
import { YR } from "../physics/constants";
import { shipStateAt } from "../ship";
import { smbhMassKg, store, type AppState } from "../state";
import { duration, simTime } from "../format";
import { h } from "./dom";

let list: HTMLElement | null = null;

interface ClockRow {
  who: string;
  elapsed: number;
  note: string;
}

function rows(s: AppState): ClockRow[] {
  const mSmbh = smbhMassKg(s.params);
  const since = Math.max(s.timeYr - s.clockSyncYr, 0) * YR;
  const out: ClockRow[] = [{ who: "Far-away observer", elapsed: since, note: "Coordinate time, far from the black hole" }];
  const seen = new Set<number>();
  const add = (b: Blanet | null, role: string) => {
    if (!b || seen.has(b.id)) return;
    seen.add(b.id);
    const rate = circularOrbitClockRate(b.orbit.radius, mSmbh);
    out.push({ who: `${b.name}${role}`, elapsed: since * rate, note: `Loses ${duration((1 - rate) * YR)} per year` });
  };
  add(s.selected, "");
  add(s.origin, ", origin");
  add(s.target, ", destination");
  if (s.ship) {
    const now = shipStateAt(s.ship, s.timeYr * YR, mSmbh);
    const reference = Math.max(s.clockSyncYr * YR, s.ship.startTime);
    const atReference = shipStateAt(s.ship, reference, mSmbh);
    const shipElapsed = now.properTime - atReference.properTime;
    const outsideElapsed = Math.max(s.timeYr * YR - reference, 0);
    const status = now.status === "flying" ? `flying leg ${now.legIndex + 1}` : now.status === "waiting" ? "waiting to depart" : "arrived";
    const spanLabel = reference > s.clockSyncYr * YR ? "since launch" : "since the sync";
    out.push({
      who: "Your ship",
      elapsed: shipElapsed,
      note: `${status}; ${duration(Math.max(outsideElapsed - shipElapsed, 0))} behind the far observer ${spanLabel}`,
    });
  }
  return out;
}

export function tickClocks(s: AppState): void {
  if (!list || !list.isConnected) return;
  list.replaceChildren(
    ...rows(s).map((r) =>
      h("li", {}, h("span", { class: "who", text: r.who }), h("span", { class: "elapsed", text: duration(r.elapsed) }), h("span", { class: "rate", text: r.note })),
    ),
  );
}

export function renderClocks(s: AppState): HTMLElement {
  list = h("ul", { class: "clock-list" });
  const sync = h("button", { class: "button", type: "button", text: "Synchronise all clocks now" });
  sync.addEventListener("click", () => store.set({ clockSyncYr: store.state.timeYr }));
  const view = h(
    "div",
    {},
    h("h2", { text: "Clocks" }),
    h("p", { text: "Every clock here ticks slower than one far from the black hole: by gravity, and by orbital speed. A ship burning near light speed falls behind by far more." }),
    h("div", { class: "button-row" }, sync),
    h("p", { class: "axis-note", text: `Synchronised at ${simTime(s.clockSyncYr)}.` }),
    list,
    h("p", { class: "axis-note", text: "Rates use the Schwarzschild circular-orbit factor √(1 − 3GM/rc²). Pick bodies in Explore, Fly or Signal to add their clocks." }),
  );
  tickClocks(s);
  return view;
}
