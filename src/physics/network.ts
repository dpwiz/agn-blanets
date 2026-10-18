import { agnSightlineDepth, BANDS, linkBudget, pathDepth, type BandId, type CommsEnvironment, type Transceiver } from "./comms";
import type { Vec3 } from "./vec";

export interface NetworkEdge {
  a: number;
  b: number;
  delay: number;
  capacity: number;
  snr: number;
}

export interface NetworkGraph {
  nodeCount: number;
  edges: NetworkEdge[];
  adjacency: number[][];
}

export interface NetworkOptions {
  band: BandId;
  rig: Transceiver;
  minCapacity: number;
  maxRange: number;
  relayDelay: number;
}

export function buildNetwork(positions: Vec3[], env: CommsEnvironment, opts: NetworkOptions): NetworkGraph {
  const band = BANDS[opts.band];
  const edges: NetworkEdge[] = [];
  const adjacency: number[][] = positions.map(() => []);
  const agnDepth = positions.map((p) => agnSightlineDepth(p, band, env));
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d > opts.maxRange) continue;
      const path = pathDepth(a, b, band, env);
      const forward = linkBudget(a, b, band, opts.rig, env, { path, receiverToAgn: agnDepth[j] });
      if (forward.capacity < opts.minCapacity) continue;
      const backward = linkBudget(b, a, band, opts.rig, env, { path, receiverToAgn: agnDepth[i] });
      const capacity = Math.min(forward.capacity, backward.capacity);
      if (capacity < opts.minCapacity) continue;
      const idx = edges.length;
      edges.push({ a: i, b: j, delay: forward.totalDelay, capacity, snr: Math.min(forward.snr, backward.snr) });
      adjacency[i].push(idx);
      adjacency[j].push(idx);
    }
  }
  return { nodeCount: positions.length, edges, adjacency };
}

export interface Route {
  nodes: number[];
  edges: number[];
  delay: number;
  bottleneck: number;
}

export function shortestRoute(graph: NetworkGraph, source: number, target: number, relayDelay: number): Route | null {
  const n = graph.nodeCount;
  const dist = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[source] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let k = 0; k < n; k++) {
      if (!done[k] && dist[k] < best) {
        best = dist[k];
        u = k;
      }
    }
    if (u < 0 || u === target) break;
    done[u] = 1;
    for (const ei of graph.adjacency[u]) {
      const e = graph.edges[ei];
      const v = e.a === u ? e.b : e.a;
      const nd = dist[u] + e.delay + (u === source ? 0 : relayDelay);
      if (nd < dist[v]) {
        dist[v] = nd;
        prevEdge[v] = ei;
      }
    }
  }
  if (!Number.isFinite(dist[target])) return null;
  const nodes = [target];
  const edges: number[] = [];
  let bottleneck = Infinity;
  let cur = target;
  while (cur !== source) {
    const ei = prevEdge[cur];
    const e = graph.edges[ei];
    edges.push(ei);
    bottleneck = Math.min(bottleneck, e.capacity);
    cur = e.a === cur ? e.b : e.a;
    nodes.push(cur);
  }
  return { nodes: nodes.reverse(), edges: edges.reverse(), delay: dist[target], bottleneck };
}

export function connectedComponents(graph: NetworkGraph): Int32Array {
  const parent = Int32Array.from({ length: graph.nodeCount }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const e of graph.edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent[ra] = rb;
  }
  return Int32Array.from({ length: graph.nodeCount }, (_, i) => find(i));
}

export function pairCoverage(graph: NetworkGraph): number {
  const roots = connectedComponents(graph);
  const sizes = new Map<number, number>();
  for (const r of roots) sizes.set(r, (sizes.get(r) ?? 0) + 1);
  const n = graph.nodeCount;
  if (n < 2) return 0;
  let connectedPairs = 0;
  for (const s of sizes.values()) connectedPairs += (s * (s - 1)) / 2;
  return connectedPairs / ((n * (n - 1)) / 2);
}
