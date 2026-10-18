import { PC } from "../physics/constants";
import { store, type AppState, type SlotRole } from "../state";
import { h } from "./dom";

export function slots(s: AppState, labels: Record<SlotRole, string> = { origin: "From", target: "To" }): HTMLElement {
  const make = (role: SlotRole) => {
    const body = s[role];
    const btn = h(
      "button",
      { type: "button", class: `slot ${role}${s.armedSlot === role ? " armed" : ""}`, "aria-pressed": String(s.armedSlot === role) },
      h("small", { text: s.armedSlot === role ? `${labels[role]}: click a body` : labels[role] }),
      h("strong", { text: body ? body.name : "Not chosen" }),
      body ? h("small", { text: `${(body.orbit.radius / PC).toPrecision(3)} pc out` }) : null,
    );
    btn.addEventListener("click", () => store.set({ armedSlot: s.armedSlot === role ? null : role }));
    return btn;
  };
  const swap = h("button", { class: "link-button", type: "button", text: "Swap" });
  swap.addEventListener("click", () => store.set({ origin: s.target, target: s.origin, hopPreview: null, route: null }));
  return h("div", {}, h("div", { class: "slots" }, make("origin"), make("target")), s.origin && s.target ? swap : null);
}
