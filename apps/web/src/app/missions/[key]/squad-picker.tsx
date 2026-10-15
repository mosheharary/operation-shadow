'use client';

import { checkSquad, type MissionEntry, type SpecialistProfile } from '@operation-shadow/content';
import type { DifficultyId, SpecialistId } from '@operation-shadow/engine';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './briefing.module.css';

const DIFFICULTIES: { id: DifficultyId; name: string; text: string }[] = [
  { id: 'standard', name: 'Standard', text: 'Guards notice you at a normal pace. Downed operatives can be revived before they bleed out.' },
  { id: 'veteran', name: 'Veteran', text: 'Sharper eyes and ears, longer searches, deadlier fire. A downed operative dies at once.' },
];

export interface SquadPickerProps {
  missionKey: string;
  squad: MissionEntry['squad'];
  recommended: SpecialistId[];
  profiles: SpecialistProfile[];
  initialError: string | null;
}

export function SquadPicker({ missionKey, squad, recommended, profiles, initialError }: SquadPickerProps) {
  const router = useRouter();
  const [chosen, setChosen] = useState<SpecialistId[]>(() => recommended.slice(0, squad.max));
  const [difficulty, setDifficulty] = useState<DifficultyId>('standard');
  const [submitted, setSubmitted] = useState(false);
  const problem = checkSquad({ squad }, chosen);

  const toggle = (id: SpecialistId) => {
    if (squad.required.includes(id)) return;
    setChosen((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  return (
    <form
      className={styles.picker}
      aria-labelledby="squad-title"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (problem) return;
        const params = new URLSearchParams({ squad: chosen.join(','), difficulty });
        router.push(`/play/${missionKey}?${params.toString()}`);
      }}
    >
      <h2 id="squad-title">Choose your squad</h2>
      <p className={styles.pickerNote}>
        {squad.min}–{squad.max} specialists. Required roles are locked in.
      </p>
      <ul className={styles.cards}>
        {profiles.map((p) => {
          const selected = chosen.includes(p.id);
          const required = squad.required.includes(p.id);
          return (
            <li key={p.id}>
              <label className={`${styles.card} ${selected ? styles.cardOn : ''}`} style={{ ['--accent' as string]: p.color }}>
                <input type="checkbox" checked={selected} disabled={required} onChange={() => toggle(p.id)} data-testid={`pick-${p.id}`} />
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-generated portrait */}
                <img src={p.portrait} alt="" width={72} height={72} />
                <span className={styles.cardText}>
                  <strong>
                    {p.callSign} <span className={styles.role}>{p.roleLabel}</span>
                  </strong>
                  <span className={styles.name}>{p.name}</span>
                  <span>{p.summary}</span>
                  {required && <span className={styles.required}>Required</span>}
                  {!required && recommended.includes(p.id) && <span className={styles.recommended}>Recommended</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <fieldset className={styles.difficulty}>
        <legend>Difficulty</legend>
        {DIFFICULTIES.map((d) => (
          <label key={d.id} className={`${styles.diffOption} ${difficulty === d.id ? styles.cardOn : ''}`}>
            <input type="radio" name="difficulty" value={d.id} checked={difficulty === d.id} onChange={() => setDifficulty(d.id)} />
            <span>
              <strong>{d.name}</strong>
              <span>{d.text}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {(submitted && problem) || initialError ? (
        <p className="alert" role="alert">
          {submitted && problem ? problem : initialError}
        </p>
      ) : null}
      <button type="submit" className="btn btn--primary" data-testid="deploy" disabled={Boolean(problem) && submitted}>
        Deploy squad ({chosen.length})
      </button>
      {problem && !submitted && <p className="hint">{problem}</p>}
    </form>
  );
}
