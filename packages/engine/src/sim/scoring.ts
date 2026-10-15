import type { MissionRuntime } from './mission';
import { type SimState, TICK_RATE } from './types';

export type Medal = 'ghost' | 'restraint' | 'untouchable' | 'thorough' | 'swift';

export interface MissionScore {
  success: boolean;
  score: number;
  rank: 'S' | 'A' | 'B' | 'C' | 'D' | '-';
  medals: Medal[];
  breakdown: { label: string; points: number }[];
  timeSeconds: number;
  parSeconds: number;
}

const clamp0 = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

/**
 * Debrief score from actual mission statistics. Kills never add points: they only remove the
 * restraint bonus. Time is simulation time, so pausing to plan is never penalised.
 */
export function scoreMission(state: SimState, mission: MissionRuntime): MissionScore {
  const st = state.stats;
  const timeSeconds = Math.round(state.tick / TICK_RATE);
  const success = state.status === 'success';
  const optional = mission.objectives.filter((o) => !o.required);
  const optionalDone = optional.filter((o) => state.objectives.find((x) => x.id === o.id)?.status === 'completed').length;

  if (!success) {
    return { success, score: 0, rank: '-', medals: [], breakdown: [], timeSeconds, parSeconds: mission.parSeconds };
  }

  const par = mission.parSeconds;
  const timePoints = timeSeconds <= par ? 400 : clamp0(400 * (1 - (timeSeconds - par) / par), 400);
  const stealthByPeak = [300, 300, 220, 110, 0][st.peakAlarm] ?? 0;
  const stealthPoints = clamp0(stealthByPeak - 25 * st.detections, 300);
  const restraintPoints = clamp0(150 - 30 * st.kills, 150);
  const healthPoints = clamp0(150 - 40 * st.downs - 12 * st.injuries - 40 * st.captures, 150);
  const optionalPoints = optionalDone * 100;

  const breakdown = [
    { label: 'Mission complete', points: 1000 },
    { label: 'Time', points: timePoints },
    { label: 'Stealth', points: stealthPoints },
    { label: 'Restraint', points: restraintPoints },
    { label: 'Squad health', points: healthPoints },
    { label: 'Optional objectives', points: optionalPoints },
  ];
  const score = breakdown.reduce((sum, b) => sum + b.points, 0);
  const rank = score >= 1950 ? 'S' : score >= 1700 ? 'A' : score >= 1450 ? 'B' : score >= 1200 ? 'C' : 'D';

  const medals: Medal[] = [];
  if (st.detections === 0 && st.peakAlarm <= 1) medals.push('ghost');
  if (st.kills === 0) medals.push('restraint');
  if (st.injuries === 0 && st.captures === 0) medals.push('untouchable');
  if (optional.length > 0 && optionalDone === optional.length) medals.push('thorough');
  if (timeSeconds <= par) medals.push('swift');

  return { success, score, rank, medals, breakdown, timeSeconds, parSeconds: par };
}
