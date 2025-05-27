
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
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';

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

  attack = Math.max(0, attack);
  decay = Math.max(0, decay);
  release = Math.max(0, release);
  sustainLevel = Math.max(0, Math.min(sustainLevel, 1));

  attack = Math.min(attack, duration);
  decay = Math.min(decay, duration);
  release = Math.min(release, duration);
  
  let adrSum = attack + decay + release;

  if (adrSum > duration && duration > 0) {
    const scale = duration / adrSum;
    attack *= scale;
    decay *= scale;
    release *= scale;
    adrSum = duration; 
  } else if (duration <= 0) {
    attack = 0; decay = 0; release = 0; adrSum = 0;
  }

  const maxAllowedAdrSum = Math.max(0, duration - MIN_SUSTAIN_TIME);

  if (adrSum > maxAllowedAdrSum) {
    if (maxAllowedAdrSum > 0 && adrSum > 0) { 
      const scale = maxAllowedAdrSum / adrSum;
      attack *= scale;
      decay *= scale;
      release *= scale;
    } else { 
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
  const [currentPlayTime, setCurrentPlayTime] = useState(0); 
  const [isLooping, setIsLooping] = useState(false);
  const [outputMode, setOutputMode] = useState<'mixed' | 'independent'>('mixed');
  const [masterVolume, setMasterVolume] = useState<number>(0.75); // 0 to 1

  const activeAudioNodes = useRef<{ osc: Tone.Oscillator, gainEnv?: Tone.Gain }[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const masterVolumeNodeRef = useRef<Tone.Volume | null>(null);
  
  const isInitialMount = useRef({
    looping: true,
    outputMode: true,
    volume: true,
  });

  const selectedBlock = audioBlocks.find(block => block.id === selectedBlockId) || null;

  useEffect(() => {
    if (audioContextStarted && !masterVolumeNodeRef.current) {
      masterVolumeNodeRef.current = new Tone.Volume(Tone.gainToDb(masterVolume)).toDestination();
    }
    return () => {
      masterVolumeNodeRef.current?.dispose();
      masterVolumeNodeRef.current = null;
    };
  }, [audioContextStarted, masterVolume]); 

  useEffect(() => {
    if (masterVolumeNodeRef.current) {
      masterVolumeNodeRef.current.volume.rampTo(Tone.gainToDb(masterVolume), 0.05);
    }
  }, [masterVolume]);

  const handleMasterVolumeChange = useCallback((newVolume: number) => {
    setMasterVolume(Math.max(0, Math.min(1, newVolume))); 
  }, []);


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
      startTime: 0, 
      isSilent: false,
      ...adsrDefaults,
    };
    newBlock = adjustADSR(newBlock); 

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
      duration: 1, 
      startTime: 0, 
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
          if (!updatedBlockData.isSilent && !b.isSilent) { 
            let newAudible = { ...updatedBlockData } as AudibleAudioBlock;
            const oldAudible = b as AudibleAudioBlock;

            if (newAudible.duration !== oldAudible.duration && oldAudible.duration > 0) {
              const durationRatio = newAudible.duration / oldAudible.duration;
              if (newAudible.attack === oldAudible.attack) {
                newAudible.attack = oldAudible.attack * durationRatio;
              }
              if (newAudible.decay === oldAudible.decay) {
                newAudible.decay = oldAudible.decay * durationRatio;
              }
              if (newAudible.release === oldAudible.release) {
                newAudible.release = oldAudible.release * durationRatio;
              }
            }
            return adjustADSR(newAudible); 
          }
          return updatedBlockData; 
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
    setSelectedBlockId(null); 
    toast({ title: "Block Deleted", description: "The audio block has been removed.", variant: "destructive" });
  }, [recalculateStartTimes, toast]);


  useEffect(() => {
    if (isInitialMount.current.looping) {
        isInitialMount.current.looping = false;
    } else {
        if (toast && typeof isLooping === 'boolean') {
            toast({
                title: isLooping ? "Loop Enabled" : "Loop Disabled",
                description: isLooping ? "Playback will now loop." : "Playback will not loop.",
            });
        }
    }
  }, [isLooping, toast]);

  useEffect(() => {
    if (isInitialMount.current.outputMode) {
        isInitialMount.current.outputMode = false;
    } else {
      if (toast) {
        toast({
          title: "Output Mode Changed",
          description: `Switched to ${outputMode === 'mixed' ? 'Mixed' : 'Independent'} Output.`,
        });
      }
    }
  }, [outputMode, toast]);

  useEffect(() => {
    if (isInitialMount.current.volume) {
        isInitialMount.current.volume = false;
    } else {
        if (toast) {
            toast({
                title: "Master Volume Changed",
                description: `Volume set to ${Math.round(masterVolume * 100)}%`,
            });
        }
    }
  }, [masterVolume, toast]);

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

  const handleToggleOutputMode = useCallback(() => {
    setOutputMode(prevMode => (prevMode === 'mixed' ? 'independent' : 'mixed'));
  }, []);

  const handlePlay = useCallback(async () => {
    if (!audioContextStarted) {
      await startAudioContext();
    }
    if (Tone.context.state !== 'running') {
      await Tone.start(); 
    }
    if (!masterVolumeNodeRef.current) { 
        if (audioContextStarted) { 
             masterVolumeNodeRef.current = new Tone.Volume(Tone.gainToDb(masterVolume)).toDestination();
        } else {
            toast({ title: "Audio Error", description: "Master volume node not ready.", variant: "destructive"});
            return;
        }
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
        volume: -6, 
      }).start(audibleBlock.startTime); 

      osc.stop(audibleBlock.startTime + audibleBlock.duration + 0.1); 

      const gainEnv = new Tone.Gain(0).connect(masterVolumeNodeRef.current!);
      osc.connect(gainEnv);
      activeAudioNodes.current.push({ osc, gainEnv });

      const { startTime, duration, attack, decay, sustainLevel, release } = audibleBlock;
      
      const attackEndTime = startTime + attack;
      const decayEndTime = attackEndTime + decay;
      const releaseStartTime = startTime + duration - release; 
      const effectiveEndTime = startTime + duration;

      gainEnv.gain.setValueAtTime(0, startTime);
      gainEnv.gain.linearRampToValueAtTime(1, attackEndTime); 
      
      const sustainPhaseStartTime = decayEndTime;
      const sustainPhaseEndTime = releaseStartTime;

      if (sustainPhaseStartTime < sustainPhaseEndTime) { 
        gainEnv.gain.linearRampToValueAtTime(sustainLevel, sustainPhaseStartTime); 
        if (sustainPhaseEndTime > sustainPhaseStartTime) { 
             gainEnv.gain.setValueAtTime(sustainLevel, sustainPhaseEndTime);
        }
        gainEnv.gain.linearRampToValueAtTime(0, effectiveEndTime); 
      } else { 
        const actualDecayOrTransitionTime = Math.min(decayEndTime, releaseStartTime);
        gainEnv.gain.linearRampToValueAtTime(sustainLevel, actualDecayOrTransitionTime);
        if (releaseStartTime >= startTime && releaseStartTime < effectiveEndTime) {
             const valueAtReleaseStart = gainEnv.gain.getValueAtTime(releaseStartTime);
             gainEnv.gain.setValueAtTime(valueAtReleaseStart, releaseStartTime); 
             gainEnv.gain.linearRampToValueAtTime(0, effectiveEndTime);
        } else if (releaseStartTime >= effectiveEndTime) { 
             gainEnv.gain.linearRampToValueAtTime(0, effectiveEndTime); 
        } else { 
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
        setCurrentPlayTime(0); 
        Tone.Transport.position = 0; 
      }, totalDuration + 0.01); 
    }

    Tone.Transport.start();
    setIsPlaying(true);
  }, [audioBlocks, audioContextStarted, startAudioContext, toast, isLooping, masterVolume, setCurrentPlayTime]);


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
      setCurrentPlayTime(Tone.Transport.seconds); 
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
      activeAudioNodes.current = [];
    };
  }, []);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4 border-b">
          <h2 className="text-xl font-semibold text-sidebar-foreground">Channels</h2>
        </SidebarHeader>
        <SidebarContent>
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-medium text-sidebar-foreground mb-2">Channel 1</h3>
              <div className="space-y-1">
                <Label htmlFor="channel-1-volume" className="text-sm text-sidebar-foreground/80">
                  Volume: {Math.round(masterVolume * 100)}%
                </Label>
                <Slider
                  id="channel-1-volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={[masterVolume]}
                  onValueChange={(value) => handleMasterVolumeChange(value[0])}
                  className="[&>span]:bg-sidebar-primary [&>span>span]:border-sidebar-primary [&>span>span]:bg-sidebar-background"
                />
              </div>
            </div>
            {/* Future channels would go here */}
          </div>
        </SidebarContent>
        <SidebarFooter className="p-4 border-t">
          <Button disabled variant="outline" className="w-full border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <PlusIcon className="mr-2 h-5 w-5" />
            Add Channel
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="flex flex-col h-full bg-gradient-to-br from-[hsl(var(--background)/0.5)] via-[hsl(var(--muted)/0.5)] to-[hsl(var(--background)/0.5)]">
          <Card className="flex-grow flex flex-col shadow-2xl overflow-hidden bg-card rounded-none sm:rounded-xl m-0 sm:m-4 md:m-8 h-full">
            <header className="p-4 sm:p-6 border-b flex items-center justify-between">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gradient-primary-accent-secondary">
                  MusicSync
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base mt-1">Craft your unique sound sequences.</p>
              </div>
              <SidebarTrigger className="md:hidden text-foreground" />
            </header>

            <div className="p-4 sm:p-6 flex-grow flex flex-col space-y-4 sm:space-y-6 overflow-y-auto">
              <ControlsComponent
                isPlaying={isPlaying}
                isLooping={isLooping}
                outputMode={outputMode}
                masterVolume={masterVolume}
                onPlay={handlePlay}
                onStop={handleStop}
                onAddBlock={handleAddBlock}
                onAddSilenceBlock={handleAddSilenceBlock}
                onToggleLoop={handleToggleLoop}
                onToggleOutputMode={handleToggleOutputMode}
                onMasterVolumeChange={handleMasterVolumeChange}
                canPlay={audioBlocks.length > 0}
              />

              <div className="flex flex-col md:flex-row flex-grow space-y-4 md:space-y-0 md:space-x-6">
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
      </SidebarInset>
    </SidebarProvider>
  );
}

    