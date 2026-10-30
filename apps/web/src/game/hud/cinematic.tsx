'use client';

import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import type { Vec2 } from '@operation-shadow/engine';
import { useEffect, useRef } from 'react';
import { getCameraPose, openingPose } from '../camera/camera-rig';
import { introReel, outroReel, playReel, shotStart, skipReel, stopReel } from '../camera/cinematic';
import type { GameController } from '../runtime/controller';
import { useHudTick } from '../runtime/game-context';
import { useGameUi } from '../runtime/store';
import { presentText } from './present';
import { formatClock } from './status-bar';
import styles from './hud.module.css';

const zoneCentre = (controller: GameController, id: string | null): Vec2 | null => {
  const zone = id ? controller.level.zones.find((z) => z.id === id) : undefined;
  return zone ? { x: (zone.min.x + zone.max.x) / 2, z: (zone.min.z + zone.max.z) / 2 } : null;
};

/** The first required objective the player knows about, and where it is on the map. */
function primaryObjective(controller: GameController) {
  const def = controller.mission.objectives.find((o) => o.required && !o.hidden) ?? controller.mission.objectives.find((o) => o.required);
  if (!def) return null;
  const id = def.kind === 'disable-target' ? def.targetId : def.kind === 'acquire-item' ? def.itemObjectId : def.kind === 'rescue' ? def.prisonerId : null;
  const pos = (id ? controller.world.object(id)?.pos : undefined) ?? (def.kind === 'reach-zone' ? zoneCentre(controller, def.zoneId) : null);
  return { def, pos };
}

/** Where the closing shot looks: the boat on success, otherwise the squad members who fell. */
function outroFocus(controller: GameController, success: boolean): Vec2 | null {
  if (success) return zoneCentre(controller, controller.mission.extractionZoneId);
  const ops = controller.world.state.operatives;
  const fallen = ops.filter((op) => op.status === 'downed' || op.status === 'dead' || op.status === 'captured');
  const group = fallen.length > 0 ? fallen : ops.filter((op) => op.status !== 'extracted');
  if (group.length === 0) return null;
  return { x: group.reduce((s, op) => s + op.pos.x, 0) / group.length, z: group.reduce((s, op) => s + op.pos.z, 0) / group.length };
}

/**
 * Mission bookends. A fresh mission opens on a letterboxed insertion reel (the whole map, the
 * objective, then down to the squad on the beach) with the clock held; the end of a mission
 * gets a closing shot and a verdict before the debrief. Any key or click skips.
 */
export function Cinematic() {
  const controller = useHudTick();
  const cinematic = useGameUi((s) => s.cinematic);
  const status = controller.world.state.status;
  const lastStatus = useRef(status);
  // While the field recorder winds through the past, the status flickers; only its outcome counts.
  const recalling = useGameUi((s) => s.recall !== null);

  // The insertion reel: only for a fresh start (not a continued save, nor the guided tutorial).
  useEffect(() => {
    const ui = useGameUi.getState();
    if (controller.entry.tutorial || controller.setup.initialSave || controller.world.state.tick > 0) return;
    const objective = primaryObjective(controller);
    const opening = openingPose(controller);
    const shots = introReel({
      opening,
      objective: objective?.pos ?? { x: controller.level.width / 2, z: controller.level.depth / 2 },
      mapWidth: controller.level.width,
      mapDepth: controller.level.depth,
    });
    const seconds = shotStart(shots, shots.length);
    controller.setHeld(true);
    playReel(shots, {
      onShot: (shot) => ui.setCinematic({ kind: 'intro', shot, seconds }),
      onEnd: () => {
        controller.setHeld(false);
        ui.setCinematic(null);
        ui.toast('Squad in position. You have the field.', 'info');
      },
    });
    return () => {
      stopReel();
      controller.setHeld(false);
      useGameUi.getState().setCinematic(null);
    };
  }, [controller]);

  // The closing beat when the mission ends; a restart or a load hands the camera straight back.
  useEffect(() => {
    if (recalling) return;
    const was = lastStatus.current;
    lastStatus.current = status;
    if (was === status) return;
    const ui = useGameUi.getState();
    if (status === 'running') {
      stopReel();
      ui.setCinematic(null);
      return;
    }
    const success = status === 'success';
    const focus = outroFocus(controller, success);
    const from = getCameraPose() ?? openingPose(controller);
    const shots = outroReel(from, focus ?? from, success);
    const seconds = shotStart(shots, 1);
    playReel(shots, {
      // The verdict holds the screen during the glide; the debrief comes up once the orbit starts.
      onShot: (shot) => ui.setCinematic(shot === 0 ? { kind: 'outro', shot, seconds } : null),
    });
  }, [controller, status, recalling]);

  // Skipping: any key or click. Captured on window so the game never sees that key.
  const active = cinematic !== null;
  useEffect(() => {
    if (!active) return;
    const skip = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) skipReel();
    };
    window.addEventListener('keydown', skip, { capture: true });
    return () => window.removeEventListener('keydown', skip, { capture: true });
  }, [active]);

  if (!cinematic) return null;
  const { state } = controller.world;
  let caption: { eyebrow: string; title: string; line: string } | null = null;
  if (cinematic.kind === 'intro') {
    const { briefing } = controller.entry;
    const objective = primaryObjective(controller);
    if (cinematic.shot === 0) caption = { eyebrow: briefing.codename, title: controller.entry.title, line: `${briefing.location} · ${briefing.time} · ${briefing.weather}` };
    else if (cinematic.shot === 1 && objective) caption = { eyebrow: 'Primary objective', title: objective.def.title, line: objective.def.description };
    else if (cinematic.shot === 2) caption = { eyebrow: 'Insertion', title: state.operatives.map((op) => SPECIALIST_PROFILES[op.role].callSign).join(' · '), line: briefing.insertion };
  }
  const success = state.status === 'success';
  const extracted = state.operatives.filter((op) => op.status === 'extracted').length;

  return (
    <div
      className={styles.cinematic}
      data-testid="cinematic"
      data-kind={cinematic.kind}
      data-shot={cinematic.shot}
      onPointerDown={(e) => {
        e.preventDefault();
        skipReel();
      }}
    >
      <div className={styles.letterboxTop} />
      <div className={styles.letterboxBottom}>
        <span key={cinematic.kind} className={styles.reelProgress} style={{ animationDuration: `${cinematic.seconds}s` }} />
        <span className={styles.skipHint}>Any key or click to skip</span>
      </div>
      {caption && (
        <div key={cinematic.shot} className={styles.caption}>
          <p className={styles.captionEyebrow}>{caption.eyebrow}</p>
          <p className={styles.captionTitle}>{caption.title}</p>
          <p className={styles.captionLine}>{presentText(caption.line)}</p>
        </div>
      )}
      {cinematic.kind === 'outro' && (
        <div className={`${styles.verdict} ${success ? styles.verdictSuccess : styles.verdictFailed}`} role="status">
          <p className={styles.verdictTitle}>{success ? 'Mission complete' : 'Mission failed'}</p>
          <p className={styles.captionLine}>
            {success ? `${extracted} of ${state.operatives.length} extracted · ${formatClock(state.tick)}` : state.outcome ? presentText(state.outcome.message) : controller.entry.title}
          </p>
        </div>
      )}
    </div>
  );
}
