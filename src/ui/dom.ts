import { PARAM_INFO, type ModelParams, type Provenance } from "../physics/params";

type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "text") el.textContent = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

const SOURCE_LABEL: Record<Provenance, string> = {
  paper: "From the paper",
  calibrated: "Calibrated to the paper's figures",
  assumed: "Our assumption",
};

const tooltip = () => document.getElementById("tooltip") as HTMLDivElement;

export function attachTip(el: HTMLElement, title: string, body: string): void {
  const show = () => {
    const t = tooltip();
    t.innerHTML = `<span class="tip-source">${title}</span>${body}`;
    t.hidden = false;
    const r = el.getBoundingClientRect();
    const left = Math.min(r.right + 8, window.innerWidth - 300);
    t.style.left = `${left}px`;
    t.style.top = `${Math.min(r.top, window.innerHeight - 140)}px`;
  };
  const hide = () => {
    tooltip().hidden = true;
  };
  el.addEventListener("mouseenter", show);
  el.addEventListener("mouseleave", hide);
  el.addEventListener("focus", show);
  el.addEventListener("blur", hide);
}

export function sourceGlyph(key: keyof ModelParams): HTMLElement {
  const info = PARAM_INFO[key];
  const g = h("span", { class: `source ${info.source}`, tabindex: 0, role: "img", "aria-label": SOURCE_LABEL[info.source] });
  attachTip(g, SOURCE_LABEL[info.source], info.note);
  return g;
}

export function assumptionGlyph(body: string): HTMLElement {
  const g = h("span", { class: "source assumed", tabindex: 0, role: "img", "aria-label": SOURCE_LABEL.assumed });
  attachTip(g, SOURCE_LABEL.assumed, body);
  return g;
}

export function sourceLegend(): HTMLElement {
  const item = (source: Provenance) => h("span", {}, h("span", { class: `source ${source}` }), SOURCE_LABEL[source]);
  return h("div", { class: "legend-sources" }, item("paper"), item("calibrated"), item("assumed"));
}

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  log?: boolean;
  format: (v: number) => string;
  hint?: string;
  glyph?: HTMLElement;
  onInput?: (v: number) => void;
  onChange: (v: number) => void;
}

export function slider(o: SliderOptions): HTMLElement {
  const id = `s-${Math.random().toString(36).slice(2, 9)}`;
  const toSlider = (v: number) => (o.log ? Math.log10(v) : v);
  const fromSlider = (x: number) => (o.log ? 10 ** x : x);
  const input = h("input", {
    type: "range",
    id,
    min: toSlider(o.min),
    max: toSlider(o.max),
    step: o.step ?? (o.log ? 0.01 : (o.max - o.min) / 200),
    value: toSlider(o.value),
  });
  const out = h("output", { for: id, text: o.format(o.value) });
  input.addEventListener("input", () => {
    const v = fromSlider(Number(input.value));
    out.textContent = o.format(v);
    o.onInput?.(v);
  });
  input.addEventListener("change", () => o.onChange(fromSlider(Number(input.value))));
  return h(
    "div",
    { class: "control" },
    h("label", { for: id }, o.glyph ?? null, o.label),
    out,
    input,
    o.hint ? h("span", { class: "hint", text: o.hint }) : null,
  );
}

export function segmented<T extends string>(
  label: string,
  options: { value: T; label: string }[],
  current: T,
  onChange: (v: T) => void,
  glyph?: HTMLElement,
  hint?: string,
): HTMLElement {
  const group = h("div", { class: "segmented", role: "group", "aria-label": label });
  const buttons = options.map((opt) => {
    const b = h("button", { type: "button", "aria-pressed": String(opt.value === current), text: opt.label });
    b.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === b));
      onChange(opt.value);
    });
    group.append(b);
    return b;
  });
  return h(
    "div",
    { class: "control" },
    h("span", { class: "control-name" }, glyph ?? null, label),
    h("span", {}),
    group,
    hint ? h("span", { class: "hint", text: hint }) : null,
  );
}

export function readout(rows: [string, string, string?][]): HTMLElement {
  const dl = h("dl", { class: "readout" });
  for (const [k, v, cls] of rows) dl.append(h("dt", { text: k }), h("dd", { class: cls, text: v }));
  return dl;
}
