import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bakeStaticParts } from './bake';

/** A small "loaded model": two meshes sharing a material and one with its own, off-centre and nested. */
function fixture(): { scene: THREE.Group; shared: THREE.Material; other: THREE.Material } {
  const shared = new THREE.MeshStandardMaterial();
  const other = new THREE.MeshStandardMaterial();
  const scene = new THREE.Group();
  const parent = new THREE.Group();
  parent.position.set(5, 2, -3);
  parent.scale.setScalar(2);
  scene.add(parent);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), shared); // glTF: long axis along +z (forward)
  body.position.set(0, 0.5, 0);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 2), shared);
  lid.position.set(0, 1.1, 0);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.1), other);
  strap.position.set(0, 0.6, 0.5);
  parent.add(body, lid, strap);
  return { scene, shared, other };
}

describe('bakeStaticParts', () => {
  it('merges per material, stands the model on the ground at the origin and scales it to height', () => {
    const { scene, shared, other } = fixture();
    const parts = bakeStaticParts(scene, { height: 1.5 });
    expect(parts.map((p) => p.material)).toEqual([shared, other]);
    const box = new THREE.Box3();
    for (const p of parts) {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    }
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(1.5, 5);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 5);
    // Turned to face +x, as the game's props do: the long (forward) axis now runs along x.
    expect(box.max.x - box.min.x).toBeGreaterThan(box.max.z - box.min.z);
    expect(parts.every((p) => p.shadow)).toBe(true);
  });

  it('keeps only position, normal and uv so the parts merge and instance cleanly', () => {
    const { scene } = fixture();
    for (const part of bakeStaticParts(scene, { height: 0.3 })) {
      expect(Object.keys(part.geometry.attributes).sort()).toEqual(['normal', 'position', 'uv']);
      expect(part.shadow).toBe(false);
    }
  });

  it('returns nothing for an empty scene', () => {
    expect(bakeStaticParts(new THREE.Group(), { height: 1 })).toEqual([]);
  });
});
