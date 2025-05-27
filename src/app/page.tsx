
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
  const [isLooping, setIsLooping] = useState(false);
  const [outputMode, setOutputMode] = useState<'mixed' | 'independent'>('mixed');
  const [masterVolume, setMasterVolume] = useState<number>(0.75);

  const activeAudioNodesMap = useRef<Map<string, ActiveChannelAudioNodes[]>>(new Map());
  const animationFrameId = useRef<number | null>(null);
  const masterVolumeNodeRef = useRef<Tone.Volume | null>(null);
  
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
  }, [audioContextStarted, masterVolume]); // masterVolume is in deps to set initial volume if context starts later

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
      await activateAudio(); // This calls startAudioContext from ToneProvider
      if (Tone.context.state === 'running') {
        console.log('[MusicSyncPage] ensureAudioIsActive: activateAudio() successful. Tone.context.state:', Tone.context.state);
        return true;
      } else {
        console.warn('[MusicSyncPage] ensureAudioIsActive: activateAudio() did not result in "running" state. Current state:', Tone.context.state);
        // Making a direct attempt if provider's call didn't suffice or context got suspended again
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
        const updatedBlocks = [...ch.audioBlocks, newBlock];
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
    console.log('[MusicSyncPage] handlePlay: Called.');
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


    if (channels.every(ch => ch.audioBlocks.length === 0)) {
      console.log('[MusicSyncPage] handlePlay: No audio blocks in any channel.');
      toast({ title: "Cannot Play", description: "Add some audio blocks to at least one channel!", variant: "destructive" });
      return;
    }
    
    const hasAudibleContent = channels.some(ch => 
        !ch.isMuted && ch.audioBlocks.some(b => !b.isSilent && b.duration > 0)
    );

    if (!hasAudibleContent) {
        console.log('[MusicSyncPage] handlePlay: No audible content found (all blocks silent, muted, or zero duration).');
        toast({ title: "Nothing to Play", description: "No audible blocks with duration found in active channels.", variant: "default" });
        setIsPlaying(false);
        setCurrentPlayTime(0);
        Tone.Transport.position = 0;
        return;
    }

    console.log('[MusicSyncPage] handlePlay: Stopping and canceling previous transport events.');
    Tone.Transport.stop(); 
    Tone.Transport.cancel(); 
    Tone.Transport.position = 0; 

    console.log('[MusicSyncPage] handlePlay: Disposing old audio nodes.');
    activeAudioNodesMap.current.forEach(channelNodes => {
      channelNodes.forEach(nodes => {
        nodes.osc.dispose();
        nodes.adsrGain.dispose();
        nodes.channelVolumeNode.dispose();
      });
    });
    activeAudioNodesMap.current.clear();

    console.log(`[MusicSyncPage] handlePlay: Number of channels: ${channels.length}. Channels data:`, JSON.parse(JSON.stringify(channels)));

    channels.forEach(channel => {
      if (channel.isMuted || channel.audioBlocks.length === 0) {
        console.log(`[MusicSyncPage] handlePlay: Skipping channel ${channel.name} (ID: ${channel.id}) because it is muted or has no blocks.`);
        return;
      }
      console.log(`[MusicSyncPage] handlePlay: Processing channel ${channel.name} (ID: ${channel.id}). Number of audio blocks: ${channel.audioBlocks.length}`);
      
      const channelSpecificNodes: ActiveChannelAudioNodes[] = [];
      const channelVolDb = (channel.volume > 0.001 && !channel.isMuted) ? Tone.gainToDb(channel.volume) : -Infinity;
      
      const channelVolumeNode = new Tone.Volume(channelVolDb);
      console.log(`[MusicSyncPage] handlePlay: Channel ${channel.name} (ID: ${channel.id}) VolumeNode created, volume: ${channelVolDb}dB. Node details:`, channelVolumeNode);

      if (!masterVolumeNodeRef.current) {
          console.error(`[MusicSyncPage] handlePlay: CRITICAL ERROR for channel ${channel.name} - masterVolumeNodeRef.current is null before connecting ChannelVolumeNode.`);
          return; // Skip this channel if master isn't ready
      }
      
      console.log(`[MusicSyncPage] handlePlay: Connecting ChannelVolumeNode for ${channel.name} to MasterVolumeNode.`);
      channelVolumeNode.connect(masterVolumeNodeRef.current);
      console.log(`[MusicSyncPage] handlePlay: MasterVolumeNode outputs: ${masterVolumeNodeRef.current.numberOfOutputs}, MasterVolumeNode inputs: ${masterVolumeNodeRef.current.numberOfInputs}`);
      console.log("[MusicSyncPage] MasterVolumeNode (after channel connect) details:", masterVolumeNodeRef.current);
      
      channel.audioBlocks.forEach(block => {
        if (block.isSilent) {
            console.log(`[MusicSyncPage] handlePlay: Skipping silent block ${block.id} in channel ${channel.name}.`);
            return;
        }

        const audibleBlock = block as AudibleAudioBlock;
        console.log(`[MusicSyncPage] handlePlay: PROCESSING AUDIBLE BLOCK for channel ${channel.name}: ID=${audibleBlock.id}, Wave=${audibleBlock.waveform}, Freq=${audibleBlock.frequency}Hz, Dur=${audibleBlock.duration}s, StartTime=${audibleBlock.startTime}s`);
        console.log(`[MusicSyncPage] handlePlay: ADSR for block ${audibleBlock.id}: A=${audibleBlock.attack}, D=${audibleBlock.decay}, S=${audibleBlock.sustainLevel}, R=${audibleBlock.release}`);

        if (audibleBlock.duration <= 0) {
            console.log(`[MusicSyncPage] handlePlay: Skipping audible block ${audibleBlock.id} due to zero or negative duration.`);
            return; 
        }
        if (audibleBlock.frequency <=0) {
             console.warn(`[MusicSyncPage] handlePlay: Audible block ${audibleBlock.id} has frequency <= 0 (${audibleBlock.frequency}Hz). This will likely not produce sound.`);
        }
        if (audibleBlock.frequency < 40) {
             console.warn(`[MusicSyncPage] handlePlay: Audible block ${audibleBlock.id} in channel ${channel.name} has a very low frequency (${audibleBlock.frequency}Hz) which may be inaudible or rumble-like.`);
        }


        const osc = new Tone.Oscillator({
          type: audibleBlock.waveform, frequency: audibleBlock.frequency, volume: -6, 
        });
        
        const adsrGain = new Tone.Gain(0).connect(channelVolumeNode); 
        osc.connect(adsrGain);
        console.log(`[MusicSyncPage] handlePlay: Created Oscillator and ADSR Gain for block ${audibleBlock.id}. Osc connected to ADSRGain, ADSRGain connected to ChannelVolumeNode.`);
        
        const { startTime, duration, attack, decay, sustainLevel, release } = audibleBlock;
        const attackEndTime = startTime + attack;
        const decayEndTime = attackEndTime + decay;
        const releaseStartTime = startTime + duration - release; 
        const effectiveEndTime = startTime + duration;

        console.log(`[MusicSyncPage] handlePlay: SCHEDULING ADSR for block ${audibleBlock.id}: StartTime=${startTime.toFixed(3)}, Duration=${duration.toFixed(3)}, AttackTime=${attack.toFixed(3)} (ends @${attackEndTime.toFixed(3)}), DecayTime=${decay.toFixed(3)} (ends @${decayEndTime.toFixed(3)}), SustainLevel=${sustainLevel.toFixed(2)}, ReleaseTime=${release.toFixed(3)} (starts @${releaseStartTime.toFixed(3)}, ends @${effectiveEndTime.toFixed(3)})`);

        adsrGain.gain.setValueAtTime(0, startTime); 
        
        if (attack > 0) {
            adsrGain.gain.linearRampToValueAtTime(1, attackEndTime);
        } else {
            adsrGain.gain.setValueAtTime(1, startTime); 
        }
        
        if (decay > 0) {
            adsrGain.gain.linearRampToValueAtTime(sustainLevel, decayEndTime);
        } else {
            adsrGain.gain.setValueAtTime(sustainLevel, attackEndTime);
        }

        if (releaseStartTime > decayEndTime) { 
            adsrGain.gain.setValueAtTime(sustainLevel, releaseStartTime);
        }
        
        if (release > 0) {
            adsrGain.gain.linearRampToValueAtTime(0, effectiveEndTime);
        } else {
            adsrGain.gain.setValueAtTime(0, effectiveEndTime); 
        }
        
        console.log(`[MusicSyncPage] handlePlay: Oscillator for block ${audibleBlock.id} scheduled: osc.start(${startTime.toFixed(3)}), osc.stop(${(effectiveEndTime + 0.1).toFixed(3)})`);
        osc.start(startTime);
        osc.stop(effectiveEndTime + 0.1); 

        channelSpecificNodes.push({ osc, adsrGain, channelVolumeNode });
      });
      if (channelSpecificNodes.length > 0) {
        activeAudioNodesMap.current.set(channel.id, channelSpecificNodes);
        console.log(`[MusicSyncPage] handlePlay: Stored ${channelSpecificNodes.length} active audio nodes for channel ${channel.name} (ID: ${channel.id})`);
      } else {
        console.log(`[MusicSyncPage] handlePlay: No active audio nodes created for channel ${channel.name} (ID: ${channel.id}) (might be all silent blocks or zero duration audible blocks).`);
      }
    });

    const longestChannelDuration = Math.max(0, ...channels.map(ch => ch.audioBlocks.reduce((sum, b) => sum + b.duration, 0)));
    console.log(`[MusicSyncPage] handlePlay: Longest channel duration: ${longestChannelDuration}s. isLooping: ${isLooping}`);

    if (longestChannelDuration === 0 && !isLooping) {
        console.log('[MusicSyncPage] handlePlay: No duration and not looping, stopping playback state.');
        setIsPlaying(false);
        setCurrentPlayTime(0);
        Tone.Transport.position = 0;
        return; 
    }
    
    if (isLooping && longestChannelDuration > 0) {
      Tone.Transport.loop = true;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = longestChannelDuration;
      console.log(`[MusicSyncPage] handlePlay: Loop enabled. LoopStart: 0, LoopEnd: ${longestChannelDuration}s`);
    } else {
      Tone.Transport.loop = false;
      if (longestChannelDuration > 0) { 
        Tone.Transport.scheduleOnce(() => {
          console.log('[MusicSyncPage] handlePlay: Playback finished (scheduled stop for non-looping).');
          setIsPlaying(false);
          setCurrentPlayTime(0); 
          Tone.Transport.position = 0; 
        }, longestChannelDuration + 0.2); 
         console.log(`[MusicSyncPage] handlePlay: Scheduled stop for non-looping playback at ${longestChannelDuration + 0.2}s.`);
      }
    }

    console.log('[MusicSyncPage] handlePlay: Starting Tone.Transport (+0.1s delay).');
    Tone.Transport.start("+0.1"); 
    setIsPlaying(true);
  }, [audioContextStarted, toast, isLooping, masterVolume, channels, outputMode, recalculateChannelBlockStartTimes, ensureAudioIsActive, currentPlayTime]);


  const handleStop = useCallback(() => {
    console.log('[MusicSyncPage] handleStop: Called.');
    Tone.Transport.stop();
    Tone.Transport.cancel(); 
    Tone.Transport.loop = false; 
    console.log('[MusicSyncPage] handleStop: Disposing active audio nodes.');
    activeAudioNodesMap.current.forEach((channelNodes, channelId) => {
      channelNodes.forEach(nodes => {
        nodes.osc.dispose();
        nodes.adsrGain.dispose();
        nodes.channelVolumeNode.dispose(); 
      });
      console.log(`[MusicSyncPage] handleStop: Disposed nodes for channel ID ${channelId}`);
    });
    activeAudioNodesMap.current.clear();
    setIsPlaying(false);
    setCurrentPlayTime(0); 
    Tone.Transport.position = 0; 
    console.log('[MusicSyncPage] handleStop: Playback stopped and state reset.');
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
      setCurrentPlayTime(Tone.Transport.seconds); 
    }
    return () => { if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); };
  }, [isPlaying]);

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
            <p className="text-muted-foreground text-sm sm:text-base mt-1">Craft your unique sound sequences, channel by channel.</p>
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
            onToggleLoop={handleToggleLoop}
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

    