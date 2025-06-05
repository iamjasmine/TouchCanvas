
"use client";

import type React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import type { AudioBlock, AudibleAudioBlock, SilentAudioBlock, Channel, WaveformType, TemperatureBlock, AnyBlock, TemperatureType, TemperatureIntensity } from '@/types';
import { useToneContext } from '@/components/providers/tone-provider';
import { ControlsComponent } from '@/components/controls/controls-component';
import { PropertyPanelComponent } from '@/components/property-panel/property-panel.tsx';
import { ChannelViewComponent } from '@/components/channel/channel-view';
import { PlaybackIndicatorComponent } from '@/components/timeline/playback-indicator-component';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PlusIcon, ListMusicIcon, ThermometerIcon } from 'lucide-react';

const PIXELS_PER_SECOND = 60;
const MIN_SUSTAIN_TIME = 0.05; // Minimum duration for the sustain phase
const PLAYBACK_START_DELAY = 0.1; // Small delay before starting playback with absolute time
const CHANNEL_ROW_HEIGHT_PX = 128;

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

  duration = Number(duration) || 0;
  attack = Number(attack) || 0;
  decay = Number(decay) || 0;
  release = Number(release) || 0;
  sustainLevel = Number(sustainLevel) || 0;


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
    duration: fixNum(duration),
    attack: fixNum(attack),
    decay: fixNum(decay),
    sustainLevel: fixNum(sustainLevel, 2),
    release: fixNum(release),
  };
};

type ActiveChannelAudioNodes = {
  osc: Tone.Oscillator;
  adsrGain: Tone.Gain;
  channelVolumeNode: Tone.Volume; // Reference to the channel's volume node
};

export default function MusicSyncPage() {
  const { audioContextStarted, startAudioContext: activateAudio } = useToneContext();
  const { toast } = useToast();

  const initialChannel: Channel = {
    id: crypto.randomUUID(),
    name: 'Audio Channel 1',
    channelType: 'audio',
    volume: 0.75,
    isMuted: false,
    audioBlocks: [],
    temperatureBlocks: [],
  };
  const [channels, setChannels] = useState<Channel[]>([initialChannel]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(initialChannel.id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isActivatingAudio, setIsActivatingAudio] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [outputMode, setOutputMode] = useState<'mixed' | 'independent'>('mixed');
  const [masterVolume, setMasterVolume] = useState<number>(0.75);

  const activeAudioNodesMap = useRef<Map<string, ActiveChannelAudioNodes[]>>(new Map());
  const animationFrameId = useRef<number | null>(null);
  const masterVolumeNodeRef = useRef<Tone.Volume | null>(null);
  const playbackStartTimeRef = useRef<number | null>(null);
  const loopTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  const isInitialMount = useRef({ looping: true, outputMode: true, masterVolume: true, channelVolume: true });

  const selectedChannel = channels.find(ch => ch.id === selectedChannelId) || null;

  const selectedBlock = useMemo(() => {
    if (!selectedChannel || !selectedBlockId) return null;
    if (selectedChannel.channelType === 'audio') {
      return selectedChannel.audioBlocks.find(block => block.id === selectedBlockId) || null;
    } else if (selectedChannel.channelType === 'thermal') {
      return selectedChannel.temperatureBlocks.find(block => block.id === selectedBlockId) || null;
    }
    return null;
  }, [selectedChannel, selectedBlockId]);


  useEffect(() => {
    if (audioContextStarted) {
      if (!masterVolumeNodeRef.current || masterVolumeNodeRef.current.disposed) {
        console.log('[MusicSyncPage] useEffect (audioContextStarted): Creating MasterVolumeNode.');
        masterVolumeNodeRef.current = new Tone.Volume(Tone.gainToDb(masterVolume)).toDestination();
        console.log('[MusicSyncPage] MasterVolumeNode created and connected to destination. Initial volume (dB):', masterVolumeNodeRef.current.volume.value, 'Node details:', masterVolumeNodeRef.current);
      } else {
        console.log('[MusicSyncPage] useEffect (audioContextStarted): MasterVolumeNode already exists. Ramping volume.');
        masterVolumeNodeRef.current.volume.rampTo(Tone.gainToDb(masterVolume), 0.05);
      }
    }
  }, [audioContextStarted, masterVolume]);

  useEffect(() => {
    if (masterVolumeNodeRef.current && audioContextStarted && !isInitialMount.current.masterVolume) {
       console.log('[MusicSyncPage] useEffect (masterVolume, audioContextStarted): Ramping master volume to', masterVolume);
      masterVolumeNodeRef.current.volume.rampTo(Tone.gainToDb(masterVolume), 0.05);
    }
     if (isInitialMount.current.masterVolume) {
        isInitialMount.current.masterVolume = false;
    }
  }, [masterVolume, audioContextStarted]);


  const ensureAudioIsActive = useCallback(async (): Promise<boolean> => {
    console.log('[MusicSyncPage] ensureAudioIsActive: Called. audioContextStarted (app state):', audioContextStarted, 'Tone.context.state:', Tone.context.state);
    if (Tone.context.state === 'running' && audioContextStarted) {
      console.log('[MusicSyncPage] ensureAudioIsActive: Audio already active and app state reflects this.');
      return true;
    }

    setIsActivatingAudio(true);
    console.log('[MusicSyncPage] ensureAudioIsActive: Set isActivatingAudio to true. Attempting to activate audio...');
    try {
      await activateAudio();
      if (Tone.context.state === 'running') {
        console.log('[MusicSyncPage] ensureAudioIsActive: activateAudio() successful. Tone.context.state:', Tone.context.state);
        return true;
      } else {
        console.warn('[MusicSyncPage] ensureAudioIsActive: activateAudio() did not result in "running" state. Current state:', Tone.context.state);
        console.log('[MusicSyncPage] ensureAudioIsActive: Making a direct Tone.start() attempt.');
        await Tone.start();
        if (Tone.context.state === 'running') {
            console.log('[MusicSyncPage] ensureAudioIsActive: Direct Tone.start() successful. Tone.context.state:', Tone.context.state);
            if (!audioContextStarted) activateAudio(); // Ensure app state is synced
            return true;
        } else {
            console.error('[MusicSyncPage] ensureAudioIsActive: Direct Tone.start() also failed. Current state:', Tone.context.state);
            toast({ title: "Audio Activation Failed", description: "Could not enable audio. Please interact with the page again or check browser permissions.", variant: "destructive" });
            return false;
        }
      }
    } catch (error) {
      console.error('[MusicSyncPage] ensureAudioIsActive: Error during audio activation:', error);
      toast({ title: "Audio Initialization Error", description: String(error), variant: "destructive" });
      return false;
    } finally {
      setIsActivatingAudio(false);
      console.log('[MusicSyncPage] ensureAudioIsActive: Set isActivatingAudio to false.');
    }
  }, [activateAudio, audioContextStarted, toast]);

  const testAudio = async () => {
    try {
      if (!(await ensureAudioIsActive())) {
        console.error('[MusicSyncPage] testAudio: Audio context could not be started/ensured. Aborting test.');
        toast({ title: "Audio Test Failed", description: "Audio context could not be started.", variant: "destructive" });
        return;
      }
      console.log('[MusicSyncPage] testAudio: Audio context state after ensureAudioIsActive:', Tone.context.state);

      const synth = new Tone.Synth().toDestination();
      console.log('[MusicSyncPage] testAudio: Synth created and connected to destination.');
      synth.triggerAttackRelease("C4", "8n", Tone.now());
      console.log('[MusicSyncPage] testAudio: Test note C4 triggered.');
      toast({ title: "Audio Test", description: "Playing C4 note. Did you hear it?" });
    } catch (error) {
      console.error('[MusicSyncPage] testAudio: Audio test failed:', error);
      toast({ title: "Audio Test Failed", description: String(error), variant: "destructive" });
    }
  };

  const handleMasterVolumeChange = useCallback((newVolume: number) => {
    setMasterVolume(Math.max(0, Math.min(1, newVolume)));
  }, []);

  const recalculateChannelBlockStartTimes = useCallback((blocks: AudioBlock[]): AudioBlock[] => {
    let cumulativeTime = 0;
    return blocks.map(block => {
      const currentDuration = Number(block.duration);
      if (isNaN(currentDuration) || currentDuration < 0) {
        console.warn(`[MusicSyncPage] recalculateChannelBlockStartTimes: Invalid duration (${block.duration}) for block ${block.id}. Treating as 0.`);
        return { ...block, startTime: cumulativeTime, duration: 0 };
      }
      const newStartTime = cumulativeTime;
      cumulativeTime += currentDuration;
      return { ...block, startTime: newStartTime };
    });
  }, []);

  const recalculateTemperatureBlockStartTimes = useCallback((blocks: TemperatureBlock[]): TemperatureBlock[] => {
    let cumulativeTime = 0;
    return blocks.map(block => {
      const currentDuration = Number(block.duration);
      if (isNaN(currentDuration) || currentDuration < 0) {
        console.warn(`[MusicSyncPage] recalculateTemperatureBlockStartTimes: Invalid duration (${block.duration}) for block ${block.id}. Treating as 0.`);
        return { ...block, startTime: cumulativeTime, duration: 0, blockRenderType: 'temperature' };
      }
      const newStartTime = cumulativeTime;
      cumulativeTime += currentDuration;
      return { ...block, startTime: newStartTime, blockRenderType: 'temperature' };
    });
  }, []);


  const handleAddAudioChannel = useCallback(async () => {
    if (!(await ensureAudioIsActive())) return;

    const newChannelId = crypto.randomUUID();
    const newChannel: Channel = {
      id: newChannelId,
      name: `Audio Channel ${channels.filter(ch => ch.channelType === 'audio').length + 1}`,
      channelType: 'audio',
      volume: 0.75,
      isMuted: false,
      audioBlocks: [],
      temperatureBlocks: [],
    };
    setChannels(prev => [...prev, newChannel]);
    setSelectedChannelId(newChannelId);
    setSelectedBlockId(null);
    toast({ title: "Audio Channel Added", description: `New ${newChannel.name} created.` });
  }, [channels, toast, ensureAudioIsActive]);

  const handleAddThermalChannel = useCallback(async () => {
    if (!(await ensureAudioIsActive())) return;

    const newChannelId = crypto.randomUUID();
    const newChannel: Channel = {
      id: newChannelId,
      name: `Thermal Channel ${channels.filter(ch => ch.channelType === 'thermal').length + 1}`,
      channelType: 'thermal',
      volume: 0,
      isMuted: true,
      audioBlocks: [],
      temperatureBlocks: [],
    };
    setChannels(prev => [...prev, newChannel]);
    setSelectedChannelId(newChannelId);
    setSelectedBlockId(null);
    toast({ title: "Thermal Channel Added", description: `New ${newChannel.name} created.` });
  }, [channels, toast, ensureAudioIsActive]);


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
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;

    const channelName = channel.name || 'Channel';
    if (updates.volume !== undefined && !isInitialMount.current.channelVolume && channel.channelType === 'audio') {
        toast({ title: "Channel Volume Changed", description: `${channelName} volume to ${Math.round(updates.volume * 100)}%` });
    } else if (updates.volume !== undefined && isInitialMount.current.channelVolume) {
        isInitialMount.current.channelVolume = false;
    }

    if (updates.isMuted !== undefined && channel.channelType === 'audio') {
        toast({ title: `Channel ${updates.isMuted ? "Muted" : "Unmuted"}`, description: `${channelName} is now ${updates.isMuted ? "muted" : "unmuted"}.` });
    }
  }, [toast, channels]);


  const handleAddBlock = useCallback(async () => {
    if (!(await ensureAudioIsActive())) return;
    if (!selectedChannelId || selectedChannel?.channelType !== 'audio') {
      toast({ title: "Cannot Add Audio Block", description: "Please select an audio channel first.", variant: "destructive" });
      return;
    }
    const newBlockId = crypto.randomUUID();
    const initialDuration = 2;
    const adsrDefaults = calculateADSRDefaults(initialDuration);

    let newBlock: AudibleAudioBlock = {
      id: newBlockId, waveform: 'sine', frequency: 220, duration: initialDuration, startTime: 0, isSilent: false, ...adsrDefaults,
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
  }, [selectedChannelId, selectedChannel, recalculateChannelBlockStartTimes, toast, ensureAudioIsActive]);

  const handleAddSilenceBlock = useCallback(async () => {
    if (!(await ensureAudioIsActive())) return;
    if (!selectedChannelId || selectedChannel?.channelType !== 'audio') {
      toast({ title: "Cannot Add Silence Block", description: "Please select an audio channel first.", variant: "destructive" });
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
  }, [selectedChannelId, selectedChannel, recalculateChannelBlockStartTimes, toast, ensureAudioIsActive]);

  const handleAddTemperatureBlock = useCallback(async () => {
    if (!(await ensureAudioIsActive())) return;
    if (!selectedChannelId || selectedChannel?.channelType !== 'thermal') {
      toast({ title: "Cannot Add Temperature Block", description: "Please select a thermal channel first.", variant: "destructive" });
      return;
    }
    const newBlockId = crypto.randomUUID();
    const newBlock: TemperatureBlock = {
      id: newBlockId,
      type: 'cool',
      intensity: 'low',
      duration: 2,
      startTime: 0,
      blockRenderType: 'temperature',
    };

    setChannels(prevChannels => prevChannels.map(ch => {
      if (ch.id === selectedChannelId) {
        const updatedBlocks = [...ch.temperatureBlocks, newBlock];
        return { ...ch, temperatureBlocks: recalculateTemperatureBlockStartTimes(updatedBlocks) };
      }
      return ch;
    }));
    setSelectedBlockId(newBlockId);
    toast({ title: "Temperature Block Added", description: `Block added to ${selectedChannel?.name}.` });
  }, [selectedChannelId, selectedChannel, recalculateTemperatureBlockStartTimes, toast, ensureAudioIsActive]);


  const handleSelectBlock = useCallback((channelId: string, blockId: string) => {
    setSelectedChannelId(channelId);
    setSelectedBlockId(blockId);
  }, []);

  const handleUpdateBlock = useCallback((updatedBlockData: AnyBlock) => {
    if (!selectedChannelId || !selectedBlockId) return;

    setChannels(prevChannels => prevChannels.map(ch => {
      if (ch.id === selectedChannelId) {
        if (ch.channelType === 'audio' && (updatedBlockData.blockRenderType === 'audio' || 'waveform' in updatedBlockData)) {
          const updatedBlocks = ch.audioBlocks.map(b => {
            if (b.id === updatedBlockData.id) {
              const newDuration = Number(updatedBlockData.duration);
              if (isNaN(newDuration) || newDuration < 0) {
                updatedBlockData.duration = b.duration;
              }
              if (!updatedBlockData.isSilent && !b.isSilent) {
                let newAudible = { ...updatedBlockData } as AudibleAudioBlock;
                const oldAudible = b as AudibleAudioBlock;
                if (newAudible.duration !== oldAudible.duration && oldAudible.duration > 0 && newAudible.duration > 0) {
                  const durationRatio = newAudible.duration / oldAudible.duration;
                  if (newAudible.attack === oldAudible.attack) newAudible.attack = oldAudible.attack * durationRatio;
                  if (newAudible.decay === oldAudible.decay) newAudible.decay = oldAudible.decay * durationRatio;
                  if (newAudible.release === oldAudible.release) newAudible.release = oldAudible.release * durationRatio;
                }
                return adjustADSR(newAudible);
              }
              return updatedBlockData as AudioBlock;
            }
            return b;
          });
          return { ...ch, audioBlocks: recalculateChannelBlockStartTimes(updatedBlocks) };
        } else if (ch.channelType === 'thermal' && (updatedBlockData.blockRenderType === 'temperature' || 'type' in updatedBlockData)) {
           const updatedTempBlocks = ch.temperatureBlocks.map(b =>
            b.id === updatedBlockData.id ? updatedBlockData as TemperatureBlock : b
          );
          return { ...ch, temperatureBlocks: recalculateTemperatureBlockStartTimes(updatedTempBlocks) };
        }
      }
      return ch;
    }));
  }, [selectedChannelId, selectedBlockId, recalculateChannelBlockStartTimes, recalculateTemperatureBlockStartTimes]);


  const handleDeleteBlock = useCallback((blockIdToDelete: string) => {
    if (!selectedChannelId || !selectedChannel) return;

    setChannels(prevChannels => prevChannels.map(ch => {
      if (ch.id === selectedChannelId) {
        if (ch.channelType === 'audio') {
          const filteredBlocks = ch.audioBlocks.filter(b => b.id !== blockIdToDelete);
          return { ...ch, audioBlocks: recalculateChannelBlockStartTimes(filteredBlocks) };
        } else if (ch.channelType === 'thermal') {
          const filteredBlocks = ch.temperatureBlocks.filter(b => b.id !== blockIdToDelete);
          return { ...ch, temperatureBlocks: recalculateTemperatureBlockStartTimes(filteredBlocks) };
        }
      }
      return ch;
    }));

    if (selectedBlockId === blockIdToDelete) {
        setSelectedBlockId(null);
    }
    toast({ title: "Block Deleted", description: `Block removed from ${selectedChannel?.name}.`, variant: "destructive" });
  }, [selectedChannelId, selectedBlockId, selectedChannel, recalculateChannelBlockStartTimes, recalculateTemperatureBlockStartTimes, toast]);


  const handleReorderBlock = useCallback((channelId: string, draggedBlockId: string, targetIndex: number) => {
    setChannels(prevChannels => {
      const channelIndex = prevChannels.findIndex(ch => ch.id === channelId);
      if (channelIndex === -1) {
        console.warn(`[MusicSyncPage] handleReorderBlock: Channel ${channelId} not found.`);
        return prevChannels;
      }
      const channelToUpdate = { ...prevChannels[channelIndex] };

      if (channelToUpdate.channelType === 'audio') {
          const currentBlocks = [...channelToUpdate.audioBlocks];
          const draggedBlockOriginalIndex = currentBlocks.findIndex(b => b.id === draggedBlockId);
          if (draggedBlockOriginalIndex === -1) return prevChannels;
          const [draggedBlock] = currentBlocks.splice(draggedBlockOriginalIndex, 1);
          currentBlocks.splice(targetIndex, 0, draggedBlock);
          channelToUpdate.audioBlocks = recalculateChannelBlockStartTimes(currentBlocks);
      } else if (channelToUpdate.channelType === 'thermal') {
          const currentBlocks = [...channelToUpdate.temperatureBlocks];
          const draggedBlockOriginalIndex = currentBlocks.findIndex(b => b.id === draggedBlockId);
          if (draggedBlockOriginalIndex === -1) return prevChannels;
          const [draggedBlock] = currentBlocks.splice(draggedBlockOriginalIndex, 1);
          currentBlocks.splice(targetIndex, 0, draggedBlock);
          channelToUpdate.temperatureBlocks = recalculateTemperatureBlockStartTimes(currentBlocks);
      }

      const newChannels = [...prevChannels];
      newChannels[channelIndex] = channelToUpdate;
      return newChannels;
    });
  }, [recalculateChannelBlockStartTimes, recalculateTemperatureBlockStartTimes]);


  const handleToggleLoop = useCallback(() => {
    setIsLooping(prev => !prev);
  }, []);

 useEffect(() => {
    if (!isInitialMount.current.looping) {
      toast({
        title: isLooping ? "Loop Enabled" : "Loop Disabled",
        description: isLooping ? "Playback will now loop." : "Playback will not loop."
      });
    }
    if (isInitialMount.current.looping) { isInitialMount.current.looping = false; }
  }, [isLooping, toast]);


  useEffect(() => {
    if (!isInitialMount.current.outputMode) {
      if (toast) {
        toast({ title: "Output Mode Changed", description: `Switched to ${outputMode === 'mixed' ? 'Mixed' : 'Independent'} Output.` });
      }
    } else {
      isInitialMount.current.outputMode = false;
    }
  }, [outputMode, toast]);


  const handleToggleOutputMode = useCallback(() => {
    setOutputMode(prevMode => (prevMode === 'mixed' ? 'independent' : 'mixed'));
  }, []);

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const isLoopingRef = useRef(isLooping);
  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  const handleStop = useCallback(() => {
    console.log('[MusicSyncPage] handleStop: Called.');
    if (loopTimeoutIdRef.current) {
      clearTimeout(loopTimeoutIdRef.current);
      loopTimeoutIdRef.current = null;
      console.log('[MusicSyncPage] handleStop: Cleared loop timeout.');
    }

    const uniqueChannelVolumeNodes = new Set<Tone.Volume>();

    activeAudioNodesMap.current.forEach((channelNodes, channelId) => {
      channelNodes.forEach(nodes => {
        nodes.adsrGain.gain.cancelScheduledValues(Tone.now());
        nodes.osc.stop(Tone.now()); // Stop immediately
        nodes.osc.dispose();
        nodes.adsrGain.dispose();
        if (nodes.channelVolumeNode) {
          uniqueChannelVolumeNodes.add(nodes.channelVolumeNode);
        }
      });
      console.log(`[MusicSyncPage] handleStop: Disposed osc/gain nodes for channel ID ${channelId}`);
    });

    uniqueChannelVolumeNodes.forEach(node => {
      if (node && !node.disposed) {
        console.log(`[MusicSyncPage] handleStop: Disposing unique ChannelVolumeNode:`, node);
        node.dispose();
      }
    });

    activeAudioNodesMap.current.clear();

    setIsPlaying(false);
    setCurrentPlayTime(0);
    playbackStartTimeRef.current = null;
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    console.log('[MusicSyncPage] handleStop: Playback stopped and state reset.');
  }, []);


  const handlePlay = useCallback(async () => {
    handleStop();
    console.log('[MusicSyncPage] handlePlay: Called. Using ABSOLUTE TIME scheduling.');

    if (!(await ensureAudioIsActive())) {
        console.log('[MusicSyncPage] handlePlay: ensureAudioIsActive returned false. Aborting.');
        return;
    }

    if (!masterVolumeNodeRef.current || masterVolumeNodeRef.current.disposed) {
      console.error("[MusicSyncPage] handlePlay: CRITICAL: MasterVolumeNode is not ready or disposed. Cannot play audio.");
      toast({ title: "Audio Error", description: "Master volume node not ready. Please try again or refresh.", variant: "destructive"});
      return;
    }
    console.log('[MusicSyncPage] handlePlay: MasterVolumeNode is ready. Details:', masterVolumeNodeRef.current);

    setIsPlaying(true);

    const baseAbsoluteTime = Tone.now() + PLAYBACK_START_DELAY;
    console.log(`[MusicSyncPage] handlePlay: Base absolute time for scheduling: ${baseAbsoluteTime}`);
    console.log(`[MusicSyncPage] handlePlay: Number of channels: ${channels.length}. Channels data:`, JSON.parse(JSON.stringify(channels)));

    let maxOverallDuration = 0;

    channels.forEach(channel => {
      if (channel.channelType === 'thermal') {
        // Handle thermal channel playback (not implemented yet, just log)
        let currentChannelDuration = 0;
        channel.temperatureBlocks.forEach(block => {
           const blockDurationNumber = Number(block.duration);
           if (isNaN(blockDurationNumber) || blockDurationNumber <= 0) return;
           currentChannelDuration += blockDurationNumber;
        });
        if (currentChannelDuration > maxOverallDuration) maxOverallDuration = currentChannelDuration;
        console.log(`[MusicSyncPage] handlePlay: Skipping audio synthesis for THERMAL channel ${channel.name}. Total duration: ${currentChannelDuration}s`);
        return;
      }


      if (channel.isMuted || channel.audioBlocks.length === 0) {
        console.log(`[MusicSyncPage] handlePlay: Skipping channel ${channel.name} (ID: ${channel.id}) - not audio, muted, or no audio blocks.`);
        return;
      }
      console.log(`[MusicSyncPage] handlePlay: Processing audio channel ${channel.name} (ID: ${channel.id}). Blocks: ${channel.audioBlocks.length}`);

      const channelSpecificNodes: ActiveChannelAudioNodes[] = [];
      const channelVolDb = (channel.volume > 0.001 && !channel.isMuted) ? Tone.gainToDb(channel.volume) : -Infinity;

      const channelVolumeNode = new Tone.Volume(channelVolDb);
      console.log(`[MusicSyncPage] handlePlay: Channel ${channel.name} (ID: ${channel.id}) VolumeNode created, volume: ${channelVolDb}dB.`);

      if (!masterVolumeNodeRef.current || masterVolumeNodeRef.current.disposed) {
          console.error(`[MusicSyncPage] handlePlay: CRITICAL ERROR for channel ${channel.name} - masterVolumeNodeRef.current is null or disposed before connecting ChannelVolumeNode.`);
          return;
      }
      console.log(`[MusicSyncPage] handlePlay: Connecting ChannelVolumeNode for ${channel.name} to MasterVolumeNode.`);
      channelVolumeNode.connect(masterVolumeNodeRef.current);
      console.log(`[MusicSyncPage] MasterVolumeNode (after channel ${channel.name} connect) outputs: ${masterVolumeNodeRef.current.numberOfOutputs}, inputs: ${masterVolumeNodeRef.current.numberOfInputs}.`);

      let currentChannelAbsoluteTime = baseAbsoluteTime;
      let currentChannelDuration = 0;

      channel.audioBlocks.forEach((block, blockIndex) => {
        const blockDurationNumber = Number(block.duration);
        if (isNaN(blockDurationNumber) || blockDurationNumber <= 0) {
          console.warn(`[MusicSyncPage] handlePlay: Channel ${channel.name}, Block ${blockIndex} (ID: ${block.id}) has invalid or zero duration (${block.duration}). Skipping.`);
          return;
        }

        if (block.isSilent) {
            console.log(`[MusicSyncPage] handlePlay: Channel ${channel.name}, Block ${blockIndex} (ID: ${block.id}) is SILENT. Duration: ${blockDurationNumber}s. Advancing time.`);
            currentChannelAbsoluteTime += blockDurationNumber;
            currentChannelDuration += blockDurationNumber;
            return;
        }

        const audibleBlock = adjustADSR(block as AudibleAudioBlock);
        console.log(`[MusicSyncPage] handlePlay: Channel ${channel.name}, Block ${blockIndex} (ID: ${audibleBlock.id}) PROCESSING. Freq=${audibleBlock.frequency}Hz, Dur=${audibleBlock.duration}s. Scheduled to start at absolute time: ${currentChannelAbsoluteTime.toFixed(3)}`);

        if (audibleBlock.frequency < 40 && audibleBlock.frequency > 0) {
          console.warn(`[MusicSyncPage] handlePlay: Audible block ${audibleBlock.id} in channel ${channel.name} has a very low frequency (${audibleBlock.frequency}Hz). This may be inaudible or primarily felt as vibration.`);
        } else if (audibleBlock.frequency <= 0) {
            console.warn(`[MusicSyncPage] handlePlay: Audible block ${audibleBlock.id} in channel ${channel.name} has zero or negative frequency (${audibleBlock.frequency}Hz). Skipping block.`);
            currentChannelAbsoluteTime += blockDurationNumber;
            currentChannelDuration += blockDurationNumber;
            return;
        }

        const osc = new Tone.Oscillator({ type: audibleBlock.waveform, frequency: audibleBlock.frequency, volume: -6 });
        const adsrGain = new Tone.Gain(0).connect(channelVolumeNode);
        osc.connect(adsrGain);

        const { duration, attack, decay, sustainLevel, release } = audibleBlock;
        const blockAbsStartTime = currentChannelAbsoluteTime;
        const attackAbsEndTime = blockAbsStartTime + attack;
        const decayAbsEndTime = attackAbsEndTime + decay;
        const releaseAbsStartTime = blockAbsStartTime + duration - release;
        const blockAbsEndTime = blockAbsStartTime + duration;

        console.log(`[MusicSyncPage] ADSR for block ${audibleBlock.id}: StartAbs=${blockAbsStartTime.toFixed(3)}, AttackEndsAbs=${attackAbsEndTime.toFixed(3)}, DecayEndsAbs=${decayAbsEndTime.toFixed(3)}, SustainLevel=${sustainLevel.toFixed(2)}, ReleaseStartsAbs=${releaseAbsStartTime.toFixed(3)}, BlockEndsAbs=${blockAbsEndTime.toFixed(3)}`);

        adsrGain.gain.setValueAtTime(0, blockAbsStartTime);
        if (attack > 0) adsrGain.gain.linearRampToValueAtTime(1, attackAbsEndTime);
        else adsrGain.gain.setValueAtTime(1, blockAbsStartTime);

        if (decay > 0) adsrGain.gain.linearRampToValueAtTime(sustainLevel, decayAbsEndTime);
        else adsrGain.gain.setValueAtTime(sustainLevel, attackAbsEndTime);

        if (releaseAbsStartTime > decayAbsEndTime) {
             adsrGain.gain.setValueAtTime(sustainLevel, releaseAbsStartTime);
        }

        if (release > 0) adsrGain.gain.linearRampToValueAtTime(0, blockAbsEndTime);
        else adsrGain.gain.setValueAtTime(0, blockAbsEndTime);

        console.log(`[MusicSyncPage] Oscillator for block ${audibleBlock.id} scheduled: osc.start(${blockAbsStartTime.toFixed(3)}), osc.stop(${blockAbsEndTime.toFixed(3)})`);
        osc.start(blockAbsStartTime);
        osc.stop(blockAbsEndTime);

        channelSpecificNodes.push({ osc, adsrGain, channelVolumeNode });
        currentChannelAbsoluteTime += duration;
        currentChannelDuration += duration;
      });

      if (currentChannelDuration > maxOverallDuration) {
        maxOverallDuration = currentChannelDuration;
      }
      if (isNaN(maxOverallDuration)) {
        console.error(`[MusicSyncPage] handlePlay: maxOverallDuration became NaN after processing channel ${channel.name}. Resetting to 0.`);
        maxOverallDuration = 0;
      }

      if (channelSpecificNodes.length > 0) {
        activeAudioNodesMap.current.set(channel.id, channelSpecificNodes);
        console.log(`[MusicSyncPage] handlePlay: Stored ${channelSpecificNodes.length} active audio nodes for channel ${channel.name}.`);
      } else {
        if (channelVolumeNode && !channelVolumeNode.disposed) {
          console.log(`[MusicSyncPage] handlePlay: No audible blocks for channel ${channel.name}, disposing its volume node.`);
          channelVolumeNode.dispose();
        }
      }
    });

    if (maxOverallDuration > 0) {
        playbackStartTimeRef.current = Tone.now();
        console.log(`[MusicSyncPage] handlePlay: Playback initiated. Max sequence duration: ${maxOverallDuration.toFixed(3)}s. isLooping: ${isLoopingRef.current}`);
        console.log(`[MusicSyncPage] Current Tone.now() before setTimeout: ${Tone.now()}`);

        const timeoutDuration = (maxOverallDuration + PLAYBACK_START_DELAY + 0.2) * 1000;
        console.log(`[MusicSyncPage] handlePlay: Scheduling end/loop timeout for ${timeoutDuration.toFixed(0)}ms from now.`);

        if (loopTimeoutIdRef.current) {
          clearTimeout(loopTimeoutIdRef.current);
        }

        loopTimeoutIdRef.current = setTimeout(() => {
            const timeoutFireTime = Tone.now();
            console.log(`[MusicSyncPage] Loop/Stop Timeout Fired. Current Tone.now(): ${timeoutFireTime}. playbackStartTimeRef was: ${playbackStartTimeRef.current}`);
            if (playbackStartTimeRef.current !== null) {
                const elapsedSincePlayStart = timeoutFireTime - (playbackStartTimeRef.current - PLAYBACK_START_DELAY);
                console.log(`[MusicSyncPage] Elapsed time since play started (according to Tone.now): ${elapsedSincePlayStart.toFixed(3)}s. Expected maxOverallDuration: ${maxOverallDuration.toFixed(3)}s`);
            }

            if (isPlayingRef.current) {
                 if (isLoopingRef.current) {
                     console.log('[MusicSyncPage] Loop: Triggering handlePlay again.');
                     handlePlay();
                 } else {
                     console.log('[MusicSyncPage] handlePlay: Automatic stop after max duration.');
                     handleStop();
                 }
            } else {
                console.log('[MusicSyncPage] handlePlay timeout: Playback was already stopped manually or by other means.');
            }
        }, timeoutDuration);

    } else {
        console.log('[MusicSyncPage] handlePlay: Max overall duration is 0 or NaN, nothing to play. Resetting isPlaying.');
        setIsPlaying(false);
    }

  }, [audioContextStarted, toast, channels, ensureAudioIsActive, handleStop, recalculateChannelBlockStartTimes]);


  useEffect(() => {
    if (isPlaying && playbackStartTimeRef.current !== null) {
      const updatePlayhead = () => {
        if (playbackStartTimeRef.current === null || !isPlayingRef.current) {
          if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
          animationFrameId.current = null;
          return;
        }
        const elapsed = Tone.now() - (playbackStartTimeRef.current);
        setCurrentPlayTime(elapsed);
        animationFrameId.current = requestAnimationFrame(updatePlayhead);
      };
      animationFrameId.current = requestAnimationFrame(updatePlayhead);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    }
    return () => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    };
  }, [isPlaying, currentPlayTime]);

  useEffect(() => {
    return () => {
      console.log('[MusicSyncPage] Unmounting. Stopping audio and disposing master volume node if it exists.');
      if (loopTimeoutIdRef.current) {
        clearTimeout(loopTimeoutIdRef.current);
      }
      handleStop();
      if (masterVolumeNodeRef.current && !masterVolumeNodeRef.current.disposed) {
        masterVolumeNodeRef.current.dispose();
        masterVolumeNodeRef.current = null;
        console.log('[MusicSyncPage] Unmounting: Disposed masterVolumeNodeRef.');
      }
    };
  }, [handleStop]);

  const totalTimelineWidth = Math.max(
      300,
      ...channels.map(ch => {
          if (ch.channelType === 'audio') {
              return ch.audioBlocks.reduce((sum, block) => sum + (Number(block.duration) || 0) * PIXELS_PER_SECOND, 0) + PIXELS_PER_SECOND;
          } else if (ch.channelType === 'thermal') {
              return ch.temperatureBlocks.reduce((sum, block) => sum + (Number(block.duration) || 0) * PIXELS_PER_SECOND, 0) + PIXELS_PER_SECOND;
          }
          return 0;
      })
  );


  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-[hsl(var(--background)/0.5)] via-[hsl(var(--muted)/0.5)] to-[hsl(var(--background)/0.5)] p-0 sm:p-4 md:p-8">
      <Card className="flex-grow flex flex-col shadow-2xl overflow-hidden bg-card rounded-none sm:rounded-xl h-full">
        <header className="p-4 sm:p-6 border-b flex items-center justify-between sticky top-0 bg-card/80 backdrop-blur-sm z-10">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gradient-primary-accent-secondary flex items-center">
              <ListMusicIcon className="mr-3 h-8 w-8" />
              MusicSync
            </h1>
          </div>
        </header>

        <div className="p-4 sm:p-6 flex-grow flex flex-col space-y-4 sm:space-y-6 overflow-hidden">
          <ControlsComponent
            isPlaying={isPlaying}
            isLooping={isLooping}
            isActivatingAudio={isActivatingAudio}
            outputMode={outputMode}
            masterVolume={masterVolume}
            onPlay={handlePlay}
            onStop={handleStop}
            onAddBlock={handleAddBlock}
            onAddSilenceBlock={handleAddSilenceBlock}
            onAddTemperatureBlock={handleAddTemperatureBlock}
            onToggleLoop={handleToggleLoop}
            onToggleOutputMode={handleToggleOutputMode}
            onMasterVolumeChange={handleMasterVolumeChange}
            onTestAudio={testAudio}
            canPlay={channels.some(ch =>
                ch.channelType === 'audio' &&
                !ch.isMuted &&
                ch.audioBlocks.some(b => {
                    const duration = Number(b.duration);
                    return !b.isSilent && !isNaN(duration) && duration > 0 && (!b.isSilent ? b.frequency > 0 : true);
                })
            )}
            disableAddAudioBlock={!selectedChannelId || selectedChannel?.channelType !== 'audio'}
            disableAddTemperatureBlock={!selectedChannelId || selectedChannel?.channelType !== 'thermal'}
          />

          <div className="flex flex-col md:flex-row flex-grow space-y-4 md:space-y-0 md:space-x-6 overflow-hidden">
            <div className="flex-grow md:w-2/3 flex flex-col space-y-2 overflow-y-auto pr-2 relative">
              {channels.map(channel => (
                <ChannelViewComponent
                  key={channel.id}
                  channel={channel}
                  isSelected={channel.id === selectedChannelId}
                  selectedBlockId={selectedBlockId}
                  onSelectChannel={handleSelectChannel}
                  onUpdateChannel={handleUpdateChannel}
                  onSelectBlock={handleSelectBlock}
                  onReorderBlock={handleReorderBlock}
                  pixelsPerSecond={PIXELS_PER_SECOND}
                  currentPlayTime={currentPlayTime}
                  isPlaying={isPlaying}
                />
              ))}
              <div className="flex space-x-2 mt-4">
                <Button onClick={handleAddAudioChannel} variant="outline" className="flex-1">
                  <ListMusicIcon className="mr-2 h-5 w-5" /> Add Audio Channel
                </Button>
                <Button onClick={handleAddThermalChannel} variant="outline" className="flex-1">
                  <ThermometerIcon className="mr-2 h-5 w-5" /> Add Thermal Channel
                </Button>
              </div>
              {channels.length > 0 && isPlaying && (
                <PlaybackIndicatorComponent
                  position={currentPlayTime * PIXELS_PER_SECOND}
                  isVisible={isPlaying}
                  containerHeight={channels.reduce((acc, _ch, idx) => acc + (idx > 0 ? 8 : 0) + CHANNEL_ROW_HEIGHT_PX, 0)}
                />
              )}
            </div>

            <PropertyPanelComponent
              className="w-full md:w-1/3 md:max-w-sm"
              selectedBlock={selectedBlock}
              selectedChannelType={selectedChannel?.channelType || null}
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
