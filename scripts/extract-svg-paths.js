async (names) => {
  const all = {};
  for (const n of names) {
    const txt = await (await fetch(`/${n}.svg`)).text();
    const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
    const svg = document.importNode(doc.documentElement, true);
    document.documentElement.appendChild(svg);
    const out = [];
    for (const p of svg.querySelectorAll("path")) {
      if (p.closest("defs") || p.closest("clipPath")) continue;
      const stroke = p.getAttribute("stroke") || "none";
      if (stroke === "none") continue;
      let len = 0;
      try {
        len = p.getTotalLength();
      } catch {
        len = 0;
      }
      const m = p.getCTM();
      const k = Math.max(2, Math.min(600, Math.ceil(len)));
      const pts = [];
      if (len > 0) {
        for (let i = 0; i <= k; i++) {
          const q = p.getPointAtLength((len * i) / k);
          pts.push([+(m.a * q.x + m.c * q.y + m.e).toFixed(3), +(m.b * q.x + m.d * q.y + m.f).toFixed(3)]);
        }
      }
      out.push({ stroke, sw: p.getAttribute("stroke-width"), dash: p.getAttribute("stroke-dasharray"), len, pts });
    }
    all[n] = out;
    svg.remove();
  }
  return JSON.stringify(all);
};
