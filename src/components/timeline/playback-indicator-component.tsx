"use client";

import type React from 'react';
import { cn } from '@/lib/utils';

interface PlaybackIndicatorComponentProps {
  position: number; // in pixels
  isVisible: boolean;
  containerHeight: number; // Total height of the timeline container in pixels
  className?: string;
}

export const PlaybackIndicatorComponent: React.FC<PlaybackIndicatorComponentProps> = ({
  position,
  isVisible,
  containerHeight,
  className,
}) => {
  return (
    <div
      className={cn(
        'absolute top-0 w-1 bg-primary rounded-full shadow-lg transition-opacity duration-300 z-20', // Ensure it's on top
        isVisible ? 'opacity-100' : 'opacity-0',
        'pointer-events-none', // Prevent interaction
        className
      )}
      style={{ 
        left: `${position}px`, 
        height: `${containerHeight}px`, // Span the full height of all channels
        transform: 'translateX(-50%)' 
      }}
      aria-hidden="true"
    />
  );
};
