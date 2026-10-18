import type { CommsEnvironment } from "../physics/comms";
import { buildNetwork, type NetworkOptions } from "../physics/network";
import type { Vec3 } from "../physics/vec";

export interface NetworkRequest {
  id: number;
  positions: Vec3[];
  env: CommsEnvironment;
  opts: NetworkOptions;
}

self.onmessage = (e: MessageEvent<NetworkRequest>) => {
  const { id, positions, env, opts } = e.data;
  const graph = buildNetwork(positions, env, opts);
  self.postMessage({ id, graph });
};
