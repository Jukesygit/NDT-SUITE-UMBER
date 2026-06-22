/**
 * Wall-loss distribution Web Worker.
 *
 * Thin wrapper: the pure math lives in `wall-loss-compute.ts` so it can be
 * unit-tested without a Worker environment. This file only handles message
 * passing off the main thread.
 */

import { compute, type WallLossRequest } from './wall-loss-compute';

self.onmessage = (e: MessageEvent<WallLossRequest>) => {
  const result = compute(e.data);
  self.postMessage(result);
};
