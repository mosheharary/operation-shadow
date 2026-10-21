import { distance } from '../core/math';
import { Rng } from '../core/rng';
import { ambientLightAt, WEATHER_NOISE_FLOOR } from './rules';
import type { DeckCard, DirectorEventDef, DirectorTrigger } from './mission';
import { seconds, type Weather } from './types';
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
          if (spawn) world.spawnReinforcement(action.sector, { x: spawn.pos.x + i * 0.8, z: spawn.pos.z }, spawn.pos, true);
        }
        break;
      case 'weather':
        setWeather(world, action.weather);
        break;
    }
  }
}

function setWeather(world: World, weather: Weather): void {
  const s = world.state;
  s.env.weather = weather;
  s.env.ambientLight = ambientLightAt(s.env.timeOfDay, weather);
  s.env.noiseFloor = WEATHER_NOISE_FLOOR[weather] ?? 28;
  world.log('info', `Weather: ${weather}`);
}

/** Complications (extra patrols) each difficulty allows per mission. */
const COMPLICATION_BUDGET = { standard: 2, veteran: 3 } as const;
/** Patrols never appear this close to an active squad member. */
const SPAWN_CLEARANCE = 25;
const WEATHER_TEXT: Record<Weather, string> = {
  clear: 'The sky is clearing. Visibility will improve.',
  rain: 'Rain is coming in. It will cover your footsteps.',
  fog: 'Fog is rolling in. Sentries will not see far.',
  snow: 'Snow is starting to fall. Mind your tracks.',
};

const hq = (world: World, lineKey: string, text: string) => {
  world.emit({ type: 'message', speaker: 'LANTERN', lineKey, text });
  world.log('info', `LANTERN: ${text}`);
};

/** Whether a card can be played now (plan §3.11 precondition checks). */
function playable(world: World, card: DeckCard, complications: number): boolean {
  const s = world.state;
  switch (card.kind) {
    case 'patrol':
      return (
        complications < COMPLICATION_BUDGET[s.difficulty] &&
        s.alarm.level < 3 &&
        s.operatives.every((op) => op.status !== 'active' || distance(op.pos, card.pos) >= SPAWN_CLEARANCE)
      );
    case 'weather':
      return card.weather !== s.env.weather;
    case 'intel':
      return !s.director.fired.includes(`deck:intel:${card.id}`);
  }
}

/** The HQ line a card plays (shared with the voice-bank tool, which pre-records them). */
export function deckMessage(card: DeckCard): { lineKey: string; text: string } {
  switch (card.kind) {
    case 'patrol':
      return { lineKey: `deck-patrol-${card.sector.replace(/\s+/g, '-')}`, text: `A Dominion patrol is sweeping the ${card.sector}. Keep clear of it.` };
    case 'weather':
      return { lineKey: `deck-weather-${card.weather}`, text: WEATHER_TEXT[card.weather] };
    case 'intel':
      return { lineKey: `deck-intel-${card.id}`, text: card.text };
  }
}

function play(world: World, card: DeckCard): void {
  const s = world.state;
  const { lineKey, text } = deckMessage(card);
  switch (card.kind) {
    case 'patrol':
      for (let i = 0; i < card.count; i += 1) world.spawnReinforcement(card.sector, { x: card.pos.x + i * 0.8, z: card.pos.z }, card.pos);
      s.director.deck!.complications += 1;
      break;
    case 'weather':
      setWeather(world, card.weather);
      break;
    case 'intel':
      s.director.fired.push(`deck:intel:${card.id}`);
      break;
  }
  hq(world, lineKey, text);
}

/** Draws from the mission's dynamic-event deck at intervals; skips cards whose preconditions fail. */
function updateDeck(world: World): void {
  const deck = world.mission.deck;
  const state = world.state.director.deck;
  if (!deck || !state || world.state.tick < state.nextTick || deck.cards.length === 0) return;
  const rng = new Rng(state.rng);
  const start = rng.int(0, deck.cards.length);
  for (let i = 0; i < deck.cards.length; i += 1) {
    const index = (start + i) % deck.cards.length;
    const card = deck.cards[index]!;
    if (playable(world, card, state.complications)) {
      play(world, card);
      break;
    }
  }
  state.drawn += 1;
  state.nextTick = world.state.tick + seconds(rng.range(deck.intervalSeconds[0], deck.intervalSeconds[1]));
  state.rng = rng.state;
}

/** Fires each scripted mission event once, when its trigger is first met, then the dynamic deck. */
export function updateDirector(world: World): void {
  const s = world.state;
  for (const event of world.mission.director) {
    if (s.director.fired.includes(event.id)) continue;
    if (!triggered(world, event.trigger)) continue;
    s.director.fired.push(event.id);
    fire(world, event);
  }
  updateDeck(world);
}
