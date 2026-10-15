import type { LevelData } from '../level/types';
import { stableStringify } from '../sim/snapshot';

function fnv(h: number, bytes: Uint8Array): number {
  let x = h;
  for (let i = 0; i < bytes.length; i += 1) {
    x ^= bytes[i]!;
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x;
}

/** Content hash of a generated level (grids and features), used to prove reproducibility. */
export function levelHash(level: LevelData): string {
  let h = 0x811c9dc5;
  const arrays = [
    level.heightfield,
    level.cellHeight,
    level.surface,
    level.flags,
    level.occluders.lowBottom,
    level.occluders.lowTop,
    level.occluders.highBottom,
    level.occluders.highTop,
    level.concealment,
    level.staticLight,
    level.noiseFloor,
    level.region,
  ];
  for (const array of arrays) h = fnv(h, new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  const features = {
    links: level.links,
    structures: level.structures,
    props: level.props,
    lights: level.lights,
    routes: level.routes,
    posts: level.posts,
    zones: level.zones,
    slots: level.slots,
    searchNodes: level.searchNodes,
    fixtures: level.fixtures,
  };
  h = fnv(h, new TextEncoder().encode(stableStringify(features)));
  return h.toString(16).padStart(8, '0');
}
