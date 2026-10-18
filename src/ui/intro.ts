import { h } from "./dom";

const SEEN_KEY = "blanets-intro-seen";

export function mountIntro(dialog: HTMLDialogElement, opener: HTMLElement, onClose: () => void): void {
  const enter = h("button", { class: "button", type: "button", text: "Enter the torus", autofocus: true });
  dialog.append(
    h("h2", { text: "Millions of planets, born in the dust around a black hole" }),
    h(
      "p",
      {},
      "A parsec or more from a supermassive black hole, the gas spiralling in cools enough for dust to survive. Mishra, Lyra, McKernan, Mac Low, Ford and Cook (2026) ask what happens if that dust behaves like the dust around young stars:",
    ),
    h(
      "ol",
      {},
      h("li", {}, "Strong magnetic fields hold up a thick, cool torus where grains stick together into pebbles."),
      h("li", {}, "The streaming instability herds pebbles into filaments holding up to millions of Jupiter masses of dust."),
      h("li", {}, "Filaments collapse into tens to hundreds of objects each, from Jupiter mass to beyond the hydrogen-burning limit, made of nothing but dust."),
      h("li", {}, "Those that accrete fast enough could grow into stars, and the heaviest into intermediate-mass black holes."),
    ),
    h(
      "p",
      {},
      "This site rebuilds the paper's model, checked against its own figures, and lets you fly between the bodies it predicts and try to talk across the torus. Markers next to each setting tell you whether a number comes from the paper, was fitted to its figures, or is our own assumption.",
    ),
    h(
      "p",
      { class: "cite" },
      "Mishra, B., Lyra, W., McKernan, B., Mac Low, M.-M., Ford, K. E. S., & Cook, H. E. 2026, ApJ, “Active Galactic Nucleus Tori: Potential Birthplace to Millions of Planets”, ",
      h("a", { href: "https://arxiv.org/abs/2605.19241", target: "_blank", rel: "noopener", text: "arXiv:2605.19241" }),
    ),
    h("div", { class: "button-row" }, enter),
  );
  const close = () => {
    dialog.close();
    localStorage.setItem(SEEN_KEY, "1");
    onClose();
  };
  enter.addEventListener("click", close);
  dialog.addEventListener("cancel", () => {
    localStorage.setItem(SEEN_KEY, "1");
    onClose();
  });
  opener.addEventListener("click", () => dialog.showModal());
  if (!localStorage.getItem(SEEN_KEY)) dialog.showModal();
  else onClose();
}
