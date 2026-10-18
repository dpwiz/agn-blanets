import json
import math
import sys

COLOR_MASS = {
    "#1f77b4": "1e9", "#0000ff": "1e9",
    "#ff7f0e": "1e8", "#ffa500": "1e8",
    "#2ca02c": "1e7", "#008000": "1e7",
}

SAMPLE_PC = [0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100]


def panel(name, frame, xticks, yticks):
    return {"name": name, "frame": frame, "x": xticks, "y": yticks}


FIG2_COLS = [(99.7, 337.3), (475.2, 712.9), (850.8, 1088.4)]
FIG2_ROWS = [(9.6, 293.2), (293.2, 576.8), (576.8, 860.4)]


def fig2_panel(name, col, row, yticks):
    x0, x1 = FIG2_COLS[col]
    y0, y1 = FIG2_ROWS[row]
    return panel(name, [x0, y0, x1, y1], [[x0, -1], [x1, 2]], yticks)


FIG3_COLS = [(117.9, 665.0), (774.4, 1321.4), (1430.9, 1977.9)]


def fig3_panel(name, col, yticks):
    x0, x1 = FIG3_COLS[col]
    return panel(name, [x0, 9.6, x1, 601.0], [[x0, -1], [x1, 2]], yticks)


FIGURES = {
    "sgdisk_alpha1em4_mbhvar_zoom": [
        panel("rho_cgs", [116.3, 9.6, 552.9, 241.7], [[136.1, -1], [533.0, 2]], [[20.8, -11], [193.4, -20]]),
        panel("T", [671.6, 9.6, 1108.3, 241.7], [[691.5, -1], [1088.4, 2]], [[37.0, 3], [231.6, 2]]),
        panel("Sigma_cgs", [116.3, 241.7, 552.9, 473.8], [[136.1, -1], [533.0, 2]], [[263.1, 4], [405.0, 0]]),
        panel("h", [671.6, 241.7, 1108.3, 473.8], [[691.5, -1], [1088.4, 2]], [[307.5, -1], [410.2, -2]]),
    ],
    "streaminginstabilitymbhStSI1e-2vfrag100": [
        fig2_panel("St", 0, 0, [[52.5, 2], [232.1, -2]]),
        fig2_panel("a_mm", 1, 0, [[75.7, 4], [221.4, -2]]),
        fig2_panel("t_grow_Myr", 2, 0, [[23.8, 3], [211.3, -1]]),
        fig2_panel("t_SI_Myr", 0, 1, [[335.5, 1], [521.6, -1]]),
        fig2_panel("eta", 1, 1, [[326.3, -1], [573.5, -5]]),
        fig2_panel("m_f_MJ", 2, 1, [[344.3, 6], [508.5, 2]]),
        fig2_panel("m_p_MJ", 0, 2, [[633.1, 3], [817.5, 0]]),
        fig2_panel("N_p", 1, 2, [[620.6, 3], [742.4, 2]]),
        fig2_panel("radii_pc", 2, 2, [[581.8, 0], [820.2, -8]]),
    ],
    "Vfrag1000SI1e-2": [
        fig3_panel("St", 0, [[39.4, 0], [574.1, -2]]),
        fig3_panel("a_mm", 1, [[103.4, 2], [528.7, -2]]),
        fig3_panel("t_SI_Myr", 2, [[97.8, 1], [485.8, -1]]),
    ],
    "Vfrag100SI1e-3": [
        fig3_panel("St", 0, [[41.9, -2], [537.6, -3]]),
        fig3_panel("a_mm", 1, [[103.4, 0], [528.7, -4]]),
        fig3_panel("t_SI_Myr", 2, [[154.1, 0], [422.7, -1]]),
    ],
    "accretion_dustgasSt1e-2Vfrag100": [
        panel("mdot_MJ_yr", [120.3, 35.8, 724.9, 462.3], [[147.7, -1], [697.4, 2]], [[106.8, -6], [429.8, -9]]),
    ],
    "accretion_dustgasSt1e-2Vfrag1000": [
        panel("mdot_MJ_yr", [120.3, 35.8, 724.9, 462.3], [[147.7, -1], [697.4, 2]], [[94.5, -3], [461.0, -7]]),
    ],
    "timeMjupDust_delta1em5_mbhvarSt1e-2Vfrag100": [
        panel("t_acc_yr", [105.6, 35.8, 703.4, 462.3], [[105.6, -1], [703.4, 2]], [[74.9, 9], [446.7, 5]]),
    ],
    "timeMjupDust_delta1em5_mbhvarSt1e-2Vfrag1000": [
        panel("t_acc_yr", [105.6, 35.8, 703.4, 462.3], [[105.6, -1], [703.4, 2]], [[45.3, 7], [453.6, 2]]),
    ],
    "total_filamentsSt1e-2Vfrag100": [
        panel("N_filaments_cum", [92.7, 9.6, 568.9, 364.4], [[92.7, -1], [568.9, 2]], [[31.8, 5], [298.9, 2]]),
    ],
    "total_planetsSt1e-2Vfrag100": [
        panel("N_planets_cum", [92.7, 9.6, 568.9, 364.4], [[92.7, -1], [568.9, 2]], [[80.5, 6], [315.4, 4]]),
    ],
}


def dash_kind(dash):
    if not dash:
        return "solid"
    return "dashdot" if len(dash.split(",")) == 4 else "dashed"


def lin(p, a, b):
    return a[1] + (p - a[0]) * (b[1] - a[1]) / (b[0] - a[0])


def inside(frame, pt):
    return frame[0] - 1 <= pt[0] <= frame[2] + 1 and frame[1] - 1 <= pt[1] <= frame[3] + 1


def to_data(pn, pts):
    out = []
    for x, y in pts:
        if inside(pn["frame"], (x, y)):
            out.append((lin(x, *pn["x"]), lin(y, *pn["y"])))
    return out


def sample(curve, samples):
    curve = sorted(curve)
    res = []
    for r in samples:
        lx = math.log10(r)
        if lx < curve[0][0] - 1e-3 or lx > curve[-1][0] + 1e-3:
            continue
        lx = min(max(lx, curve[0][0]), curve[-1][0])
        for (x0, y0), (x1, y1) in zip(curve, curve[1:]):
            if x0 <= lx <= x1:
                ly = y0 if x1 == x0 else y0 + (lx - x0) * (y1 - y0) / (x1 - x0)
                res.append([r, round(10 ** ly, 6 - int(math.floor(ly)) if ly < 6 else 0)])
                break
    return res


def main(src, dst):
    raw = json.load(open(src))
    allp = json.loads(raw) if isinstance(raw, str) else raw
    result = {}
    for fig, panels in FIGURES.items():
        result[fig] = {}
        for p in allp[fig]:
            mass = COLOR_MASS.get(p["stroke"])
            if not mass or len(p["pts"]) < 5:
                continue
            mid = p["pts"][len(p["pts"]) // 2]
            pn = next((q for q in panels if inside(q["frame"], mid)), None)
            if pn is None:
                continue
            width = max(x for x, _ in p["pts"]) - min(x for x, _ in p["pts"])
            if width < 0.3 * (pn["frame"][2] - pn["frame"][0]):
                continue
            curve = to_data(pn, p["pts"])
            key = f'{mass}:{dash_kind(p["dash"])}'
            series = result[fig].setdefault(pn["name"], {})
            if key in series:
                key = key + "#" + str(sum(1 for k in series if k.startswith(key)))
            series[key] = sample(curve, SAMPLE_PC)
    json.dump(result, open(dst, "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
