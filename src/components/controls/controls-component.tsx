
"use client";

import type React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PlayIcon, StopCircleIcon, PlusIcon, RepeatIcon, MicOffIcon, LayersIcon, WorkflowIcon } from 'lucide-react';

interface ControlsComponentProps {
  isPlaying: boolean;
  isLooping: boolean;
  outputMode: 'mixed' | 'independent';
  onPlay: () => void;
  onStop: () => void;
  onAddBlock: () => void;
  onAddSilenceBlock: () => void;
  onToggleLoop: () => void;
  onToggleOutputMode: () => void;
  canPlay: boolean;
}

export const ControlsComponent: React.FC<ControlsComponentProps> = ({
  isPlaying,
  isLooping,
  outputMode,
  onPlay,
  onStop,
  onAddBlock,
  onAddSilenceBlock,
  onToggleLoop,
  onToggleOutputMode,
  canPlay,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-muted rounded-lg shadow">
      <Button onClick={onAddBlock} variant="outline" className="transition-transform hover:scale-105">
        <PlusIcon className="mr-2 h-5 w-5" />
        Add Audio Block
      </Button>
      <Button onClick={onAddSilenceBlock} variant="outline" className="transition-transform hover:scale-105">
        <MicOffIcon className="mr-2 h-5 w-5" />
        Add Silence
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
      <div className="flex items-center space-x-2 p-2 rounded-md border border-input bg-background transition-transform hover:scale-105">
        {outputMode === 'mixed' ? <LayersIcon className="h-5 w-5 text-primary" /> : <WorkflowIcon className="h-5 w-5 text-accent" />}
        <Label htmlFor="output-mode-switch" className="cursor-pointer text-sm font-medium pr-1">
           {outputMode === 'mixed' ? 'Mixed Output' : 'Independent Output'}
        </Label>
        <Switch
          id="output-mode-switch"
          checked={outputMode === 'independent'}
          onCheckedChange={onToggleOutputMode}
          aria-label={`Current mode: ${outputMode === 'mixed' ? 'Mixed' : 'Independent'} Output. Switch to ${outputMode === 'mixed' ? 'Independent' : 'Mixed'} Output.`}
        />
      </div>
    </div>
  );
};
