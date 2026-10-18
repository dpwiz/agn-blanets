import type { Vector3 } from "three";

export interface LabelSpec {
  key: string;
  html: string;
  className: string;
  position: Vector3;
}

export class LabelLayer {
  private pool = new Map<string, HTMLDivElement>();

  constructor(private root: HTMLElement) {}

  render(specs: LabelSpec[], project: (p: Vector3) => { x: number; y: number; visible: boolean }): void {
    const seen = new Set<string>();
    for (const s of specs) {
      seen.add(s.key);
      let el = this.pool.get(s.key);
      if (!el) {
        el = document.createElement("div");
        this.root.appendChild(el);
        this.pool.set(s.key, el);
      }
      if (el.dataset.html !== s.html) {
        el.innerHTML = s.html;
        el.dataset.html = s.html;
      }
      el.className = `scene-label ${s.className}`;
      const p = project(s.position);
      el.style.display = p.visible ? "block" : "none";
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    }
    for (const [key, el] of this.pool) {
      if (!seen.has(key)) {
        el.remove();
        this.pool.delete(key);
      }
    }
  }
}
