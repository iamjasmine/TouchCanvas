
"use client";

import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import type { AudioBlock, AudibleAudioBlock, SilentAudioBlock, Channel, WaveformType } from '@/types';
import { useToneContext } from '@/components/providers/tone-provider';
import { ControlsComponent } from '@/components/controls/controls-component';
import { PropertyPanelComponent } from '@/components/property-panel/property-panel.tsx';
import { ChannelViewComponent } from '@/components/channel/channel-view';
import { PlaybackIndicatorComponent } from '@/components/timeline/playback-indicator-component';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PlusIcon, ListMusicIcon } from 'lucide-react';

const PIXELS_PER_SECOND = 60;
const MIN_SUSTAIN_TIME = 0.05; // Minimum duration for the sustain phase

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

  if (duration <= 0) {
    attack = 0; decay = 0; release = 0; adrSum = 0;
  } else {
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
        release = Math.min(release, duration); 
        if (duration > 0 && release === 0 && maxAllowedAdrSum <=0) {
           // duration <= MIN_SUSTAIN_TIME. A,D,R must be 0.
        } else if (duration > 0 && maxAllowedAdrSum <=0) { 
            release = duration; 
        } else {
            release = 0;
        }
      }
    }
  }
  
  adrSum = attack + decay + release; // Recalculate after potential scaling
  if (adrSum > duration && duration > 0) {
    const scale = duration / adrSum;
    attack *= scale;
    decay *= scale;
    release *= scale;
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

type ActiveChannelAudioNodes = {
  osc: Tone.Oscillator;
  adsrGain: Tone.Gain;
  channelVolumeNode: Tone.Volume;
};

export default function MusicSyncPage() {
  const { audioContextStarted, startAudioContext } = useToneContext();
  const { toast } = useToast();

  const initialChannel: Channel = {
    id: crypto.randomUUID(),
    name: 'Channel 1',
    volume: 0.75,
    isMuted: false,
    audioBlocks: [],
  };
  const [channels, setChannels] = useState<Channel[]>([initialChannel]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(initialChannel.id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0); 
  const [isLooping, setIsLooping] = useState(false);
  const [outputMode, setOutputMode] = useState<'mixed' | 'independent'>('mixed');
  const [masterVolume, setMasterVolume] = useState<number>(0.75);

  const activeAudioNodesMap = useRef<Map<string, ActiveChannelAudioNodes[]>>(new Map());
  const animationFrameId = useRef<number | null>(null);
  const masterVolumeNodeRef = useRef<Tone.Volume | null>(null);
  
  const isInitialMount = useRef({ looping: true, outputMode: true, masterVolume: true });

  const selectedChannel = channels.find(ch => ch.id === selectedChannelId) || null;
  const selectedBlock = selectedChannel?.audioBlocks.find(block => block.id === selectedBlockId) || null;

  useEffect(() => {
    if (audioContextStarted) {
      if (!masterVolumeNodeRef.current) {
        masterVolumeNodeRef.current = new Tone.Volume(Tone.gainToDb(masterVolume)).toDestination();
      }
    }
  }, [audioContextStarted, masterVolume]); 

  useEffect(() => {
    if (masterVolumeNodeRef.current && audioContextStarted) {
      masterVolumeNodeRef.current.volume.rampTo(Tone.gainToDb(masterVolume), 0.05);
    }
  }, [masterVolume, audioContextStarted]);


  const handleMasterVolumeChange = useCallback((newVolume: number) => {
    setMasterVolume(Math.max(0, Math.min(1, newVolume))); 
  }, []);

  const recalculateChannelBlockStartTimes = useCallback((blocks: AudioBlock[]): AudioBlock[] => {
    let cumulativeTime = 0;
    return blocks.map(block => {
      const newStartTime = cumulativeTime;
      cumulativeTime += block.duration;
      return { ...block, startTime: newStartTime };
    });
  }, []);

  const handleAddChannel = useCallback(() => {
    const newChannelId = crypto.randomUUID();
    const newChannel: Channel = {
      id: newChannelId,
      name: `Channel ${channels.length + 1}`,
      volume: 0.75,
      isMuted: false,
      audioBlocks: [],
    };
    setChannels(prev => [...prev, newChannel]);
    setSelectedChannelId(newChannelId);
    toast({ title: "Channel Added", description: `New ${newChannel.name} created.` });
  }, [channels.length, toast]);

  const handleSelectChannel = useCallback((channelId: string) => {
    setSelectedChannelId(channelId);
    setSelectedBlockId(null); 
  }, []);
  
  const handleUpdateChannel = useCallback((channelId: string, updates: Partial<Pick<Channel, 'name' | 'volume' | 'isMuted'>>) => {
    setChannels(prevChannels =>
      prevChannels.map(ch =>
        ch.id === channelId ? { ...ch, ...updates } : ch
      )
    );
    const channelName = channels.find(c=>c.id===channelId)?.name || 'Channel';
    if (updates.volume !== undefined && !isInitialMount.current.masterVolume) { 
        toast({ title: "Channel Volume Changed", description: `${channelName} volume to ${Math.round(updates.volume * 100)}%` });
    }
    if (updates.isMuted !== undefined) {
        toast({ title: `Channel ${updates.isMuted ? "Muted" : "Unmuted"}`, description: `${channelName} is now ${updates.isMuted ? "muted" : "unmuted"}.` });
    }
  }, [toast, channels]);


  const handleAddBlock = useCallback(() => {
    if (!selectedChannelId) {
      toast({ title: "No Channel Selected", description: "Please select a channel first.", variant: "destructive" });
      return;
    }
    const newBlockId = crypto.randomUUID();
    const initialDuration = 2;
    const adsrDefaults = calculateADSRDefaults(initialDuration);
    
    let newBlock: AudibleAudioBlock = {
      id: newBlockId, waveform: 'sine', frequency: 100, duration: initialDuration, startTime: 0, isSilent: false, ...adsrDefaults,
    };
    newBlock = adjustADSR(newBlock); 

    setChannels(prevChannels => prevChannels.map(ch => {
      if (ch.id === selectedChannelId) {
        const updatedBlocks = [...ch.audioBlocks, newBlock];
        return { ...ch, audioBlocks: recalculateChannelBlockStartTimes(updatedBlocks) };
      }
      return ch;
    }));
    setSelectedBlockId(newBlockId);
    toast({ title: "Audio Block Added", description: `Block added to ${selectedChannel?.name}.` });
  }, [selectedChannelId, selectedChannel?.name, recalculateChannelBlockStartTimes, toast]);

  const handleAddSilenceBlock = useCallback(() => {
    if (!selectedChannelId) {
      toast({ title: "No Channel Selected", description: "Please select a channel first.", variant: "destructive" });
      return;
    }
    const newBlockId = crypto.randomUUID();
    const newBlock: SilentAudioBlock = { id: newBlockId, duration: 1, startTime: 0, isSilent: true };

    setChannels(prevChannels => prevChannels.map(ch => {
      if (ch.id === selectedChannelId) {
        const updatedBlocks = [...ch.audioBlocks, newBlock];
        return { ...ch, audioBlocks: recalculateChannelBlockStartTimes(updatedBlocks) };
      }
      return ch;
    }));
    setSelectedBlockId(newBlockId);
    toast({ title: "Silence Block Added", description: `Silence added to ${selectedChannel?.name}.` });
  }, [selectedChannelId, selectedChannel?.name, recalculateChannelBlockStartTimes, toast]);
  
  const handleSelectBlock = useCallback((channelId: string, blockId: string) => {
    setSelectedChannelId(channelId); 
    setSelectedBlockId(blockId);
  }, []);

  const handleUpdateBlock = useCallback((updatedBlockData: AudioBlock) => {
    if (!selectedChannelId || !selectedBlockId) return;

    setChannels(prevChannels => prevChannels.map(ch => {
      if (ch.id === selectedChannelId) {
        const updatedBlocks = ch.audioBlocks.map(b => {
          if (b.id === updatedBlockData.id) {
            if (!updatedBlockData.isSilent && !b.isSilent) { 
              let newAudible = { ...updatedBlockData } as AudibleAudioBlock;
              const oldAudible = b as AudibleAudioBlock;
              
              if (newAudible.duration !== oldAudible.duration && oldAudible.duration > 0) {
                const durationRatio = newAudible.duration / oldAudible.duration;
                if (newAudible.attack === oldAudible.attack) newAudible.attack = oldAudible.attack * durationRatio;
                if (newAudible.decay === oldAudible.decay) newAudible.decay = oldAudible.decay * durationRatio;
                if (newAudible.release === oldAudible.release) newAudible.release = oldAudible.release * durationRatio;
              }
              return adjustADSR(newAudible);
            }
            return updatedBlockData; 
          }
          return b;
        });
        return { ...ch, audioBlocks: recalculateChannelBlockStartTimes(updatedBlocks) };
      }
      return ch;
    }));
  }, [selectedChannelId, selectedBlockId, recalculateChannelBlockStartTimes]);

  const handleDeleteBlock = useCallback((blockIdToDelete: string) => {
    if (!selectedChannelId) return;
    setChannels(prevChannels => prevChannels.map(ch => {
      if (ch.id === selectedChannelId) {
        const filteredBlocks = ch.audioBlocks.filter(b => b.id !== blockIdToDelete);
        return { ...ch, audioBlocks: recalculateChannelBlockStartTimes(filteredBlocks) };
      }
      return ch;
    }));
    if (selectedBlockId === blockIdToDelete) {
        setSelectedBlockId(null); 
    }
    toast({ title: "Block Deleted", description: `Block removed from ${selectedChannel?.name}.`, variant: "destructive" });
  }, [selectedChannelId, selectedBlockId, selectedChannel?.name, recalculateChannelBlockStartTimes, toast]);

  useEffect(() => { if (!isInitialMount.current.looping) { if (toast && typeof isLooping === 'boolean') { toast({ title: isLooping ? "Loop Enabled" : "Loop Disabled", description: isLooping ? "Playback will now loop." : "Playback will not loop." }); } } else { isInitialMount.current.looping = false; } }, [isLooping, toast]);
  useEffect(() => { if (!isInitialMount.current.outputMode) { if (toast) { toast({ title: "Output Mode Changed", description: `Switched to ${outputMode === 'mixed' ? 'Mixed' : 'Independent'} Output.` }); } } else { isInitialMount.current.outputMode = false; } }, [outputMode, toast]);
  useEffect(() => { if (!isInitialMount.current.masterVolume && masterVolumeNodeRef.current) { if (toast) { toast({ title: "Master Volume Changed", description: `Volume set to ${Math.round(masterVolume * 100)}%` }); } } else { isInitialMount.current.masterVolume = false; } }, [masterVolume, toast]);


  const handleToggleLoop = useCallback(() => {
    setIsLooping(prev => {
      const newLoopState = !prev;
      const longestChannelDuration = Math.max(0, ...channels.map(ch => ch.audioBlocks.reduce((sum, b) => sum + b.duration, 0)));
      if (isPlaying && longestChannelDuration > 0) {
        if (newLoopState) {
          Tone.Transport.loop = true;
          Tone.Transport.loopStart = 0;
          Tone.Transport.loopEnd = longestChannelDuration;
        } else {
          Tone.Transport.loop = false;
        }
      }
      return newLoopState;
    });
  }, [isPlaying, channels]);

  const handleToggleOutputMode = useCallback(() => {
    setOutputMode(prevMode => (prevMode === 'mixed' ? 'independent' : 'mixed'));
  }, []);

  const handlePlay = useCallback(async () => {
    if (!audioContextStarted) await startAudioContext();
    if (Tone.context.state !== 'running') {
      try {
        await Tone.start();
      } catch (e) {
        toast({ title: "Audio Error", description: `Could not start audio: ${e instanceof Error ? e.message : String(e)}`, variant: "destructive" });
        return;
      }
    }
    
    if (!masterVolumeNodeRef.current) {
      console.log("Debug: Master volume node was not ready during play attempt.");
      toast({ title: "Audio Error", description: "Master volume node not ready. Please try again.", variant: "destructive"}); 
      return; 
    }

    if (channels.every(ch => ch.audioBlocks.length === 0)) {
      toast({ title: "Cannot Play", description: "Add some audio blocks to at least one channel!", variant: "destructive" });
      return;
    }
    
    const hasAudibleContent = channels.some(ch => 
        !ch.isMuted && ch.audioBlocks.some(b => !b.isSilent && b.duration > 0)
    );

    if (!hasAudibleContent) {
        toast({ title: "Nothing to Play", description: "No audible blocks with duration found in active channels.", variant: "default" });
        setIsPlaying(false);
        setCurrentPlayTime(0);
        Tone.Transport.position = 0;
        return;
    }

    Tone.Transport.stop(); 
    Tone.Transport.cancel(); 
    Tone.Transport.position = 0; 

    activeAudioNodesMap.current.forEach(channelNodes => {
      channelNodes.forEach(nodes => {
        nodes.osc.dispose();
        nodes.adsrGain.dispose();
        nodes.channelVolumeNode.dispose();
      });
    });
    activeAudioNodesMap.current.clear();

    channels.forEach(channel => {
      if (channel.isMuted || channel.audioBlocks.length === 0) return;

      const channelSpecificNodes: ActiveChannelAudioNodes[] = [];
      const channelVolDb = channel.volume > 0 ? Tone.gainToDb(channel.volume) : -Infinity;
      const channelVolumeNode = new Tone.Volume(channelVolDb).connect(masterVolumeNodeRef.current!);
      
      channel.audioBlocks.forEach(block => {
        if (block.isSilent) return;

        const audibleBlock = block as AudibleAudioBlock;
        if (audibleBlock.duration <= 0) return; // Skip zero-duration audible blocks

        const osc = new Tone.Oscillator({
          type: audibleBlock.waveform, frequency: audibleBlock.frequency, volume: -6, 
        });
        
        const adsrGain = new Tone.Gain(0).connect(channelVolumeNode);
        osc.connect(adsrGain);
        
        osc.start(audibleBlock.startTime);
        osc.stop(audibleBlock.startTime + audibleBlock.duration + 0.1); 

        channelSpecificNodes.push({ osc, adsrGain, channelVolumeNode });

        const { startTime, duration, attack, decay, sustainLevel, release } = audibleBlock;
        const attackEndTime = startTime + attack;
        const decayEndTime = attackEndTime + decay;
        const releaseStartTime = startTime + duration - release;
        const effectiveEndTime = startTime + duration;

        adsrGain.gain.setValueAtTime(0, startTime);
        adsrGain.gain.linearRampToValueAtTime(1, attackEndTime); 
        adsrGain.gain.linearRampToValueAtTime(sustainLevel, decayEndTime); 

        if (releaseStartTime > decayEndTime) { 
          adsrGain.gain.setValueAtTime(sustainLevel, releaseStartTime); 
        }
        
        adsrGain.gain.linearRampToValueAtTime(0, effectiveEndTime); 
      });
      if (channelSpecificNodes.length > 0) {
        activeAudioNodesMap.current.set(channel.id, channelSpecificNodes);
      }
    });

    const longestChannelDuration = Math.max(0, ...channels.map(ch => ch.audioBlocks.reduce((sum, b) => sum + b.duration, 0)));

    if (longestChannelDuration === 0 && !isLooping) {
        setIsPlaying(false);
        setCurrentPlayTime(0);
        Tone.Transport.position = 0;
        return; 
    }
    
    if (isLooping && longestChannelDuration > 0) {
      Tone.Transport.loop = true;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = longestChannelDuration;
    } else {
      Tone.Transport.loop = false;
      if (longestChannelDuration > 0) { // Schedule stop only if there's something to play
        Tone.Transport.scheduleOnce(() => {
          setIsPlaying(false);
          setCurrentPlayTime(0); 
          Tone.Transport.position = 0; 
        }, longestChannelDuration + 0.2); 
      }
    }

    Tone.Transport.start("+0.1"); 
    setIsPlaying(true);
  }, [audioContextStarted, startAudioContext, toast, isLooping, masterVolume, channels, outputMode, recalculateChannelBlockStartTimes, currentPlayTime]);


  const handleStop = useCallback(() => {
    Tone.Transport.stop();
    Tone.Transport.cancel(); 
    Tone.Transport.loop = false; 
    activeAudioNodesMap.current.forEach(channelNodes => {
      channelNodes.forEach(nodes => {
        nodes.osc.dispose();
        nodes.adsrGain.dispose();
        nodes.channelVolumeNode.dispose(); 
      });
    });
    activeAudioNodesMap.current.clear();
    setIsPlaying(false);
    setCurrentPlayTime(0); 
    Tone.Transport.position = 0; 
  }, []);

  useEffect(() => {
    if (isPlaying) {
      const update = () => {
        setCurrentPlayTime(Tone.Transport.seconds);
        animationFrameId.current = requestAnimationFrame(update);
      };
      animationFrameId.current = requestAnimationFrame(update);
    } else {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      // setCurrentPlayTime(Tone.Transport.seconds); // Keep current time on stop, don't reset to 0 here
    }
    return () => { if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); };
  }, [isPlaying]);

  useEffect(() => { 
    return () => {
      handleStop(); 
      if (masterVolumeNodeRef.current) {
        masterVolumeNodeRef.current.dispose();
        masterVolumeNodeRef.current = null;
      }
    };
  }, [handleStop]);
  
  const totalTimelineWidth = Math.max(300, ...channels.map(ch => ch.audioBlocks.reduce((sum, block) => sum + block.duration * PIXELS_PER_SECOND, 0) + PIXELS_PER_SECOND));


  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-[hsl(var(--background)/0.5)] via-[hsl(var(--muted)/0.5)] to-[hsl(var(--background)/0.5)] p-0 sm:p-4 md:p-8">
      <Card className="flex-grow flex flex-col shadow-2xl overflow-hidden bg-card rounded-none sm:rounded-xl h-full">
        <header className="p-4 sm:p-6 border-b flex items-center justify-between sticky top-0 bg-card/80 backdrop-blur-sm z-10">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gradient-primary-accent-secondary flex items-center">
              <ListMusicIcon className="mr-3 h-8 w-8" />
              MusicSync
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-1">Craft your unique sound sequences, channel by channel.</p>
          </div>
        </header>

        <div className="p-4 sm:p-6 flex-grow flex flex-col space-y-4 sm:space-y-6 overflow-hidden">
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
            canPlay={channels.some(ch => ch.audioBlocks.length > 0)}
            disableAddBlock={!selectedChannelId}
          />

          <div className="flex flex-col md:flex-row flex-grow space-y-4 md:space-y-0 md:space-x-6 overflow-hidden">
            <div className="flex-grow md:w-2/3 flex flex-col space-y-2 overflow-y-auto pr-2 relative">
              {channels.map(channel => (
                <ChannelViewComponent
                  key={channel.id}
                  channel={channel}
                  isSelected={channel.id === selectedChannelId}
                  selectedBlockId={channel.id === selectedChannelId ? selectedBlockId : null}
                  onSelectChannel={handleSelectChannel}
                  onUpdateChannel={handleUpdateChannel}
                  onSelectBlock={handleSelectBlock}
                  pixelsPerSecond={PIXELS_PER_SECOND}
                  currentPlayTime={currentPlayTime} 
                  isPlaying={isPlaying} 
                />
              ))}
              <Button onClick={handleAddChannel} variant="outline" className="mt-4 w-full">
                <PlusIcon className="mr-2 h-5 w-5" /> Add Channel
              </Button>
              {channels.length > 0 && (
                <PlaybackIndicatorComponent
                  position={currentPlayTime * PIXELS_PER_SECOND}
                  isVisible={isPlaying}
                  containerHeight={channels.reduce((acc, _ch, idx) => acc + (idx > 0 ? 8 : 0) + 128, 0)} 
                />
              )}
            </div>
            
            <PropertyPanelComponent
              className="w-full md:w-1/3 md:max-w-sm"
              selectedBlock={selectedBlock} 
              onUpdateBlock={handleUpdateBlock}
              onDeleteBlock={handleDeleteBlock}
              pixelsPerSecond={PIXELS_PER_SECOND}
              key={selectedBlock?.id} 
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

    

    