'use client';

import type { ApiError, GenerationJob, GenerationRequest, JobStage } from '@operation-shadow/schemas';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import styles from './operations.module.css';

type Choices = Required<Omit<GenerationRequest, 'codename' | 'offline'>> & { codename: string };

// Every choice starts on "Random": the server picks a fresh value for each operation.
const OPTIONS = {
  theatre: [
    ['any', 'Random'],
    ['coastal', 'Coast'],
    ['alpine', 'Mountains'],
    ['rail', 'Railway'],
    ['forest', 'Forest'],
    ['farmland', 'Farmland'],
  ],
  timeOfDay: [
    ['any', 'Random'],
    ['dawn', 'Dawn'],
    ['day', 'Day'],
    ['dusk', 'Dusk'],
    ['night', 'Night'],
  ],
  weather: [
    ['any', 'Random'],
    ['clear', 'Clear'],
    ['rain', 'Rain'],
    ['fog', 'Fog'],
    ['snow', 'Snow (alpine only)'],
  ],
  focus: [
    ['any', 'Random'],
    ['sabotage', 'Sabotage'],
    ['steal', 'Steal documents'],
    ['rescue', 'Rescue a prisoner'],
  ],
  objectives: [
    ['any', 'Random'],
    ['1', 'One: a single clean job'],
    ['2', 'Two'],
    ['3', 'Three: a long night'],
  ],
  density: [
    ['any', 'Random'],
    ['light', 'Light: a skeleton crew'],
    ['standard', 'Standard'],
    ['heavy', 'Heavy: a full garrison'],
  ],
  alarm: [
    ['any', 'Random'],
    ['lenient', 'Fight on: the mission continues'],
    ['strict', 'Fail: full alarm ends the mission'],
  ],
  angle: [
    ['any', 'Random'],
    ['supply-raid', 'Supply raid'],
    ['double-agent', 'Double agent in danger'],
    ['race-against-time', 'Race against time'],
    ['diversion', 'The real job behind a diversion'],
    ['stolen-plans', 'Stolen plans'],
    ['defector', 'An officer wants to defect'],
    ['reprisal', 'Stop the reprisals'],
    ['prototype', 'A prototype device'],
    ['traitor-hunt', 'Hunt the traitor'],
    ['lost-team', 'The lost team'],
  ],
} as const;

const LABELS: Record<keyof typeof OPTIONS, string> = {
  theatre: 'Theatre',
  timeOfDay: 'Time of day',
  weather: 'Weather',
  focus: 'Primary objective',
  objectives: 'Number of objectives',
  density: 'Garrison strength',
  alarm: 'If the full alarm sounds',
  angle: 'Story',
};

const RANDOM: Choices = { theatre: 'any', timeOfDay: 'any', weather: 'any', focus: 'any', objectives: 'any', density: 'any', alarm: 'any', angle: 'any', codename: '' };

const STEPS: { stage: JobStage; label: string }[] = [
  { stage: 'queued', label: 'Request received' },
  { stage: 'drafting', label: 'Drafting the plan' },
  { stage: 'validating', label: 'Checking it against field intelligence' },
  { stage: 'building', label: 'Surveying the ground, testing a silent route' },
  { stage: 'illustrating', label: 'Sketching the reconnaissance dossier' },
  { stage: 'ready', label: 'Ready' },
];
const ACTIVE: JobStage[] = ['queued', 'drafting', 'validating', 'building', 'illustrating'];

async function call(url: string, init?: RequestInit): Promise<{ job: GenerationJob }> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = (await res.json().catch(() => null)) as { job: GenerationJob } | ApiError | null;
  if (!res.ok || !body || 'error' in body) throw new Error(body && 'error' in body ? body.error.message : 'The request failed. Check your connection.');
  return body;
}

export function GenerateOperation({ aiAvailable }: { aiAvailable: boolean }) {
  const router = useRouter();
  const [choices, setChoices] = useState<Choices>(RANDOM);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const advancing = useRef(false);

  const start = async (offline: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const body: GenerationRequest = { ...choices, codename: choices.codename.trim() || undefined, offline };
      const res = await call('/api/v1/generation-jobs', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) });
      setJob(res.job);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Poll the job; ask the server to drive it whenever no request of ours is already doing so.
  const jobId = job?.id;
  const active = job ? ACTIVE.includes(job.stage) : false;
  useEffect(() => {
    if (!jobId || !active) return;
    let stopped = false;
    const advance = () => {
      if (advancing.current) return;
      advancing.current = true;
      call(`/api/v1/generation-jobs/${jobId}/advance`, { method: 'POST' })
        .then((res) => !stopped && setJob(res.job))
        .catch(() => undefined)
        .finally(() => {
          advancing.current = false;
        });
    };
    const poll = () =>
      call(`/api/v1/generation-jobs/${jobId}`)
        .then((res) => {
          if (stopped) return;
          setJob(res.job);
          if (ACTIVE.includes(res.job.stage)) advance();
        })
        .catch((err: Error) => !stopped && setError(err.message));
    const timer = window.setInterval(poll, 1500);
    poll();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [jobId, active]);

  useEffect(() => {
    if (job?.stage === 'ready' && job.missionKey) router.push(`/missions/${job.missionKey}`);
  }, [job, router]);

  const cancel = async () => {
    if (!job) return;
    await call(`/api/v1/generation-jobs/${job.id}/cancel`, { method: 'POST' }).catch(() => undefined);
    setJob(null);
  };

  const useOffline = async () => {
    if (job) await call(`/api/v1/generation-jobs/${job.id}/cancel`, { method: 'POST' }).catch(() => undefined);
    await start(true);
  };

  if (job) {
    // The offline generator draws no sketch.
    const steps = STEPS.filter((s) => job.provider !== 'disabled' || s.stage !== 'illustrating');
    const current = steps.findIndex((s) => s.stage === job.stage);
    const failed = job.stage === 'failed' || job.stage === 'cancelled';
    return (
      <section className={styles.progress} aria-live="polite" data-testid="generation-progress" data-stage={job.stage}>
        <h2>{failed ? job.message : job.stage === 'ready' ? 'Operation ready: opening the briefing' : job.message}</h2>
        <ol className={styles.steps}>
          {steps.map((step, i) => (
            <li key={step.stage} className={i < current || job.stage === 'ready' ? styles.done : i === current ? styles.current : undefined}>
              {step.label}
            </li>
          ))}
        </ol>
        {job.provider === 'disabled' && <p className="hint">Using the offline generator: no AI model is involved.</p>}
        <div className={styles.actions}>
          {!failed && job.stage !== 'ready' && (
            <>
              {job.provider !== 'disabled' && job.stage !== 'illustrating' && (
                <button type="button" className="btn" onClick={useOffline} disabled={busy}>
                  Use the offline generator instead
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={cancel}>
                Cancel
              </button>
            </>
          )}
          {failed && (
            <>
              <button type="button" className="btn btn--primary" onClick={() => setJob(null)}>
                Back
              </button>
              <button type="button" className="btn" onClick={useOffline} disabled={busy}>
                Use the offline generator
              </button>
            </>
          )}
        </div>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void start(false);
  };

  return (
    <form className={styles.form} onSubmit={submit} data-testid="generate-form">
      {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).map((field) => (
        <label key={field} className={styles.field}>
          <span>{LABELS[field]}</span>
          <select value={choices[field]} onChange={(e) => setChoices({ ...choices, [field]: e.target.value })} name={field}>
            {OPTIONS[field].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className={styles.field}>
        <span>Codename (optional)</span>
        <input
          name="codename"
          value={choices.codename}
          maxLength={40}
          pattern="[A-Za-z][A-Za-z '\-]*"
          title="Letters, spaces, apostrophes and hyphens"
          placeholder="Leave empty for a fresh one"
          onChange={(e) => setChoices({ ...choices, codename: e.target.value })}
        />
      </label>
      <p className={styles.provider}>
        {aiAvailable
          ? 'Lantern drafts the operation and sketches its dossier with Google Gemini (about 25 seconds). Anything left on Random is chosen fresh for every operation. If anything fails, the offline generator steps in.'
          : 'AI drafting is not configured on this server, so the offline generator prepares the operation. Anything left on Random is chosen fresh for every operation.'}
      </p>
      <div className={styles.actions}>
        <button type="submit" className="btn btn--primary" disabled={busy} data-testid="generate">
          {aiAvailable ? 'Request operation' : 'Generate offline'}
        </button>
        {aiAvailable && (
          <button type="button" className="btn" disabled={busy} onClick={() => void start(true)} data-testid="generate-offline">
            Use the offline generator
          </button>
        )}
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setChoices(RANDOM)} data-testid="reset-random">
          Set everything to Random
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
