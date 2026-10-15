'use client';

import { useFrame } from '@react-three/fiber';
import { cameraFocus } from '../camera/camera-rig';
import type { AudioEngine } from './audio-engine';

/** Moves the listener with the camera and steps ambience and music once per frame. */
export function AudioBridge({ audio }: { audio: AudioEngine }) {
  useFrame((state) => {
    audio.updateListener(state.camera, cameraFocus(state.camera));
    audio.update();
  });
  return null;
}
