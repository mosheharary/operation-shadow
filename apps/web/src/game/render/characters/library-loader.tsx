'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { AssetBoundary } from '../../assets/boundary';
import { useModel, useModelFile } from '../../assets/models';
import { modelEntry } from '../../assets/registry';
import type { FigureLook } from '../figure';
import type { UnitRig } from '../rig';
import { createCharacterRig } from './character-rig';
import { buildLibrary, type CharacterLibrary } from './library';

/** The loaded library and a factory for its rigs (so callers need not import the rig code). */
export interface CharacterKit {
  lib: CharacterLibrary;
  create: (look: FigureLook) => UnitRig;
}

function Loader({ onReady }: { onReady: (kit: CharacterKit) => void }) {
  const male = useModel('char.body-male');
  const female = useModel('char.body-female');
  const maleLod = useModel('char.body-male-lod1');
  const femaleLod = useModel('char.body-female-lod1');
  const short = useModel('char.hair-short');
  const cropped = useModel('char.hair-cropped');
  const croppedFemale = useModel('char.hair-cropped-female');
  const bob = useModel('char.hair-bob');
  const beard = useModel('char.hair-beard');
  const animations = useModelFile('char.animations').animations;
  const lib = useMemo(() => {
    const clips = modelEntry('char.animations').clips ?? {};
    const speeds = Object.fromEntries(Object.entries(clips).map(([name, clip]) => [name, clip.speed]));
    return buildLibrary({ male, female, maleLod, femaleLod, hair: { short, cropped, 'cropped-female': croppedFemale, bob, beard }, clips: animations, speeds });
  }, [male, female, maleLod, femaleLod, short, cropped, croppedFemale, bob, beard, animations]);
  useEffect(() => onReady({ lib, create: (look) => createCharacterRig(look, lib) }), [lib, onReady]);
  return null;
}

/**
 * Loads the authored character library and hands it over once ready. Renders nothing; the
 * procedural figures stay in place while it downloads or if it fails.
 */
export function CharacterLibraryLoader({ onReady }: { onReady: (kit: CharacterKit) => void }) {
  return (
    <AssetBoundary id="characters" fallback={null}>
      <Suspense fallback={null}>
        <Loader onReady={onReady} />
      </Suspense>
    </AssetBoundary>
  );
}
