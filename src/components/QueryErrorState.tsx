import React from 'react';

import { EmptyState } from './EmptyState';

type Props = {
  /** Re-run the failed query. */
  onRetry?: () => void;
};

/**
 * Shown in place of a screen's content when a live query throws. Keep the
 * wording here so every screen fails the same way.
 */
export function QueryErrorState({ onRetry }: Props) {
  return (
    <EmptyState
      icon="alert-circle-outline"
      title="Couldn't load this."
      message="Try again."
      actionLabel={onRetry ? 'Retry' : undefined}
      onAction={onRetry}
    />
  );
}
