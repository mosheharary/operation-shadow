import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One instanced part of a prop model: geometry (feet at the origin, facing +x) and material. */
export interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  shadow?: boolean;
}

export interface BakeOptions {
  /** Height the model is scaled to (metres), so a prop's own scale keeps its meaning. */
  height: number;
  /** Extra turn about +y after facing +x (radians). */
  yaw?: number;
  /** Cast shadows (default: taller than half a metre). */
  shadow?: boolean;
}

const KEEP = ['position', 'normal', 'uv'] as const;

/** Same attribute set and indexing on every geometry, so they merge. */
function normalise(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) {
    if (!(KEEP as readonly string[]).includes(name)) geometry.deleteAttribute(name);
  }
  const count = geometry.attributes.position!.count;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  if (!geometry.index) geometry.setIndex(Array.from({ length: count }, (_, i) => i));
  return geometry;
}

/**
 * Turns a loaded glTF scene into instanceable parts: every mesh is baked into model space,
 * centred on its footprint with its base at y = 0, scaled to the requested height, turned to
 * face +x (glTF models face +z) and merged per material (one draw call per material).
 */
export function bakeStaticParts(scene: THREE.Object3D, options: BakeOptions): Part[] {
  scene.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const bounds = new THREE.Box3();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    const geometry = normalise(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox!);
    const list = byMaterial.get(material) ?? [];
    list.push(geometry);
    byMaterial.set(material, list);
  });
  if (bounds.isEmpty()) return [];
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const scale = options.height / Math.max(size.y, 1e-3);
  const transform = new THREE.Matrix4()
    .makeRotationY(Math.PI / 2 + (options.yaw ?? 0))
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -bounds.min.y, -centre.z));
  const shadow = options.shadow ?? options.height > 0.5;
  return [...byMaterial.entries()].map(([material, geometries]) => {
    const geometry = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries)!;
    geometry.applyMatrix4(transform);
    geometry.computeBoundingSphere();
    return { geometry, material, shadow };
  });
}
