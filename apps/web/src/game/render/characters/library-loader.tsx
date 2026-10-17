'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { AssetBoundary, useModel, useModelFile } from '../../assets/models';
import { modelEntry } from '../../assets/registry';
import { buildLibrary, type CharacterLibrary } from './library';

function Loader({ onReady }: { onReady: (lib: CharacterLibrary) => void }) {
  const male = useModel('char.body-male');
  const female = useModel('char.body-female');
  const short = useModel('char.hair-short');
  const cropped = useModel('char.hair-cropped');
  const croppedFemale = useModel('char.hair-cropped-female');
  const bob = useModel('char.hair-bob');
  const beard = useModel('char.hair-beard');
  const animations = useModelFile('char.animations').animations;
  const lib = useMemo(() => {
    const clips = modelEntry('char.animations').clips ?? {};
    const speeds = Object.fromEntries(Object.entries(clips).map(([name, clip]) => [name, clip.speed]));
    return buildLibrary({ male, female, hair: { short, cropped, 'cropped-female': croppedFemale, bob, beard }, clips: animations, speeds });
  }, [male, female, short, cropped, croppedFemale, bob, beard, animations]);
  useEffect(() => onReady(lib), [lib, onReady]);
  return null;
}

/**
 * Loads the authored character library and hands it over once ready. Renders nothing; the
 * procedural figures stay in place while it downloads or if it fails.
 */
export function CharacterLibraryLoader({ onReady }: { onReady: (lib: CharacterLibrary) => void }) {
  return (
    <AssetBoundary id="characters" fallback={null}>
      <Suspense fallback={null}>
        <Loader onReady={onReady} />
      </Suspense>
    </AssetBoundary>
  );
}
