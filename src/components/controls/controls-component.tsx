
"use client";

import type React from 'react';
import { Button } from '@/components/ui/button';
import { PlayIcon, StopCircleIcon, PlusIcon, RepeatIcon } from 'lucide-react';

interface ControlsComponentProps {
  isPlaying: boolean;
  isLooping: boolean;
  onPlay: () => void;
  onStop: () => void;
  onAddBlock: () => void;
  onToggleLoop: () => void;
  canPlay: boolean;
}

export const ControlsComponent: React.FC<ControlsComponentProps> = ({
  isPlaying,
  isLooping,
  onPlay,
  onStop,
  onAddBlock,
  onToggleLoop,
  canPlay,
}) => {
  return (
    <div className="flex items-center space-x-4 p-4 bg-muted rounded-lg shadow">
      <Button onClick={onAddBlock} variant="outline" className="transition-transform hover:scale-105">
        <PlusIcon className="mr-2 h-5 w-5" />
        Add Audio Block
      </Button>
      <Button
        onClick={onPlay}
        disabled={isPlaying || !canPlay}
        variant="default"
        className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50"
        aria-label="Play audio sequence"
      >
        <PlayIcon className="mr-2 h-5 w-5" />
        Play
      </Button>
      <Button
        onClick={onStop}
        disabled={!isPlaying}
        variant="destructive"
        className="transition-transform hover:scale-105 disabled:opacity-50"
        aria-label="Stop audio playback"
      >
        <StopCircleIcon className="mr-2 h-5 w-5" />
        Stop
      </Button>
      <Button
        onClick={onToggleLoop}
        variant={isLooping ? "default" : "outline"}
        className="transition-transform hover:scale-105"
        aria-pressed={isLooping}
        aria-label={isLooping ? "Disable loop" : "Enable loop"}
      >
        <RepeatIcon className="mr-2 h-5 w-5" />
        {isLooping ? "Looping" : "Loop"}
      </Button>
    </div>
  );
};
