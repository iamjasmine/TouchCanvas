"use client";

import type React from 'react';
import { cn } from '@/lib/utils';

interface PlaybackIndicatorComponentProps {
  position: number; // in pixels
  isVisible: boolean;
}

export const PlaybackIndicatorComponent: React.FC<PlaybackIndicatorComponentProps> = ({
  position,
  isVisible,
}) => {
  return (
    <div
      className={cn(
        'absolute top-0 bottom-0 w-1 bg-primary rounded-full shadow-lg transition-opacity duration-300',
        isVisible ? 'opacity-100' : 'opacity-0'
      )}
      style={{ left: `${position}px`, transform: 'translateX(-50%)' }}
      aria-hidden="true"
    />
  );
};
