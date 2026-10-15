import { ambientLightAt, WEATHER_NOISE_FLOOR } from './rules';
import type { DirectorEventDef, DirectorTrigger } from './mission';
import { seconds } from './types';
import type { World } from './world';

function triggered(world: World, trigger: DirectorTrigger): boolean {
  const s = world.state;
  switch (trigger.type) {
    case 'time':
      return s.tick >= seconds(trigger.seconds);
    case 'objective':
      return s.objectives.find((o) => o.id === trigger.objectiveId)?.status === 'completed';
    case 'alarm':
      return s.alarm.level >= trigger.level;
    case 'item-taken': {
      const item = world.object(trigger.itemObjectId);
      return item?.type === 'item' && item.takenBy !== null;
    }
  }
}

function fire(world: World, event: DirectorEventDef): void {
  const s = world.state;
  for (const action of event.actions) {
    switch (action.type) {
      case 'reveal-objective': {
        const objective = s.objectives.find((o) => o.id === action.objectiveId);
        if (objective?.status === 'hidden') {
          objective.status = 'active';
          world.emit({ type: 'objective', id: objective.id, status: 'active' });
          const def = world.mission.objectives.find((o) => o.id === action.objectiveId);
          world.log('info', `New objective: ${def?.title ?? action.objectiveId}`);
        }
        break;
      }
      case 'message':
        world.emit({ type: 'message', speaker: action.speaker, lineKey: action.lineKey, text: action.text });
        world.log('info', `${action.speaker}: ${action.text}`);
        break;
      case 'reinforce':
        for (let i = 0; i < action.count; i += 1) {
          const spawn = world.mission.reinforcementSpawns.find((r) => r.sector === action.sector);
          if (spawn) world.spawnReinforcement(action.sector, { x: spawn.pos.x + i * 0.8, z: spawn.pos.z }, spawn.pos);
        }
        break;
      case 'weather':
        s.env.weather = action.weather;
        s.env.ambientLight = ambientLightAt(s.env.timeOfDay, action.weather);
        s.env.noiseFloor = WEATHER_NOISE_FLOOR[action.weather] ?? 28;
        world.log('info', `Weather: ${action.weather}`);
        break;
    }
  }
}

/** Fires each scripted mission event once, when its trigger is first met. */
export function updateDirector(world: World): void {
  const s = world.state;
  for (const event of world.mission.director) {
    if (s.director.fired.includes(event.id)) continue;
    if (!triggered(world, event.trigger)) continue;
    s.director.fired.push(event.id);
    fire(world, event);
  }
}
