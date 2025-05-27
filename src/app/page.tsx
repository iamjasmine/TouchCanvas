
"use client";

import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import type { AudioBlock } from '@/types';
import { useToneContext } from '@/components/providers/tone-provider';
import { ControlsComponent } from '@/components/controls/controls-component';
import { TimelineComponent } from '@/components/timeline/timeline-component';
import { PropertyPanelComponent } from '@/components/property-panel/property-panel.tsx';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const PIXELS_PER_SECOND = 60; // Defines horizontal scale of timeline

export default function MusicSyncPage() {
  const { audioContextStarted, startAudioContext } = useToneContext();
  const { toast } = useToast();
  const [audioBlocks, setAudioBlocks] = useState<AudioBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0); // in seconds
  const [isLooping, setIsLooping] = useState(false);

  const activeOscillators = useRef<Tone.Oscillator[]>([]);
  const animationFrameId = useRef<number | null>(null);

  const selectedBlock = audioBlocks.find(block => block.id === selectedBlockId) || null;

  const recalculateStartTimes = useCallback((blocks: AudioBlock[]): AudioBlock[] => {
    let cumulativeTime = 0;
    return blocks.map(block => {
      const newStartTime = cumulativeTime;
      cumulativeTime += block.duration;
      return { ...block, startTime: newStartTime };
    });
  }, []);

  const handleAddBlock = useCallback(() => {
    const newBlockId = crypto.randomUUID();
    const newBlock: AudioBlock = {
      id: newBlockId,
      waveform: 'sine',
      frequency: 100,
      duration: 2,
      startTime: 0, // Will be recalculated
    };
    setAudioBlocks(prevBlocks => {
      const updatedBlocks = [...prevBlocks, newBlock];
      return recalculateStartTimes(updatedBlocks);
    });
    setSelectedBlockId(newBlockId);
    toast({ title: "Block Added", description: "A new audio block has been added to the timeline." });
  }, [recalculateStartTimes, toast]);

  const handleSelectBlock = useCallback((id: string) => {
    setSelectedBlockId(id);
  }, []);

  const handleUpdateBlock = useCallback((updatedBlockData: AudioBlock) => {
    setAudioBlocks(prevBlocks => {
      const updatedBlocks = prevBlocks.map(b => b.id === updatedBlockData.id ? updatedBlockData : b);
      return recalculateStartTimes(updatedBlocks);
    });
  }, [recalculateStartTimes]);

  const handleToggleLoop = useCallback(() => {
    setIsLooping(prev => {
      const newLoopState = !prev;
      toast({
        title: newLoopState ? "Loop Enabled" : "Loop Disabled",
        description: newLoopState ? "Playback will now loop." : "Playback will not loop.",
      });
      // If playback is ongoing, update Tone.Transport immediately
      if (isPlaying && audioBlocks.length > 0) {
        const totalDuration = audioBlocks.reduce((sum, b) => sum + b.duration, 0);
        if (newLoopState) {
          Tone.Transport.loop = true;
          Tone.Transport.loopStart = 0;
          Tone.Transport.loopEnd = totalDuration;
        } else {
          Tone.Transport.loop = false;
          // If it was looping and now it's not, we might need to schedule a stop
          // This part is complex as the playhead might be past totalDuration if it was looping
          // For simplicity, current behavior: if loop is turned off mid-play, it continues till manually stopped or natural end if that was scheduled
        }
      }
      return newLoopState;
    });
  }, [toast, isPlaying, audioBlocks]);

  const handlePlay = useCallback(async () => {
    if (!audioContextStarted) {
      await startAudioContext();
    }
    if (Tone.context.state !== 'running') {
      await Tone.start(); 
    }
    if (audioBlocks.length === 0) {
      toast({ title: "Cannot Play", description: "Add some audio blocks first!", variant: "destructive" });
      return;
    }

    Tone.Transport.cancel(); // Clear any previous schedules
    activeOscillators.current.forEach(osc => osc.dispose());
    activeOscillators.current = [];

    audioBlocks.forEach(block => {
      const osc = new Tone.Oscillator({
        type: block.waveform,
        frequency: block.frequency,
        volume: -6,
      }).toDestination();
      osc.start(block.startTime).stop(block.startTime + block.duration);
      activeOscillators.current.push(osc);
    });

    const totalDuration = audioBlocks.reduce((sum, b) => sum + b.duration, 0);

    if (isLooping) {
      Tone.Transport.loop = true;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = totalDuration;
    } else {
      Tone.Transport.loop = false;
      Tone.Transport.scheduleOnce(() => {
        setIsPlaying(false);
      }, totalDuration + 0.01); 
    }

    Tone.Transport.start();
    setIsPlaying(true);
  }, [audioBlocks, audioContextStarted, startAudioContext, toast, isLooping, recalculateStartTimes]);


  const handleStop = useCallback(() => {
    Tone.Transport.stop();
    Tone.Transport.cancel(); 
    Tone.Transport.loop = false; // Explicitly turn off looping
    activeOscillators.current.forEach(osc => osc.dispose());
    activeOscillators.current = [];
    setIsPlaying(false);
    setCurrentPlayTime(0);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      const update = () => {
        setCurrentPlayTime(Tone.Transport.seconds);
        animationFrameId.current = requestAnimationFrame(update);
      };
      animationFrameId.current = requestAnimationFrame(update);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      // Update time one last time when stopping, unless it was reset by handleStop
      if (Tone.Transport.seconds !== 0) {
         setCurrentPlayTime(Tone.Transport.seconds);
      }
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      Tone.Transport.stop();
      Tone.Transport.cancel();
      Tone.Transport.loop = false;
      activeOscillators.current.forEach(osc => osc.dispose());
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen items-center p-4 sm:p-8 bg-gradient-to-br from-[hsl(var(--primary)/0.1)] via-[hsl(var(--accent)/0.1)] to-[hsl(var(--secondary)/0.1)]">
      <Card className="w-full max-w-7xl flex-grow flex flex-col shadow-2xl overflow-hidden bg-card rounded-xl">
        <header className="p-6 border-b">
          <h1 className="text-4xl font-bold text-gradient-primary-accent-secondary">
            MusicSync
          </h1>
          <p className="text-muted-foreground mt-1">Craft your unique sound sequences.</p>
        </header>

        <div className="p-6 flex-grow flex flex-col space-y-6">
          <ControlsComponent
            isPlaying={isPlaying}
            isLooping={isLooping}
            onPlay={handlePlay}
            onStop={handleStop}
            onAddBlock={handleAddBlock}
            onToggleLoop={handleToggleLoop}
            canPlay={audioBlocks.length > 0}
          />

          <div className="flex flex-col md:flex-row flex-grow space-y-6 md:space-y-0 md:space-x-6 min-h-[calc(100vh-320px)] sm:min-h-[450px]">
            <TimelineComponent
              className="flex-grow md:w-2/3"
              blocks={audioBlocks}
              selectedBlockId={selectedBlockId}
              onSelectBlock={handleSelectBlock}
              currentPlayTime={currentPlayTime}
              isPlaying={isPlaying}
              pixelsPerSecond={PIXELS_PER_SECOND}
            />
            <PropertyPanelComponent
              className="w-full md:w-1/3 md:max-w-sm"
              selectedBlock={selectedBlock}
              onUpdateBlock={handleUpdateBlock}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
