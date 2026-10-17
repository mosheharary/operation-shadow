'use client';

import { Component, type ReactNode } from 'react';
import { useAssetStatus } from './status';

/** Renders `fallback` (the procedural version) when a model fails to load. */
export class AssetBoundary extends Component<{ id: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    useAssetStatus.getState().markFailed(this.props.id, error instanceof Error ? error.message : String(error));
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
