
"use client";

import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import type { AudioBlock, AudibleAudioBlock, SilentAudioBlock } from '@/types';
import { useToneContext } from '@/components/providers/tone-provider';
import { ControlsComponent } from '@/components/controls/controls-component';
import { TimelineComponent } from '@/components/timeline/timeline-component';
import { PropertyPanelComponent } from '@/components/property-panel/property-panel.tsx';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const PIXELS_PER_SECOND = 60; // Defines horizontal scale of timeline
const MIN_SUSTAIN_TIME = 0.05; // Minimum duration for the sustain phase in seconds

const calculateADSRDefaults = (duration: number): Pick<AudibleAudioBlock, 'attack' | 'decay' | 'sustainLevel' | 'release'> => {
  return {
    attack: duration * 0.10,
    decay: duration * 0.15,
    sustainLevel: 0.7,
    release: duration * 0.10,
  };
};

const adjustADSR = (block: AudibleAudioBlock): AudibleAudioBlock => {
  let { duration, attack, decay, sustainLevel, release } = block;

  // Ensure individual components are non-negative
  attack = Math.max(0, attack);
  decay = Math.max(0, decay);
  release = Math.max(0, release);
  sustainLevel = Math.max(0, Math.min(sustainLevel, 1));

  // Ensure individual ADSR times do not exceed duration
  attack = Math.min(attack, duration);
  decay = Math.min(decay, duration);
  release = Math.min(release, duration);
  
  let adrSum = attack + decay + release;

  // Constraint 1: A+D+R sum must not exceed duration.
  if (adrSum > duration && duration > 0) {
    const scale = duration / adrSum;
    attack *= scale;
    decay *= scale;
    release *= scale;
    adrSum = duration; // Update sum after scaling
  } else if (duration <= 0) {
    attack = 0; decay = 0; release = 0; adrSum = 0;
  }

  // Constraint 2: Ensure minimum sustain time.
  // Sustain time = duration - (attack + decay + release)
  // We need: duration - adrSum >= MIN_SUSTAIN_TIME
  // So, adrSum <= duration - MIN_SUSTAIN_TIME
  const maxAllowedAdrSum = Math.max(0, duration - MIN_SUSTAIN_TIME);

  if (adrSum > maxAllowedAdrSum) {
    if (maxAllowedAdrSum > 0 && adrSum > 0) { // Check adrSum > 0 to avoid division by zero
      const scale = maxAllowedAdrSum / adrSum;
      attack *= scale;
      decay *= scale;
      release *= scale;
    } else { // Not enough room for MIN_SUSTAIN_TIME, zero out A, D, R
      attack = 0;
      decay = 0;
      release = 0;
    }
  }
  
  const fixNum = (val: number, precision: number = 3) => parseFloat(val.toFixed(precision));

  return {
    ...block,
    attack: fixNum(attack),
    decay: fixNum(decay),
    sustainLevel: fixNum(sustainLevel, 2),
    release: fixNum(release),
  };
};


export default function MusicSyncPage() {
  const { audioContextStarted, startAudioContext } = useToneContext();
  const { toast } = useToast();
  const [audioBlocks, setAudioBlocks] = useState<AudioBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0); // in seconds
  const [isLooping, setIsLooping] = useState(false);

  const activeAudioNodes = useRef<{ osc: Tone.Oscillator, gainEnv?: Tone.Gain }[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const isInitialMount = useRef(true);

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
    const initialDuration = 2;
    const adsrDefaults = calculateADSRDefaults(initialDuration);
    
    let newBlock: AudibleAudioBlock = {
      id: newBlockId,
      waveform: 'sine',
      frequency: 100,
      duration: initialDuration,
      startTime: 0, // Will be recalculated
      isSilent: false,
      ...adsrDefaults,
    };
    newBlock = adjustADSR(newBlock); // Apply constraints to defaults

    setAudioBlocks(prevBlocks => {
      const updatedBlocks = [...prevBlocks, newBlock];
      return recalculateStartTimes(updatedBlocks);
    });
    setSelectedBlockId(newBlockId);
    toast({ title: "Audio Block Added", description: "A new audio block with ADSR envelope has been added." });
  }, [recalculateStartTimes, toast]);

  const handleAddSilenceBlock = useCallback(() => {
    const newBlockId = crypto.randomUUID();
    const newBlock: SilentAudioBlock = {
      id: newBlockId,
      duration: 1, // Default duration for silence
      startTime: 0, // Will be recalculated
      isSilent: true,
    };
    setAudioBlocks(prevBlocks => {
      const updatedBlocks = [...prevBlocks, newBlock];
      return recalculateStartTimes(updatedBlocks);
    });
    setSelectedBlockId(newBlockId);
    toast({ title: "Silence Block Added", description: "A new silence block has been added." });
  }, [recalculateStartTimes, toast]);

  const handleSelectBlock = useCallback((id: string) => {
    setSelectedBlockId(id);
  }, []);

  const handleUpdateBlock = useCallback((updatedBlockData: AudioBlock) => {
    setAudioBlocks(prevBlocks => {
      const updatedBlocks = prevBlocks.map(b => {
        if (b.id === updatedBlockData.id) {
          if (!updatedBlockData.isSilent && !b.isSilent) { // Audible block being updated
            let newAudible = { ...updatedBlockData } as AudibleAudioBlock;
            const oldAudible = b as AudibleAudioBlock;

            // If duration changed, and ADSR values were not part of this specific update (heuristics)
            // then scale ADSR proportionally.
            if (newAudible.duration !== oldAudible.duration && oldAudible.duration > 0) {
              const durationRatio = newAudible.duration / oldAudible.duration;
              // Only scale if the incoming ADSR values are the same as the old ones,
              // implying duration was the primary change from the UI for this update action.
              if (newAudible.attack === oldAudible.attack) {
                newAudible.attack = oldAudible.attack * durationRatio;
              }
              if (newAudible.decay === oldAudible.decay) {
                newAudible.decay = oldAudible.decay * durationRatio;
              }
              if (newAudible.release === oldAudible.release) {
                newAudible.release = oldAudible.release * durationRatio;
              }
              // sustainLevel remains as is, unless also changed in updatedBlockData
            }
            return adjustADSR(newAudible); // Apply constraints
          }
          return updatedBlockData; // For silent blocks or type changes
        }
        return b;
      });
      return recalculateStartTimes(updatedBlocks);
    });
  }, [recalculateStartTimes]);


  const handleDeleteBlock = useCallback((blockIdToDelete: string) => {
    setAudioBlocks(prevBlocks => {
      const filteredBlocks = prevBlocks.filter(b => b.id !== blockIdToDelete);
      return recalculateStartTimes(filteredBlocks);
    });
    setSelectedBlockId(null); // Deselect the block
    toast({ title: "Block Deleted", description: "The audio block has been removed.", variant: "destructive" });
  }, [recalculateStartTimes, toast]);


  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      if (toast && typeof isLooping === 'boolean') { 
        toast({
            title: isLooping ? "Loop Enabled" : "Loop Disabled",
            description: isLooping ? "Playback will now loop." : "Playback will not loop.",
        });
      }
    }
  }, [isLooping, toast]);


  const handleToggleLoop = useCallback(() => {
    setIsLooping(prev => {
      const newLoopState = !prev;
      if (isPlaying && audioBlocks.length > 0) {
        const totalDuration = audioBlocks.reduce((sum, b) => sum + b.duration, 0);
        if (newLoopState) {
          Tone.Transport.loop = true;
          Tone.Transport.loopStart = 0;
          Tone.Transport.loopEnd = totalDuration;
        } else {
          Tone.Transport.loop = false;
        }
      }
      return newLoopState;
    });
  }, [isPlaying, audioBlocks]);

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

    Tone.Transport.cancel(); 
    activeAudioNodes.current.forEach(nodes => {
      nodes.osc.dispose();
      nodes.gainEnv?.dispose();
    });
    activeAudioNodes.current = [];

    audioBlocks.forEach(block => {
      if (block.isSilent) return;

      const audibleBlock = block as AudibleAudioBlock;
      const osc = new Tone.Oscillator({
        type: audibleBlock.waveform,
        frequency: audibleBlock.frequency,
        volume: -6, // Base volume, ADSR will shape it further
      }).start(audibleBlock.startTime); // Start oscillator at block's start time

      // Stop oscillator slightly after block's visual duration to allow release phase to complete if needed
      // Tone.js handles disposal of gain-wrapped oscs well, so direct stop might not be necessary if gain goes to 0.
      // Let's rely on gain envelope completely shaping the sound. Osc needs to run for its duration.
      osc.stop(audibleBlock.startTime + audibleBlock.duration + 0.1); // Ensure it plays long enough for release tail


      const gainEnv = new Tone.Gain(0).toDestination();
      osc.connect(gainEnv);
      activeAudioNodes.current.push({ osc, gainEnv });

      const { startTime, duration, attack, decay, sustainLevel, release } = audibleBlock;
      
      const attackEndTime = startTime + attack;
      const decayEndTime = attackEndTime + decay;
      // Release phase starts relative to the end of the block's duration
      const releaseStartTime = startTime + duration - release; 
      const effectiveEndTime = startTime + duration;

      // Ensure chronological order for ramps
      // gainEnv.gain.cancelScheduledValues(startTime); // Clear previous ramps if any
      gainEnv.gain.setValueAtTime(0, startTime);
      gainEnv.gain.linearRampToValueAtTime(1, attackEndTime); // Peak of attack (full volume for the gain node)
      
      // Sustain phase starts after decay. If release starts before decay finishes, decay ramp is shortened.
      const sustainPhaseStartTime = decayEndTime;
      const sustainPhaseEndTime = releaseStartTime;

      if (sustainPhaseStartTime < sustainPhaseEndTime) { // Normal ADSR order
        gainEnv.gain.linearRampToValueAtTime(sustainLevel, sustainPhaseStartTime); // Ramp to sustain level
        // Hold sustain level until release phase
        if (sustainPhaseEndTime > sustainPhaseStartTime) { // If there's a sustain period
             gainEnv.gain.setValueAtTime(sustainLevel, sustainPhaseEndTime);
        }
        gainEnv.gain.linearRampToValueAtTime(0, effectiveEndTime); // Ramp to 0 at the end of the block
      } else { // Release starts during or before decay finishes (short block or long A/D)
        // Ramp directly to where sustain *would* be at releaseStartTime, or an intermediate value
        // then ramp to 0. This case is complex if A+D > D-R.
        // adjustADSR should prevent A+D+R > D.
        // If D-R < A+D, sustain phase is zero or negative.
        // This means release starts effectively truncating decay or attack.
        // Ramp to sustainLevel at decayEndTime (or earlier if release cuts it)
        const actualDecayOrTransitionTime = Math.min(decayEndTime, releaseStartTime);
        gainEnv.gain.linearRampToValueAtTime(sustainLevel, actualDecayOrTransitionTime);
        // Then ramp from whatever value it is at releaseStartTime to 0 by effectiveEndTime
        // If releaseStartTime < actualDecayOrTransitionTime, this means release starts even before decay would hit sustain.
        // The setValueAtTime(sustainLevel, releaseStartTime) might be needed if sustainPhaseEndTime is before sustainPhaseStartTime
        if (releaseStartTime >= startTime && releaseStartTime < effectiveEndTime) {
             const valueAtReleaseStart = gainEnv.gain.getValueAtTime(releaseStartTime);
             gainEnv.gain.setValueAtTime(valueAtReleaseStart, releaseStartTime); // Hold briefly if needed
             gainEnv.gain.linearRampToValueAtTime(0, effectiveEndTime);
        } else if (releaseStartTime >= effectiveEndTime) { // release is zero or effectively after block end
             gainEnv.gain.linearRampToValueAtTime(0, effectiveEndTime); // Fade out by block end
        } else { // fallback for very short blocks
             gainEnv.gain.linearRampToValueAtTime(0, effectiveEndTime);
        }
      }
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
  }, [audioBlocks, audioContextStarted, startAudioContext, toast, isLooping]);


  const handleStop = useCallback(() => {
    Tone.Transport.stop();
    Tone.Transport.cancel(); 
    Tone.Transport.loop = false; 
    activeAudioNodes.current.forEach(nodes => {
      nodes.osc.dispose();
      nodes.gainEnv?.dispose();
    });
    activeAudioNodes.current = [];
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
      activeAudioNodes.current.forEach(nodes => {
        nodes.osc.dispose();
        nodes.gainEnv?.dispose();
      });
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen items-center p-4 sm:p-8 bg-gradient-to-br from-[hsl(var(--primary)/0.1)] via-[hsl(var(--accent)/0.1)] to-[hsl(var(--secondary)/0.1)]">
      <Card className="w-full max-w-7xl flex-grow flex flex-col shadow-2xl overflow-hidden bg-card rounded-xl">
        <header className="p-6 border-b">
          <h1 className="text-4xl font-bold text-gradient-primary-accent-secondary">
            MusicSync
          </h1>
          <p className="text-muted-foreground mt-1">Craft your unique sound sequences with ADSR control.</p>
        </header>

        <div className="p-6 flex-grow flex flex-col space-y-6">
          <ControlsComponent
            isPlaying={isPlaying}
            isLooping={isLooping}
            onPlay={handlePlay}
            onStop={handleStop}
            onAddBlock={handleAddBlock}
            onAddSilenceBlock={handleAddSilenceBlock}
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
              onDeleteBlock={handleDeleteBlock}
              pixelsPerSecond={PIXELS_PER_SECOND}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
