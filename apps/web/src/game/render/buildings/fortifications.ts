import * as THREE from 'three';

// Fortification pieces: sandbags, concertina wire and gate leaves. Geometry is in metres.

/**
 * A filled sandbag (about 0.62 × 0.24 × 0.34 m): pillow-shaped, slumped flat underneath, with
 * the tied neck gathered into a tuft at one end and the folded bottom seam at the other.
 */
export function sandbagGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.62, 0.24, 0.34, 10, 4, 6);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i) / 0.31;
    const y = pos.getY(i) / 0.12;
    const z = pos.getZ(i) / 0.17;
    const pinch = 1 - 0.16 * x * x;
    // The tied end (+x) gathers tightly; the seamed end (−x) only rounds off.
    const end = THREE.MathUtils.smoothstep(Math.abs(x), 0.72, 1);
    const cinch = 1 - end * (x > 0 ? 0.72 : 0.3);
    let ny = y * pinch * (1 - 0.22 * z * z) * cinch;
    if (ny < 0) ny *= 0.7; // slumped onto the course below
    pos.setXYZ(i, pos.getX(i) * (1 - 0.06 * y * y) + (x > 0 ? end * 0.035 : 0), ny * 0.12, z * 0.17 * (1 - 0.14 * y * y) * pinch * cinch);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A run of concertina wire along +x from 0 to `length`: a coil of `radius` (metres) with a turn
 * every `pitch` metres, as a thin tube; the coil sits with its axis at y = radius.
 */
export function concertina(length: number, radius = 0.3, pitch = 0.24): THREE.BufferGeometry {
  const turns = Math.max(1, Math.round(length / pitch));
  const points: THREE.Vector3[] = [];
  const steps = turns * 9;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const a = u * turns * Math.PI * 2;
    // Real coils splay: each turn leans a little alternately, which reads as concertina.
    const lean = Math.sin(a * 0.5) * 0.04;
    points.push(new THREE.Vector3(u * length + lean, radius + Math.sin(a) * radius, Math.cos(a) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, 0.006, 3, false);
}

/** Tubular frame of a chain-link gate leaf (width along +x from the hinge, height up). */
export function gateFrame(width: number, height: number): THREE.BufferGeometry[] {
  const tube = (len: number) => new THREE.CylinderGeometry(0.025, 0.025, len, 6);
  return [
    tube(height).translate(0.03, height / 2, 0),
    tube(height).translate(width - 0.03, height / 2, 0),
    tube(width).rotateZ(Math.PI / 2).translate(width / 2, height - 0.03, 0),
    tube(width).rotateZ(Math.PI / 2).translate(width / 2, 0.08, 0),
    tube(Math.hypot(width, height - 0.1)).rotateZ(-Math.atan2(width, height - 0.1)).translate(width / 2, height / 2, 0),
  ];
}
