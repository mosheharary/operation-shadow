'use client';

import type { LevelData, WorldObject } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import type { GameController } from '../runtime/controller';
import { useGameUi } from '../runtime/store';
import { material } from './palette';

interface DoorInfo {
  id: string;
  hinge: THREE.Vector3;
  /** Rotation of the closed panel around Y. */
  closed: number;
  width: number;
}

/** Works out each door's wall orientation from the building it belongs to. */
function doorLayout(level: LevelData): DoorInfo[] {
  const doors: DoorInfo[] = [];
  for (const f of level.fixtures) {
    if (f.type !== 'door') continue;
    const s = level.structures.find((st) => st.doors?.some((d) => Math.abs(d.x - f.pos.x) < 0.01 && Math.abs(d.z - f.pos.z) < 0.01));
    if (!s) continue;
    const onWestEast = Math.abs(f.pos.x - (s.pos.x - s.size.x / 2)) < 0.05 || Math.abs(f.pos.x - (s.pos.x + s.size.x / 2)) < 0.05;
    const width = (f.width ?? 1.2) - 0.08;
    // Panel lies along the wall; the hinge sits at one end of the opening.
    const hinge = onWestEast ? new THREE.Vector3(f.pos.x, s.baseHeight, f.pos.z - width / 2) : new THREE.Vector3(f.pos.x - width / 2, s.baseHeight, f.pos.z);
    doors.push({ id: f.id, hinge, closed: onWestEast ? -Math.PI / 2 : 0, width });
  }
  return doors;
}

function objectKey(controller: GameController): string {
  return controller.world.state.objects.map((o) => o.id).join(',');
}

export interface WorldObjectsProps {
  controller: GameController;
}

const HIT_TYPES = new Set<WorldObject['type']>(['door', 'item', 'container', 'alarm-bell', 'radio', 'searchlight', 'objective-target', 'device', 'fence']);

/** Interactive objects. Meshes tagged with userData.kind are picked by the input layer. */
export function WorldObjects({ controller }: WorldObjectsProps) {
  const level = controller.level;
  const doors = useMemo(() => doorLayout(level), [level]);
  const doorRefs = useRef(new Map<string, THREE.Group>());
  const key = useSyncExternalStore(controller.subscribeHud, () => objectKey(controller), () => '');
  const hoverRing = useRef<THREE.Mesh>(null);
  const blinkers = useRef(new Map<string, THREE.Mesh>());

  const objects = useMemo(() => {
    void key;
    return controller.world.state.objects.filter((o) => HIT_TYPES.has(o.type) || o.type === 'charge');
  }, [controller, key]);

  const fenceBoxes = useMemo(() => {
    const map = new Map<string, { pos: THREE.Vector3; size: [number, number, number] }>();
    for (const f of level.fixtures) {
      if (f.type !== 'fence') continue;
      const s = level.structures.find((st) => st.id === f.id.replace('fence:', 'fence-'));
      if (!s?.path || s.path.length < 2) continue;
      const a = s.path[0]!;
      const b = s.path[1]!;
      const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
      map.set(f.id, {
        pos: new THREE.Vector3((a.x + b.x) / 2, s.baseHeight + 1.2, (a.z + b.z) / 2),
        size: alongX ? [Math.abs(b.x - a.x), 2.4, 0.7] : [0.7, 2.4, Math.abs(b.z - a.z)],
      });
    }
    return map;
  }, [level]);

  useFrame((frame) => {
    const world = controller.world;
    for (const door of doors) {
      const group = doorRefs.current.get(door.id);
      const obj = world.object(door.id);
      if (!group || obj?.type !== 'door') continue;
      const target = door.closed + (obj.open ? -Math.PI / 2 : 0);
      group.rotation.y += (target - group.rotation.y) * 0.18;
    }
    const t = frame.clock.elapsedTime;
    for (const [id, mesh] of blinkers.current) {
      const obj = world.object(id);
      const on = obj && obj.type !== 'charge' ? !('sabotaged' in obj && (obj.sabotaged || obj.destroyed)) : true;
      mesh.visible = Boolean(on) && Math.sin(t * (obj?.type === 'charge' ? 14 : 4)) > 0;
    }
    const hovered = useGameUi.getState().hovered;
    if (hoverRing.current) {
      const obj = hovered?.kind === 'object' ? world.object(hovered.id) : undefined;
      hoverRing.current.visible = Boolean(obj) && obj?.type !== 'fence';
      if (obj) hoverRing.current.position.set(obj.pos.x, world.grid.heightAt(obj.pos) + 0.1, obj.pos.z);
    }
  });

  const handlers = (id: string) => ({ userData: { id, kind: 'object' } });

  const grid = controller.world.grid;
  const y = (o: WorldObject) => grid.heightAt(o.pos);

  return (
    <group name="world-objects">
      {doors.map((door) => (
        <group
          key={door.id}
          position={door.hinge}
          rotation={[0, door.closed, 0]}
          ref={(g) => {
            if (g) doorRefs.current.set(door.id, g);
          }}
        >
          <mesh position={[door.width / 2, 1.1, 0]} material={material('#5a432c')} castShadow {...handlers(door.id)}>
            <boxGeometry args={[door.width, 2.2, 0.08]} />
          </mesh>
        </group>
      ))}
      {objects.map((o) => {
        const base = y(o);
        switch (o.type) {
          case 'item':
            return o.takenBy ? null : (
              <mesh key={o.id} position={[o.pos.x, base + 0.85, o.pos.z]} material={material('#7a2f2a')} {...handlers(o.id)}>
                <boxGeometry args={[0.35, 0.08, 0.26]} />
              </mesh>
            );
          case 'objective-target':
          case 'radio':
            return (
              <group key={o.id} position={[o.pos.x, base, o.pos.z]}>
                <mesh position={[0, 0.55, 0]} material={material(o.destroyed ? '#2b2724' : '#4a5248', { metalness: 0.3 })} castShadow {...handlers(o.id)}>
                  <boxGeometry args={[0.9, 1.1, 0.6]} />
                </mesh>
                <mesh
                  position={[0.46, 0.85, 0]}
                  material={material('#ff6a3a', { emissive: '#ff4a20', emissiveIntensity: 2.5 })}
                  ref={(m) => {
                    if (m) blinkers.current.set(o.id, m);
                  }}
                >
                  <sphereGeometry args={[0.05, 6, 4]} />
                </mesh>
              </group>
            );
          case 'alarm-bell':
            return (
              <group key={o.id} position={[o.pos.x, base, o.pos.z]}>
                <mesh position={[0, 1.1, 0]} material={material('#3a3d40')} castShadow>
                  <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
                </mesh>
                <mesh position={[0, 2.15, 0]} material={material(o.sabotaged ? '#5a4a3a' : '#b38a3a', { metalness: 0.6, roughness: 0.4 })} castShadow {...handlers(o.id)}>
                  <coneGeometry args={[0.22, 0.3, 10]} />
                </mesh>
              </group>
            );
          case 'searchlight':
            return (
              <mesh key={o.id} position={[o.pos.x, base + 6.6, o.pos.z]} material={material('#2c2e30', { metalness: 0.5 })} {...handlers(o.id)}>
                <cylinderGeometry args={[0.35, 0.45, 0.6, 10]} />
              </mesh>
            );
          case 'container':
            return (
              <mesh key={o.id} position={[o.pos.x, base + 0.6, o.pos.z]} {...handlers(o.id)}>
                <boxGeometry args={[1.3, 1.2, 1.3]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
              </mesh>
            );
          case 'device':
            return (
              <mesh key={o.id} position={[o.pos.x, base + 0.12, o.pos.z]} material={material('#3d4a3a')} {...handlers(o.id)}>
                <boxGeometry args={[0.28, 0.2, 0.2]} />
              </mesh>
            );
          case 'charge':
            return (
              <group key={o.id} position={[o.pos.x, base, o.pos.z]}>
                <mesh position={[0, 0.15, 0]} material={material('#4a3a2a')}>
                  <boxGeometry args={[0.4, 0.3, 0.3]} />
                </mesh>
                <mesh
                  position={[0, 0.34, 0]}
                  material={material('#ff3a20', { emissive: '#ff2010', emissiveIntensity: 3 })}
                  ref={(m) => {
                    if (m) blinkers.current.set(o.id, m);
                  }}
                >
                  <sphereGeometry args={[0.05, 6, 4]} />
                </mesh>
              </group>
            );
          case 'fence': {
            const box = fenceBoxes.get(o.id);
            return box ? (
              <mesh key={o.id} position={box.pos} {...handlers(o.id)}>
                <boxGeometry args={box.size} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
              </mesh>
            ) : null;
          }
          default:
            return null;
        }
      })}
      <mesh ref={hoverRing} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <ringGeometry args={[0.75, 0.86, 32]} />
        <meshBasicMaterial color="#e7c35a" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}
