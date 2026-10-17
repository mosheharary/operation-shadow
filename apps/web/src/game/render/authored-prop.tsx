'use client';

import { useMemo } from 'react';
import { bakeStaticParts } from '../assets/bake';
import { useModel } from '../assets/models';
import type { ModelId } from '../assets/registry';
import { type KindProps, proceduralParts, PropKindInstances, withWind } from './props';

/**
 * One prop kind drawn with its authored model (loaded lazily, High preset only). Its shadow is
 * cast by the procedural model on the shadow-only layer: a few hundred triangles instead of a few
 * thousand, drawn once per shadow cascade for every instance.
 */
export function AuthoredKind(props: KindProps & { spec: { id: ModelId; height: number; yaw?: number } }) {
  const scene = useModel(props.spec.id);
  const parts = useMemo(() => withWind(props.kind, bakeStaticParts(scene, { ...props.spec, shadow: false })), [scene, props.kind, props.spec]);
  const shadowParts = useMemo(() => withWind(props.kind, proceduralParts(props.kind)), [props.kind]);
  return (
    <>
      <PropKindInstances {...props} parts={parts} />
      <PropKindInstances {...props} parts={shadowParts} shadowOnly />
    </>
  );
}
