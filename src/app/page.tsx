
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
const PLAYBACK_START_DELAY = 0.1; // Small delay before starting playback with absolute time

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
  const { audioContextStarted, startAudioContext: activateAudio } = useToneContext();
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
  const [isActivatingAudio, setIsActivatingAudio] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0); 
  // const [isLooping, setIsLooping] = useState(false); // Temporarily removed for absolute time scheduling
  const [outputMode, setOutputMode] = useState<'mixed' | 'independent'>('mixed');
  const [masterVolume, setMasterVolume] = useState<number>(0.75);

  const activeAudioNodesMap = useRef<Map<string, ActiveChannelAudioNodes[]>>(new Map());
  const animationFrameId = useRef<number | null>(null);
  const masterVolumeNodeRef = useRef<Tone.Volume | null>(null);
  const playbackStartTimeRef = useRef<number | null>(null); // For tracking playhead with absolute time
  
  const isInitialMount = useRef({ looping: true, outputMode: true, masterVolume: true, channelVolume: true });


  const selectedChannel = channels.find(ch => ch.id === selectedChannelId) || null;
  const selectedBlock = selectedChannel?.audioBlocks.find(block => block.id === selectedBlockId) || null;

  useEffect(() => {
    if (audioContextStarted) {
      if (!masterVolumeNodeRef.current) {
        console.log('[MusicSyncPage] useEffect (audioContextStarted): Creating MasterVolumeNode.');
        masterVolumeNodeRef.current = new Tone.Volume(Tone.gainToDb(masterVolume)).toDestination();
        console.log('[MusicSyncPage] MasterVolumeNode created and connected to destination. Initial volume (dB):', masterVolumeNodeRef.current.volume.value, 'Node details:', masterVolumeNodeRef.current);
      }
    }
  }, [audioContextStarted, masterVolume]); 

  useEffect(() => {
    if (masterVolumeNodeRef.current && audioContextStarted) {
       console.log('[MusicSyncPage] useEffect (masterVolume, audioContextStarted): Ramping master volume to', masterVolume);
      masterVolumeNodeRef.current.volume.rampTo(Tone.gainToDb(masterVolume), 0.05);
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
      console.log('[MusicSyncPage] testAudio: Attempting to start Tone.js');
      if (Tone.context.state !== 'running') {
           await Tone.start();
      }
      console.log('[MusicSyncPage] testAudio: Audio context state after potential Tone.start():', Tone.context.state);
      if (Tone.context.state !== 'running') {
        console.error('[MusicSyncPage] testAudio: Audio context did not start. Aborting test.');
        toast({ title: "Audio Test Failed", description: "Audio context could not be started.", variant: "destructive" });
        return;
      }
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
    // This function might become less relevant if start times are calculated on-the-fly for absolute scheduling
    // However, keeping it for potential future use or if relative start times within a channel are still needed for UI.
    let cumulativeTime = 0;
    return blocks.map(block => {
      const newStartTime = cumulativeTime;
      cumulativeTime += block.duration;
      return { ...block, startTime: newStartTime };
    });
  }, []);

  const handleAddChannel = useCallback(async () => {
    if (!(await ensureAudioIsActive())) return;

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
  }, [channels.length, toast, ensureAudioIsActive]);

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
    if (updates.volume !== undefined && !isInitialMount.current.channelVolume) { 
        toast({ title: "Channel Volume Changed", description: `${channelName} volume to ${Math.round(updates.volume * 100)}%` });
    } else if (updates.volume !== undefined && isInitialMount.current.channelVolume) {
        isInitialMount.current.channelVolume = false; 
    }

    if (updates.isMuted !== undefined) {
        toast({ title: `Channel ${updates.isMuted ? "Muted" : "Unmuted"}`, description: `${channelName} is now ${updates.isMuted ? "muted" : "unmuted"}.` });
    }
  }, [toast, channels]);


  const handleAddBlock = useCallback(async () => {
    console.log('[MusicSyncPage] handleAddBlock: Called.');
    if (!(await ensureAudioIsActive())) {
      console.log('[MusicSyncPage] handleAddBlock: ensureAudioIsActive returned false. Aborting.');
      return;
    }

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
        // startTime is now relative to channel, not absolute. Absolute calculation happens at play.
        const updatedBlocks = [...ch.audioBlocks, newBlock];
        // recalculateChannelBlockStartTimes might still be useful for UI or if blocks within a channel need relative start times
        return { ...ch, audioBlocks: recalculateChannelBlockStartTimes(updatedBlocks) };
      }
      return ch;
    }));
    setSelectedBlockId(newBlockId);
    toast({ title: "Audio Block Added", description: `Block added to ${selectedChannel?.name}.` });
  }, [selectedChannelId, selectedChannel?.name, recalculateChannelBlockStartTimes, toast, ensureAudioIsActive]);

  const handleAddSilenceBlock = useCallback(async () => {
    console.log('[MusicSyncPage] handleAddSilenceBlock: Called.');
    if (!(await ensureAudioIsActive())) {
      console.log('[MusicSyncPage] handleAddSilenceBlock: ensureAudioIsActive returned false. Aborting.');
      return;
    }
    
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
  }, [selectedChannelId, selectedChannel?.name, recalculateChannelBlockStartTimes, toast, ensureAudioIsActive]);
  
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

  // useEffect(() => { if (!isInitialMount.current.looping) { if (toast && typeof isLooping === 'boolean') { toast({ title: isLooping ? "Loop Enabled" : "Loop Disabled", description: isLooping ? "Playback will now loop." : "Playback will not loop." }); } } else { isInitialMount.current.looping = false; } }, [isLooping, toast]); // Looping temporarily removed
  useEffect(() => { if (!isInitialMount.current.outputMode) { if (toast) { toast({ title: "Output Mode Changed", description: `Switched to ${outputMode === 'mixed' ? 'Mixed' : 'Independent'} Output.` }); } } else { isInitialMount.current.outputMode = false; } }, [outputMode, toast]);
  useEffect(() => { if (!isInitialMount.current.masterVolume && masterVolumeNodeRef.current) { if (toast) { toast({ title: "Master Volume Changed", description: `Volume set to ${Math.round(masterVolume * 100)}%` }); } } else { isInitialMount.current.masterVolume = false; } }, [masterVolume, toast]);


  // const handleToggleLoop = useCallback(() => setIsLooping(prev => !prev), []); // Looping temporarily removed

  const handleToggleOutputMode = useCallback(() => {
    setOutputMode(prevMode => (prevMode === 'mixed' ? 'independent' : 'mixed'));
  }, []);

  const handlePlay = useCallback(async () => {
    console.log('[MusicSyncPage] handlePlay: Called. Switching to ABSOLUTE TIME scheduling.');
    if (!(await ensureAudioIsActive())) {
        console.log('[MusicSyncPage] handlePlay: ensureAudioIsActive returned false. Aborting.');
        return;
    }
    
    if (!masterVolumeNodeRef.current) {
      console.error("[MusicSyncPage] handlePlay: CRITICAL: MasterVolumeNode is not ready. Cannot play audio.");
      toast({ title: "Audio Error", description: "Master volume node not ready. Please try again or refresh.", variant: "destructive"}); 
      return; 
    }
    console.log('[MusicSyncPage] handlePlay: MasterVolumeNode is ready. Details:', masterVolumeNodeRef.current);

    const hasAnyAudibleContent = channels.some(ch => 
        !ch.isMuted && ch.audioBlocks.some(b => !b.isSilent && b.duration > 0)
    );
    if (!hasAnyAudibleContent) {
        console.log('[MusicSyncPage] handlePlay: No audible content found in any active channel.');
        toast({ title: "Nothing to Play", description: "No audible blocks with duration found in active channels.", variant: "default" });
        setIsPlaying(false);
        setCurrentPlayTime(0);
        return;
    }

    // Dispose previous nodes before scheduling new ones
    activeAudioNodesMap.current.forEach(channelNodes => {
      channelNodes.forEach(nodes => {
        nodes.osc.dispose();
        nodes.adsrGain.dispose();
        nodes.channelVolumeNode.dispose(); // This might dispose the master if not careful - ensure it's distinct
      });
    });
    activeAudioNodesMap.current.clear();
    
    const baseAbsoluteTime = Tone.now() + PLAYBACK_START_DELAY;
    console.log(`[MusicSyncPage] handlePlay: Base absolute time for scheduling: ${baseAbsoluteTime}`);
    console.log(`[MusicSyncPage] handlePlay: Number of channels: ${channels.length}. Channels data:`, JSON.parse(JSON.stringify(channels)));

    let maxOverallDuration = 0;

    channels.forEach(channel => {
      if (channel.isMuted || channel.audioBlocks.length === 0) {
        console.log(`[MusicSyncPage] handlePlay: Skipping channel ${channel.name} (ID: ${channel.id}) - muted or no blocks.`);
        return;
      }
      console.log(`[MusicSyncPage] handlePlay: Processing channel ${channel.name} (ID: ${channel.id}). Blocks: ${channel.audioBlocks.length}`);
      
      const channelSpecificNodes: ActiveChannelAudioNodes[] = [];
      const channelVolDb = (channel.volume > 0.001 && !channel.isMuted) ? Tone.gainToDb(channel.volume) : -Infinity;
      
      const channelVolumeNode = new Tone.Volume(channelVolDb);
      console.log(`[MusicSyncPage] handlePlay: Channel ${channel.name} (ID: ${channel.id}) VolumeNode created, volume: ${channelVolDb}dB.`);

      if (!masterVolumeNodeRef.current) {
          console.error(`[MusicSyncPage] handlePlay: CRITICAL ERROR for channel ${channel.name} - masterVolumeNodeRef.current is null before connecting ChannelVolumeNode.`);
          return; 
      }
      console.log(`[MusicSyncPage] handlePlay: Connecting ChannelVolumeNode for ${channel.name} to MasterVolumeNode.`);
      channelVolumeNode.connect(masterVolumeNodeRef.current);
      console.log(`[MusicSyncPage] handlePlay: MasterVolumeNode (after channel ${channel.name} connect) outputs: ${masterVolumeNodeRef.current.numberOfOutputs}, inputs: ${masterVolumeNodeRef.current.numberOfInputs}.`);
      console.log("[MusicSyncPage] MasterVolumeNode (after channel connect) details:", masterVolumeNodeRef.current);
      
      let currentChannelAbsoluteTime = baseAbsoluteTime;
      let currentChannelDuration = 0;

      channel.audioBlocks.forEach((block, blockIndex) => {
        if (block.isSilent) {
            console.log(`[MusicSyncPage] handlePlay: Channel ${channel.name}, Block ${blockIndex} (ID: ${block.id}) is SILENT. Duration: ${block.duration}s. Advancing time.`);
            currentChannelAbsoluteTime += block.duration;
            currentChannelDuration += block.duration;
            return;
        }

        const audibleBlock = block as AudibleAudioBlock;
        console.log(`[MusicSyncPage] handlePlay: Channel ${channel.name}, Block ${blockIndex} (ID: ${audibleBlock.id}) PROCESSING. Freq=${audibleBlock.frequency}Hz, Dur=${audibleBlock.duration}s. Scheduled to start at absolute time: ${currentChannelAbsoluteTime.toFixed(3)}`);
        if (audibleBlock.frequency < 40 && audibleBlock.frequency > 0) {
          console.warn(`[MusicSyncPage] handlePlay: Audible block ${audibleBlock.id} in channel ${channel.name} has a very low frequency (${audibleBlock.frequency}Hz). This may be inaudible or primarily felt as vibration.`);
        }
        if (audibleBlock.duration <= 0) {
            console.log(`[MusicSyncPage] handlePlay: Skipping audible block ${audibleBlock.id} due to zero or negative duration.`);
            return; 
        }
        
        const osc = new Tone.Oscillator({ type: audibleBlock.waveform, frequency: audibleBlock.frequency, volume: -6 });
        const adsrGain = new Tone.Gain(0).connect(channelVolumeNode); 
        osc.connect(adsrGain);
        
        const { duration, attack, decay, sustainLevel, release } = audibleBlock;
        
        // ADSR Scheduling with absolute times
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

        if (releaseAbsStartTime > decayAbsEndTime) { // Ensure sustain is held if there's a gap
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

      if (channelSpecificNodes.length > 0) {
        activeAudioNodesMap.current.set(channel.id, channelSpecificNodes);
        console.log(`[MusicSyncPage] handlePlay: Stored ${channelSpecificNodes.length} active audio nodes for channel ${channel.name}.`);
      } else {
        console.log(`[MusicSyncPage] handlePlay: No active audio nodes created for channel ${channel.name}.`);
      }
    });

    if (maxOverallDuration > 0) {
        playbackStartTimeRef.current = Tone.now(); // For UI playback indicator
        setIsPlaying(true);
        console.log(`[MusicSyncPage] handlePlay: Playback initiated. Max sequence duration: ${maxOverallDuration.toFixed(3)}s.`);

        // Schedule a master stop if not looping (looping temporarily removed)
        setTimeout(() => {
            if (isPlayingRef.current) { // Check if still playing, might have been stopped manually
                 console.log('[MusicSyncPage] handlePlay: Automatic stop after max duration.');
                 handleStop(); // Or a gentler stop that doesn't clear everything if looping is re-added
            }
        }, (maxOverallDuration + PLAYBACK_START_DELAY + 0.2) * 1000); // Add start delay and small buffer

    } else {
        console.log('[MusicSyncPage] handlePlay: Max overall duration is 0, nothing to play.');
        setIsPlaying(false);
    }

  }, [audioContextStarted, toast, masterVolume, channels, outputMode, ensureAudioIsActive, recalculateChannelBlockStartTimes, currentPlayTime]);

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);


  const handleStop = useCallback(() => {
    console.log('[MusicSyncPage] handleStop: Called.');
    activeAudioNodesMap.current.forEach((channelNodes, channelId) => {
      channelNodes.forEach(nodes => {
        // It's important to cancel scheduled values before disposing
        nodes.adsrGain.gain.cancelScheduledValues(Tone.now());
        nodes.osc.stop(Tone.now()); // Stop immediately
        nodes.osc.dispose();
        nodes.adsrGain.dispose();
        nodes.channelVolumeNode.dispose(); // Dispose per-channel volume nodes
      });
      console.log(`[MusicSyncPage] handleStop: Disposed nodes for channel ID ${channelId}`);
    });
    activeAudioNodesMap.current.clear();
    
    // If Tone.Transport was used, this would be relevant. With absolute time, less so, but good for safety.
    // Tone.Transport.stop();
    // Tone.Transport.cancel(); 
    // Tone.Transport.position = 0; 

    setIsPlaying(false);
    setCurrentPlayTime(0); 
    playbackStartTimeRef.current = null;
    console.log('[MusicSyncPage] handleStop: Playback stopped and state reset.');
  }, []);

  useEffect(() => {
    if (isPlaying && playbackStartTimeRef.current !== null) {
      const updatePlayhead = () => {
        if (playbackStartTimeRef.current === null || !isPlayingRef.current) { // Check isPlayingRef
          if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
          return;
        }
        const elapsed = Tone.now() - playbackStartTimeRef.current;
        setCurrentPlayTime(elapsed);
        animationFrameId.current = requestAnimationFrame(updatePlayhead);
      };
      animationFrameId.current = requestAnimationFrame(updatePlayhead);
    } else {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    }
    return () => { if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); };
  }, [isPlaying]); // isPlayingRef is not needed here as isPlaying triggers the effect.

  useEffect(() => { 
    return () => {
      console.log('[MusicSyncPage] Unmounting. Stopping audio and disposing master volume node if it exists.');
      handleStop(); 
      if (masterVolumeNodeRef.current) {
        masterVolumeNodeRef.current.dispose();
        masterVolumeNodeRef.current = null;
        console.log('[MusicSyncPage] Unmounting: Disposed masterVolumeNodeRef.');
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
            
          </div>
        </header>

        <div className="p-4 sm:p-6 flex-grow flex flex-col space-y-4 sm:space-y-6 overflow-hidden">
          <ControlsComponent
            isPlaying={isPlaying}
            // isLooping={isLooping} // Looping temporarily disabled
            isLooping={false} // Looping temporarily disabled
            isActivatingAudio={isActivatingAudio}
            outputMode={outputMode}
            masterVolume={masterVolume}
            onPlay={handlePlay}
            onStop={handleStop}
            onAddBlock={handleAddBlock}
            onAddSilenceBlock={handleAddSilenceBlock}
            onToggleLoop={() => { /* Looping temporarily disabled */ }}
            onToggleOutputMode={handleToggleOutputMode}
            onMasterVolumeChange={handleMasterVolumeChange}
            onTestAudio={testAudio} 
            canPlay={channels.some(ch => !ch.isMuted && ch.audioBlocks.length > 0 && ch.audioBlocks.some(b => !b.isSilent && b.duration > 0))}
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

