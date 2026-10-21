# Blanets

An interactive model of the planets that may form in the dusty tori around supermassive black holes, after
Mishra, Lyra, McKernan, Mac Low, Ford & Cook (2026), *Active Galactic Nucleus Tori: Potential Birthplace to Millions of Planets*
([arXiv:2605.19241](https://arxiv.org/abs/2605.19241)).

- **The torus**: the paper's magnetically supported disk, dust growth, streaming-instability filaments, planetesimal masses,
  pebble and gas accretion, and population counts, all live and tunable.
- **Fly**: Lambert transfers with porkchop plots, or a relativistic constant-acceleration torchship, chained into itineraries.
- **Signal**: light and Shapiro delay, occultation by the black hole and inner disk, dust and gas opacity along the beam
  (from the model's own grain sizes), AGN glare, Shannon data rates, and relay networks across a neighbourhood.
- **Clocks**: gravitational and kinematic time dilation for bodies and your ship.

## Running

```sh
npm install
npm run dev        # local dev server
npm test           # calibration against the paper's figures plus physics checks
npm run build      # static site in dist/
```

## Through time and the midplane maps

The time bar's lower row switches between the paper's view (every body at its birth mass) and a timeline from 1 kyr to
10 Gyr after the AGN lights up. The timeline goes beyond the paper, and the site tags it as our assumption:

- A body appears once its grains reach the streaming-instability size, and only where the paper's formation conditions
  hold. With the fiducial parameters that leaves only the outer torus, whatever the Fig 6 counting mode says.
- It grows at its local e-folding rate until the AGN switches off. The bodies of a ring share its dust evenly, so growth
  slows as that share runs out (logistic growth), and the thermal mass caps it. Gas arrives at the paper's gas-to-pebble
  ratio (Eqs 43–44), at most 2/9 of the pebble rate, so grown bodies stay mostly rock.
- A body shines as a star once it holds as much hydrogen as the lightest ordinary star (0.7 × 0.075 M☉), then lives
  10 Gyr × (M/M☉)^−2.5, at least 3 Myr, and leaves a remnant. With the paper's dust-to-gas ratio no body gathers that
  much, so the timeline ends in brown dwarfs and stellar-mass balls of rock.
- When the AGN dies, its glare goes and the gas disperses over a fifth of its lifetime. Growth stops, and the haze and
  the optical depth along every beam fade together, so every band in the Signal tool eventually gets through.

The midplane maps show the gas temperature, with the 373 and 273 K isotherms and the frost line where water ice
survives on the grains at the torus's own gas density, and what bodies become: the paper's fate rule with the growth
above, or their stage at the chosen time. Explore adds estimates of conditions on each body (accretion glow,
the sky's visible-light optical depth, the climb to the torus surface). These are our estimates, not the paper's.
The Fly tool still uses birth masses.

## Civilization layer

Three more midplane maps and an Explore section carry speculation about who could live in the torus. Every piece is
tagged as our assumption; none of it is in the paper. The maps follow the timeline and switch it on when chosen.

- **Who could live here** gives each ring the first niche that fits: moons of glowing worlds (a body above 10²⁵ W with
  an Earth-light orbit inside its Hill radius), a hydrogen well (bodies at least 5% hydrogen), an oven midplane above
  373 K or the liquid-water band at 273–373 K while the AGN shines, frost on the grains after it switches off, or cold
  rock worlds. Dashed Hohmann arcs mark the hydrogen route out of the well and the crossing from the liquid-water band
  to the cold realm, with their Δv and travel time.
- **What you can mine** maps hydrogen, water, carbon, sulfur or iron held in solids, inside bodies and on free grains,
  per square metre. It uses solar abundances, iron sulfide below 700 K, refractory organics below 500 K and water ice
  below the frost point at the local gas density.
- **Where a culture spreads** follows a culture seeded on a chosen body as it hops ring to ring by Hohmann transfers
  or 1 g torchships, taking 1 kyr to settle each ring and waiting for its bodies to form.
- Explore's **Civilization here** gives the body's glow and Kardashev level now, its moons' Earth-light orbit, the
  hydrogen it holds, the state of water, carbon and sulfur around it, the cost of leaving it, its neighbours' spacing
  and turnover, a hop to the next ring, and the data rate to a neighbour in the chosen Signal band.

## Calibration

The paper leaves several inputs unstated. `tests/fixtures/paper-figs.json` holds curves digitized from the paper's own
SVG figures. To regenerate it, serve the figure SVGs from the saved arXiv page over HTTP, evaluate
`scripts/extract-svg-paths.js` in a page on that server with the list of figure names, save the returned JSON, and run
`python3 scripts/digitize_figs.py <paths.json> tests/fixtures/paper-figs.json`.
`tests/calibration.test.ts` checks the model against them, and `npx tsx tests/calibration-report.ts` prints the fit.
Every parameter in `src/physics/params.ts` is tagged as taken from the paper, calibrated to its figures, or assumed,
and the site shows the same tags.

Known departures from the figures:

- Fig 5 accretion rates match only in the "As in Fig 5" mode (Bondi everywhere, no cutoff); for v_frag = 10 m/s they
  still differ by up to ~1 dex. The default mode follows the text's regime-dependent recipe instead.
- Eq 25 (Klahr & Schreiber) as printed gives masses ~10× the KS20 curve in Fig 2g; the paper and site use Eq 24.
- Fig 4 transition masses are reproduced to within roughly 0.5 dex.
