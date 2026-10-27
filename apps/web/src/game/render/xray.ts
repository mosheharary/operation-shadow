import * as THREE from 'three';

/** How far (metres, towards the camera) an occluder must stand in front of a body to reveal it. */
const PULL = 0.6;

/** One material per squad colour, shared by every ghost mesh of that colour. */
const materials = new Map<string, THREE.MeshBasicMaterial>();

function ghostMaterial(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  const key = new THREE.Color(color).getHexString();
  let material = materials.get(key);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      // Drawn only where something is nearer the camera than the body: a roof, a wall, a tree.
      depthFunc: THREE.GreaterDepth,
      fog: false,
    });
    // Pulled towards the camera so the body's own clothing (inflated in its shader) and kit never
    // count as occluders; only something more than PULL metres in front reveals the silhouette.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        gl_Position = projectionMatrix * (mvPosition + vec4(0.0, 0.0, ${PULL.toFixed(2)}, 0.0));`,
      );
    };
    materials.set(key, material);
  }
  return material;
}

/**
 * Gives a squad rig an x-ray silhouette: each body mesh gets a child that shares its geometry
 * (and skeleton) and is drawn in the specialist's colour only where it is hidden, as in the
 * classic squad-stealth games. Children inherit the mesh's transform and visibility. Authored
 * rigs get it on the skinned body only; procedural figures on every part.
 */
export function addXRay(root: THREE.Object3D, color: THREE.ColorRepresentation): void {
  const meshes: THREE.Mesh[] = [];
  const mainLayer = new THREE.Layers();
  root.traverse((o) => {
    // Shadow-only stand-ins live on another layer.
    if ((o as THREE.Mesh).isMesh && o.layers.test(mainLayer)) meshes.push(o as THREE.Mesh);
  });
  // The painted body (not eyes or brows) of an authored rig.
  const skinned = meshes.filter((m) => (m as THREE.SkinnedMesh).isSkinnedMesh && m.geometry.getAttribute('aRegion'));
  const material = ghostMaterial(color);
  for (const mesh of skinned.length ? skinned : meshes) {
    let ghost: THREE.Mesh;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const body = mesh as THREE.SkinnedMesh;
      const skinnedGhost = new THREE.SkinnedMesh(body.geometry, material);
      skinnedGhost.bind(body.skeleton, body.bindMatrix);
      // The body is culled by a fixed sphere round the figure (bind-pose bounds are wrong once animated).
      if (body.boundingSphere) skinnedGhost.boundingSphere = body.boundingSphere.clone();
      ghost = skinnedGhost;
    } else {
      ghost = new THREE.Mesh(mesh.geometry, material);
    }
    ghost.name = 'xray';
    ghost.frustumCulled = mesh.frustumCulled;
    ghost.renderOrder = 5;
    ghost.raycast = () => {};
    mesh.add(ghost);
  }
}
