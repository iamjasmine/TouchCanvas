
"use client";

import type React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { PlayIcon, StopCircleIcon, PlusIcon, RepeatIcon, MicOffIcon, LayersIcon, WorkflowIcon, Volume2Icon, Loader2, BeakerIcon, ThermometerIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface ControlsComponentProps {
  isPlaying: boolean;
  isLooping: boolean;
  isActivatingAudio: boolean;
  outputMode: 'mixed' | 'independent';
  masterVolume: number; // 0 to 1
  onPlay: () => void;
  onStop: () => void;
  onAddBlock: () => void;
  onAddSilenceBlock: () => void;
  onAddTemperatureBlock: () => void; // New prop
  onToggleLoop: () => void;
  onToggleOutputMode: () => void;
  onMasterVolumeChange: (volume: number) => void;
  onTestAudio: () => void;
  canPlay: boolean;
  disableAddAudioBlock: boolean; // Renamed for clarity
  disableAddTemperatureBlock: boolean; // New prop
}

export const ControlsComponent: React.FC<ControlsComponentProps> = ({
  isPlaying,
  isLooping,
  isActivatingAudio,
  outputMode,
  masterVolume,
  onPlay,
  onStop,
  onAddBlock,
  onAddSilenceBlock,
  onAddTemperatureBlock,
  onToggleLoop,
  onToggleOutputMode,
  onMasterVolumeChange,
  onTestAudio,
  canPlay,
  disableAddAudioBlock,
  disableAddTemperatureBlock,
}) => {
  const addAudioBlockTooltip = disableAddAudioBlock
    ? "Select an audio channel first"
    : (isActivatingAudio ? "Initializing audio..." : "Add Audio Block");

  const addSilenceTooltip = disableAddAudioBlock
    ? "Select an audio channel first"
    : (isActivatingAudio ? "Initializing audio..." : "Add Silence Block");

  const addTemperatureBlockTooltip = disableAddTemperatureBlock
    ? "Select a thermal channel first"
    : "Add Temperature Block";

  return (
    <Card className="p-4 bg-muted/80 rounded-lg shadow">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button
          onClick={onAddBlock}
          variant="outline"
          className="transition-transform hover:scale-105"
          disabled={disableAddAudioBlock || isActivatingAudio}
          title={addAudioBlockTooltip}
        >
          {isActivatingAudio && !disableAddAudioBlock ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlusIcon className="mr-2 h-5 w-5" />}
          Add Audio
        </Button>
        <Button
          onClick={onAddSilenceBlock}
          variant="outline"
          className="transition-transform hover:scale-105"
          disabled={disableAddAudioBlock || isActivatingAudio}
          title={addSilenceTooltip}
        >
          {isActivatingAudio && !disableAddAudioBlock ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <MicOffIcon className="mr-2 h-5 w-5" />}
          Add Silence
        </Button>
        <Button
          onClick={onAddTemperatureBlock}
          variant="outline"
          className="transition-transform hover:scale-105"
          disabled={disableAddTemperatureBlock || isActivatingAudio}
          title={addTemperatureBlockTooltip}
        >
          <ThermometerIcon className="mr-2 h-5 w-5" />
          Add Temp
        </Button>
        <Button
          onClick={onPlay}
          disabled={isPlaying || !canPlay || isActivatingAudio}
          variant="default"
          className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50"
          aria-label="Play audio sequence"
          title={isActivatingAudio ? "Initializing audio..." : (isPlaying ? "Playback in progress" : (!canPlay ? "No valid audio blocks to play or channel muted" : "Play"))}
        >
          {isActivatingAudio && canPlay && !isPlaying ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlayIcon className="mr-2 h-5 w-5" />}
          Play
        </Button>
        <Button
          onClick={onStop}
          disabled={!isPlaying || isActivatingAudio}
          variant="destructive"
          className="transition-transform hover:scale-105 disabled:opacity-50"
          aria-label="Stop audio playback"
          title={isActivatingAudio ? "Audio system busy" : (!isPlaying ? "Not playing" : "Stop")}
        >
          <StopCircleIcon className="mr-2 h-5 w-5" />
          Stop
        </Button>
        <Button
          onClick={onToggleLoop}
          variant={isLooping ? "default" : "outline"}
          className="transition-transform hover:scale-105"
          aria-pressed={isLooping}
          aria-label={isLooping ? "Disable Loop" : "Enable Loop"}
          title={isLooping ? "Disable Loop" : "Enable Loop"}
          disabled={isActivatingAudio}
        >
          <RepeatIcon className="mr-2 h-5 w-5" />
          {isLooping ? "Looping" : "Loop"}
        </Button>
         <Button
          onClick={onTestAudio}
          variant="outline"
          className="transition-transform hover:scale-105"
          title="Test Basic Audio Output"
          disabled={isActivatingAudio}
        >
          {isActivatingAudio ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <BeakerIcon className="mr-2 h-5 w-5" />}
          Test Audio
        </Button>

        <div className="flex items-center space-x-2 p-2 rounded-md border border-input bg-background transition-transform hover:scale-105">
          {outputMode === 'mixed' ? <LayersIcon className="h-5 w-5 text-primary" /> : <WorkflowIcon className="h-5 w-5 text-accent" />}
          <Label htmlFor="output-mode-switch" className="cursor-pointer text-sm font-medium pr-1">
             {outputMode === 'mixed' ? 'Mixed' : 'Independent'}
          </Label>
          <Switch
            id="output-mode-switch"
            checked={outputMode === 'independent'}
            onCheckedChange={onToggleOutputMode}
            aria-label={`Current mode: ${outputMode === 'mixed' ? 'Mixed' : 'Independent'} Output. Switch to ${outputMode === 'mixed' ? 'Independent' : 'Mixed'} Output.`}
            title="Toggle Output Mode"
            disabled={isActivatingAudio}
          />
        </div>

        <div className="flex items-center space-x-2 p-2 rounded-md border border-input bg-background min-w-[200px] transition-transform hover:scale-105">
          <Volume2Icon className="h-5 w-5 text-primary" />
          <Label htmlFor="master-volume" className="text-sm font-medium pr-1 whitespace-nowrap">
            Master Vol: {Math.round(masterVolume * 100)}%
          </Label>
          <Slider
            id="master-volume"
            min={0}
            max={1}
            step={0.01}
            value={[masterVolume]}
            onValueChange={(value) => onMasterVolumeChange(value[0])}
            className="flex-grow"
            aria-label="Master volume control"
            title="Adjust Master Volume"
            disabled={isActivatingAudio}
          />
        </div>
      </div>
    </Card>
  );
};
