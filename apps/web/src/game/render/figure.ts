import * as THREE from 'three';
import { material } from './palette';

export type Headgear = 'ridged-helmet' | 'kepi' | 'beanie' | 'field-cap' | 'steel-helmet' | 'beret' | 'bare' | 'hood';

export interface FigureLook {
  coat: string;
  trousers: string;
  skin: string;
  headgear: Headgear;
  headgearColor: string;
  accent?: string;
  pack?: 'large' | 'small' | 'satchel' | 'dinghy';
  packColor?: string;
  weapon?: 'rifle' | 'long-rifle' | 'harpoon' | 'none';
  longCoat?: boolean;
  lantern?: boolean;
  armband?: boolean;
  rope?: boolean;
}

export interface FigurePose {
  stance: 'stand' | 'crouch' | 'prone';
  moving: boolean;
  running: boolean;
  lying: 'none' | 'back' | 'side';
  carrying: boolean;
  carried: boolean;
  aiming: boolean;
  talking: boolean;
  swimming: boolean;
  climbing: boolean;
}

export interface FigureRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  weapon: THREE.Object3D | null;
  lanternLight: THREE.Object3D | null;
  phase: number;
}

const G = {
  pelvis: new THREE.BoxGeometry(0.22, 0.18, 0.34),
  torso: new THREE.BoxGeometry(0.24, 0.56, 0.4),
  longCoat: new THREE.BoxGeometry(0.27, 0.5, 0.44),
  head: new THREE.SphereGeometry(0.115, 12, 8),
  limbArm: new THREE.CapsuleGeometry(0.052, 0.42, 3, 6),
  limbLeg: new THREE.CapsuleGeometry(0.066, 0.62, 3, 6),
  hand: new THREE.SphereGeometry(0.05, 6, 4),
  boot: new THREE.BoxGeometry(0.22, 0.09, 0.11),
  ridged: new THREE.SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  ridge: new THREE.BoxGeometry(0.26, 0.05, 0.035),
  brim: new THREE.CylinderGeometry(0.19, 0.19, 0.02, 14),
  kepi: new THREE.CylinderGeometry(0.12, 0.13, 0.12, 12),
  visor: new THREE.BoxGeometry(0.1, 0.02, 0.18),
  beanie: new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 1.9),
  steel: new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.1),
  beret: new THREE.SphereGeometry(0.13, 10, 5),
  hood: new THREE.SphereGeometry(0.135, 10, 8),
  packLarge: new THREE.BoxGeometry(0.2, 0.46, 0.34),
  packSmall: new THREE.BoxGeometry(0.14, 0.3, 0.26),
  satchel: new THREE.BoxGeometry(0.1, 0.2, 0.26),
  dinghy: new THREE.CapsuleGeometry(0.14, 0.32, 3, 8),
  rifle: new THREE.BoxGeometry(0.95, 0.06, 0.05),
  longRifle: new THREE.BoxGeometry(1.15, 0.06, 0.05),
  harpoon: new THREE.BoxGeometry(0.75, 0.07, 0.07),
  lantern: new THREE.BoxGeometry(0.1, 0.14, 0.1),
  band: new THREE.CylinderGeometry(0.058, 0.058, 0.08, 8),
  rope: new THREE.TorusGeometry(0.15, 0.035, 5, 12),
};

function mesh(geometry: THREE.BufferGeometry, color: string, opts: Parameters<typeof material>[1] = {}): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material(color, opts));
  m.castShadow = true;
  return m;
}

function headgear(look: FigureLook): THREE.Object3D {
  const g = new THREE.Group();
  const c = look.headgearColor;
  switch (look.headgear) {
    case 'ridged-helmet': {
      const dome = mesh(G.ridged, c, { roughness: 0.5, metalness: 0.3 });
      dome.position.y = 0.03;
      const ridge = mesh(G.ridge, c, { roughness: 0.5, metalness: 0.3 });
      ridge.position.y = 0.17;
      const brim = mesh(G.brim, c, { roughness: 0.5, metalness: 0.3 });
      brim.position.y = 0.03;
      g.add(dome, ridge, brim);
      break;
    }
    case 'kepi': {
      const cap = mesh(G.kepi, c);
      cap.position.y = 0.1;
      const visor = mesh(G.visor, '#1c1f24');
      visor.position.set(0.1, 0.05, 0);
      g.add(cap, visor);
      break;
    }
    case 'beanie': {
      const cap = mesh(G.beanie, c);
      cap.position.y = 0.02;
      g.add(cap);
      break;
    }
    case 'field-cap': {
      const cap = mesh(G.kepi, c);
      cap.scale.set(1.05, 0.7, 1.05);
      cap.position.y = 0.09;
      const visor = mesh(G.visor, c);
      visor.position.set(0.11, 0.06, 0);
      g.add(cap, visor);
      break;
    }
    case 'steel-helmet': {
      const dome = mesh(G.steel, c, { roughness: 0.55, metalness: 0.35 });
      dome.position.y = 0.02;
      g.add(dome);
      break;
    }
    case 'beret': {
      const beret = mesh(G.beret, c);
      beret.scale.set(1.15, 0.38, 1.1);
      beret.position.set(-0.01, 0.1, 0.02);
      g.add(beret);
      break;
    }
    case 'hood': {
      const hood = mesh(G.hood, c);
      hood.position.set(-0.01, 0.01, 0);
      g.add(hood);
      break;
    }
    case 'bare':
      break;
  }
  return g;
}

/** Builds an articulated low-poly figure facing +x with its feet at the origin. */
export function createFigure(look: FigureLook): FigureRig {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);
  hips.add(mesh(G.pelvis, look.trousers));

  const torso = new THREE.Group();
  hips.add(torso);
  const chest = mesh(G.torso, look.coat);
  chest.position.y = 0.33;
  torso.add(chest);
  if (look.longCoat) {
    const skirt = mesh(G.longCoat, look.coat);
    skirt.position.y = -0.12;
    torso.add(skirt);
  }
  if (look.accent) {
    const collar = mesh(new THREE.BoxGeometry(0.25, 0.06, 0.41), look.accent);
    collar.position.y = 0.6;
    torso.add(collar);
  }

  const head = new THREE.Group();
  head.position.y = 0.74;
  torso.add(head);
  head.add(mesh(G.head, look.skin));
  head.add(headgear(look));

  const arm = (side: 1 | -1) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.58, side * 0.235);
    const limb = mesh(G.limbArm, look.coat);
    limb.position.y = -0.24;
    const hand = mesh(G.hand, look.skin);
    hand.position.y = -0.5;
    pivot.add(limb, hand);
    if (look.armband && side === 1) {
      const band = mesh(G.band, '#e8e2d4');
      band.position.y = -0.1;
      pivot.add(band);
    }
    torso.add(pivot);
    return pivot;
  };
  const armL = arm(-1);
  const armR = arm(1);

  const leg = (side: 1 | -1) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, -0.05, side * 0.1);
    const limb = mesh(G.limbLeg, look.trousers);
    limb.position.y = -0.39;
    const boot = mesh(G.boot, '#26231f');
    boot.position.set(0.04, -0.82, 0);
    pivot.add(limb, boot);
    hips.add(pivot);
    return pivot;
  };
  const legL = leg(-1);
  const legR = leg(1);

  if (look.pack) {
    const geometry = look.pack === 'large' ? G.packLarge : look.pack === 'small' ? G.packSmall : look.pack === 'satchel' ? G.satchel : G.dinghy;
    const pack = mesh(geometry, look.packColor ?? '#5a5338');
    pack.position.set(look.pack === 'satchel' ? -0.02 : -0.21, look.pack === 'satchel' ? 0.05 : 0.32, look.pack === 'satchel' ? -0.24 : 0);
    if (look.pack === 'dinghy') pack.rotation.x = Math.PI / 2;
    torso.add(pack);
  }
  if (look.rope) {
    const rope = mesh(G.rope, '#b39b6a');
    rope.position.set(0.03, 0.4, 0.13);
    rope.rotation.set(0.3, 0, 0.9);
    torso.add(rope);
  }

  let weapon: THREE.Object3D | null = null;
  if (look.weapon && look.weapon !== 'none') {
    const geometry = look.weapon === 'long-rifle' ? G.longRifle : look.weapon === 'harpoon' ? G.harpoon : G.rifle;
    weapon = mesh(geometry, '#3a3128', { roughness: 0.6 });
    weapon.position.set(-0.17, 0.32, 0.05);
    weapon.rotation.z = 1.15;
    torso.add(weapon);
  }

  let lanternLight: THREE.Object3D | null = null;
  if (look.lantern) {
    const lantern = mesh(G.lantern, '#ffd690', { emissive: '#ffb850', emissiveIntensity: 3 });
    lantern.position.set(0.02, -0.56, 0);
    armL.add(lantern);
    lanternLight = lantern;
  }

  return { root, hips, torso, head, armL, armR, legL, legR, weapon, lanternLight, phase: 0 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Applies a pose; `dt` advances the gait cycle. Smoothly blends between poses. */
export function poseFigure(rig: FigureRig, pose: FigurePose, dt: number, time: number): void {
  const blend = Math.min(1, dt * 12);
  const speed = pose.running ? 11 : pose.stance === 'prone' ? 5 : pose.stance === 'crouch' ? 7 : 8;
  if (pose.moving || pose.climbing || pose.swimming) rig.phase += dt * speed;
  const s = Math.sin(rig.phase);
  const c = Math.cos(rig.phase);

  let hipsY = 0.92;
  let hipsRotZ = 0;
  let hipsRotX = 0;
  let torsoZ = 0;
  let legL = 0;
  let legR = 0;
  let armL = 0;
  let armR = 0;
  let armSpread = 0;

  if (pose.carried) {
    hipsY = 1.45;
    hipsRotZ = -Math.PI / 2;
    armL = 0.4;
    armR = 0.4;
    legL = -0.2;
    legR = 0.1;
  } else if (pose.lying !== 'none') {
    hipsY = 0.16;
    hipsRotZ = Math.PI / 2;
    if (pose.lying === 'side') hipsRotX = Math.PI / 2.4;
    armSpread = 0.6;
    legL = 0.15;
    legR = -0.1;
  } else if (pose.swimming) {
    hipsY = -0.75;
    hipsRotZ = -1.25;
    armL = 2.4 + s * 1.2;
    armR = 2.4 - s * 1.2;
    legL = s * 0.4;
    legR = -s * 0.4;
  } else if (pose.stance === 'prone') {
    hipsY = 0.2;
    hipsRotZ = -Math.PI / 2;
    const crawl = pose.moving ? 0.35 : 0;
    armL = 2.6 + s * crawl;
    armR = 2.6 - s * crawl;
    legL = -c * crawl * 0.6;
    legR = c * crawl * 0.6;
  } else if (pose.climbing) {
    armL = 2.6 + s * 0.4;
    armR = 2.6 - s * 0.4;
    legL = 0.5 + s * 0.4;
    legR = 0.5 - s * 0.4;
  } else {
    const crouch = pose.stance === 'crouch';
    hipsY = crouch ? 0.62 : 0.92;
    torsoZ = crouch ? -0.38 : pose.running ? -0.2 : 0;
    const amp = pose.moving ? (pose.running ? 0.85 : crouch ? 0.45 : 0.55) : 0;
    legL = (crouch ? 0.75 : 0) + s * amp;
    legR = (crouch ? 0.75 : 0) - s * amp;
    armL = -s * amp * 0.75;
    armR = s * amp * 0.75;
    if (pose.carrying) {
      armL = 2.7;
      armR = 2.7;
    } else if (pose.aiming) {
      armR = 1.45;
      armL = 1.25;
    } else if (pose.talking) {
      armR = 0.9 + Math.sin(time * 4.2) * 0.35;
    } else if (!pose.moving) {
      armL = Math.sin(time * 1.6) * 0.03;
      armR = -armL;
    }
  }

  rig.hips.position.y = lerp(rig.hips.position.y, hipsY, blend);
  rig.hips.rotation.z = lerp(rig.hips.rotation.z, hipsRotZ, blend);
  rig.hips.rotation.x = lerp(rig.hips.rotation.x, hipsRotX, blend);
  rig.torso.rotation.z = lerp(rig.torso.rotation.z, torsoZ, blend);
  rig.legL.rotation.z = lerp(rig.legL.rotation.z, legL, blend);
  rig.legR.rotation.z = lerp(rig.legR.rotation.z, legR, blend);
  rig.armL.rotation.z = lerp(rig.armL.rotation.z, armL, blend);
  rig.armR.rotation.z = lerp(rig.armR.rotation.z, armR, blend);
  rig.armL.rotation.x = lerp(rig.armL.rotation.x, -armSpread, blend);
  rig.armR.rotation.x = lerp(rig.armR.rotation.x, armSpread, blend);
  if (rig.weapon) {
    // Rifle slung on the back, or levelled when aiming.
    const aimed = pose.aiming && pose.lying === 'none' && !pose.carried;
    rig.weapon.position.set(aimed ? 0.32 : -0.17, aimed ? 0.42 : 0.32, aimed ? 0.12 : 0.05);
    rig.weapon.rotation.z = aimed ? 0 : 1.15;
  }
}
