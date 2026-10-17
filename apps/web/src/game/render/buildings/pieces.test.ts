import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { facadeMatrix, shutterLeaf, WINDOW, windowFrame } from './pieces';

describe('facadeMatrix', () => {
  it('places a piece on the wall face, pointing out of the wall, without mirroring it', () => {
    // A wall run along +x at z = 0; the building lies at z > 0, so "out" is −z.
    const m = facadeMatrix({ x: 10, z: 0 }, { x: 1, z: 0 }, 3, 0.16, 2);
    const origin = new THREE.Vector3().applyMatrix4(m);
    expect(origin.x).toBeCloseTo(13);
    expect(origin.y).toBeCloseTo(2);
    expect(origin.z).toBeCloseTo(-0.16);
    const out = new THREE.Vector3(0, 0, 1).transformDirection(m);
    expect(out.z).toBeCloseTo(-1);
    // A proper rotation: mirrored instances would render inside out.
    expect(m.determinant()).toBeGreaterThan(0);
  });

  it('applies a scale in piece space (downpipes stretch along y)', () => {
    const m = facadeMatrix({ x: 0, z: 0 }, { x: 0, z: 1 }, 1, 0.16, 0, new THREE.Vector3(1, 4, 1));
    const top = new THREE.Vector3(0, 1, 0).applyMatrix4(m);
    expect(top.y).toBeCloseTo(4);
  });
});

describe('window pieces', () => {
  it('fit the window opening and stand proud of the wall face', () => {
    const frame = windowFrame();
    frame.computeBoundingBox();
    const box = frame.boundingBox!;
    expect(box.min.z).toBeGreaterThanOrEqual(-1e-6);
    expect(box.max.x - box.min.x).toBeGreaterThan(WINDOW.width);
    expect(box.max.y).toBeGreaterThan(WINDOW.height);
    const leaf = shutterLeaf();
    leaf.computeBoundingBox();
    expect((leaf.boundingBox!.min.x + leaf.boundingBox!.max.x) / 2).toBeCloseTo(0, 5);
  });
});
