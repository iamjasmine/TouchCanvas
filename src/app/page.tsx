"use client";

import type React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import type { AudioBlock, AudibleAudioBlock, SilentAudioBlock, Channel, WaveformType, TemperatureBlock, AnyBlock, TemperatureType, TemperatureIntensity } from '@/types';
import { useToneContext } from '@/components/providers/tone-provider';
import { ControlsComponent } from '@/components/controls/controls-component';
import { PropertyPanelComponent } from '@/components/property-panel/property-panel';
import { ChannelViewComponent } from '@/components/channel/channel-view';
import { PlaybackIndicatorComponent } from '@/components/timeline/playback-indicator-component';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PlusIcon, ListMusicIcon, ThermometerIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PIXELS_PER_SECOND = 60;
const MIN_SUSTAIN_TIME = 0.05;
const PLAYBACK_START_DELAY = 0.1;
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

  const [channels, setChannels] = useState<Channel[]>([
    {
      id: crypto.randomUUID(),
      name: 'Audio Channel 1',
      channelType: 'audio',
      volume: 0.75,
      isMuted: false,
      audioBlocks: [
        {
          id: crypto.randomUUID(),
          startTime: 0,
          duration: 1,
          waveform: 'sine',
          frequency: 440,
          isSilent: false,
          ...calculateADSRDefaults(1),
        }
      ],
      temperatureBlocks: [],
    }
  ]);

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(channels[0].id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(channels[0].audioBlocks[0].id);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isActivatingAudio, setIsActivatingAudio] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [outputMode, setOutputMode] = useState<'mixed' | 'independent'>('mixed');
  const [masterVolume, setMasterVolume] = useState<number>(0.75);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);

  const selectedChannel = useMemo(() => 
    channels.find(ch => ch.id === selectedChannelId) || null
  , [channels, selectedChannelId]);

  const selectedBlock = useMemo(() => {
    if (!selectedChannel || !selectedBlockId) return null;
    if (selectedChannel.channelType === 'audio') {
      return selectedChannel.audioBlocks.find(block => block.id === selectedBlockId) || null;
    } else if (selectedChannel.channelType === 'thermal') {
      return selectedChannel.temperatureBlocks.find(block => block.id === selectedBlockId) || null;
    }
    return null;
  }, [selectedChannel, selectedBlockId]);

  const handleUpdateChannel = useCallback((channelId: string, updates: Partial<Pick<Channel, 'name' | 'volume' | 'isMuted'>>) => {
    setChannels(prevChannels =>
      prevChannels.map(ch =>
        ch.id === channelId ? { ...ch, ...updates } : ch
      )
    );
  }, []);

  const handleRequestDeleteChannel = useCallback((channelId: string) => {
    const channel = channels.find(ch => ch.id === channelId);
    if (channel) {
      setChannelToDelete(channel);
    }
  }, [channels]);

  const executeDeleteChannel = useCallback(() => {
    if (channelToDelete) {
      setChannels(prevChannels => prevChannels.filter(ch => ch.id !== channelToDelete.id));
      if (selectedChannelId === channelToDelete.id) {
        setSelectedChannelId(null);
      }
      setChannelToDelete(null);
    }
  }, [channelToDelete, selectedChannelId]);

  const handleAddBlock = useCallback(() => {
    if (!selectedChannelId || !selectedChannel) return;
    if (selectedChannel.channelType !== 'audio') return;

    const newBlock: AudibleAudioBlock = {
      id: crypto.randomUUID(),
      startTime: 0,
      duration: 1,
      waveform: 'sine',
      frequency: 440,
      isSilent: false,
      ...calculateADSRDefaults(1),
    };

    setChannels(channels.map(ch => 
      ch.id === selectedChannelId 
        ? { ...ch, audioBlocks: [...ch.audioBlocks, newBlock] }
        : ch
    ));
    setSelectedBlockId(newBlock.id);
  }, [selectedChannelId, selectedChannel, channels]);

  const handleAddSilenceBlock = useCallback(() => {
    if (!selectedChannelId || !selectedChannel) return;
    if (selectedChannel.channelType !== 'audio') return;

    const newBlock: SilentAudioBlock = {
      id: crypto.randomUUID(),
      startTime: 0,
      duration: 1,
      isSilent: true,
    };

    setChannels(channels.map(ch => 
      ch.id === selectedChannelId 
        ? { ...ch, audioBlocks: [...ch.audioBlocks, newBlock] }
        : ch
    ));
    setSelectedBlockId(newBlock.id);
  }, [selectedChannelId, selectedChannel, channels]);

  const handleAddTemperatureBlock = useCallback(() => {
    if (!selectedChannelId || !selectedChannel) return;
    if (selectedChannel.channelType !== 'thermal') return;

    const newBlock: TemperatureBlock = {
      id: crypto.randomUUID(),
      startTime: 0,
      duration: 1,
      type: 'cool',
      intensity: 'mid',
    };

    setChannels(channels.map(ch => 
      ch.id === selectedChannelId 
        ? { ...ch, temperatureBlocks: [...ch.temperatureBlocks, newBlock] }
        : ch
    ));
    setSelectedBlockId(newBlock.id);
  }, [selectedChannelId, selectedChannel, channels]);

  const handleToggleLoop = useCallback(() => {
    setIsLooping(!isLooping);
  }, [isLooping]);

  const handleToggleOutputMode = useCallback(() => {
    setOutputMode(outputMode === 'mixed' ? 'independent' : 'mixed');
  }, [outputMode]);

  const handleTestAudio = useCallback(async () => {
    if (!audioContextStarted) {
      await activateAudio();
      return;
    }

    const osc = new Tone.Oscillator(440, 'sine').toDestination();
    osc.start();
    setTimeout(() => osc.stop(), 500);
  }, [audioContextStarted, activateAudio]);

  const ensureAudioIsActive = useCallback(async (): Promise<boolean> => {
    if (Tone.context.state === 'running' && audioContextStarted) {
      return true;
    }

    setIsActivatingAudio(true);
    try {
      await activateAudio();
      if (Tone.context.state === 'running') {
        return true;
      }
    } catch (error) {
      console.error('Failed to activate audio:', error);
    } finally {
      setIsActivatingAudio(false);
    }
    return false;
  }, [audioContextStarted, activateAudio]);

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b p-4">
        <h1 className="text-2xl font-bold">TouchCanvas</h1>
      </header>
      
      <main className="flex-1 flex">
        <div className="flex-1 p-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Channels</h2>
              <Button
                onClick={() => {
                  const newChannel: Channel = {
                    id: crypto.randomUUID(),
                    name: `Audio Channel ${channels.length + 1}`,
                    channelType: 'audio',
                    volume: 0.75,
                    isMuted: false,
                    audioBlocks: [],
                    temperatureBlocks: [],
                  };
                  setChannels([...channels, newChannel]);
                }}
              >
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Channel
              </Button>
            </div>
            
            <div className="space-y-4">
              {channels.map((channel) => (
                <ChannelViewComponent
                  key={channel.id}
                  channel={channel}
                  isSelected={channel.id === selectedChannelId}
                  selectedBlockId={selectedBlockId}
                  onSelectChannel={setSelectedChannelId}
                  onUpdateChannel={handleUpdateChannel}
                  onSelectBlock={setSelectedBlockId}
                  onReorderBlock={(channelId, draggedBlockId, targetIndex) => {
                    // ブロックの並び替えロジックを実装
                  }}
                  onDeleteChannelRequest={handleRequestDeleteChannel}
                  pixelsPerSecond={PIXELS_PER_SECOND}
                  currentPlayTime={currentPlayTime}
                  isPlaying={isPlaying}
                />
              ))}
            </div>
          </div>
        </div>
        
        <div className="w-80 border-l p-4">
          <PropertyPanelComponent
            selectedBlock={selectedBlock}
            selectedChannelType={selectedChannel?.channelType || null}
            onUpdateBlock={(updatedBlock) => {
              if (!selectedChannel) return;
              setChannels(channels.map(ch => {
                if (ch.id !== selectedChannel.id) return ch;
                if (ch.channelType === 'audio') {
                  return {
                    ...ch,
                    audioBlocks: ch.audioBlocks.map(block =>
                      block.id === updatedBlock.id ? updatedBlock as AudioBlock : block
                    )
                  };
                } else {
                  return {
                    ...ch,
                    temperatureBlocks: ch.temperatureBlocks.map(block =>
                      block.id === updatedBlock.id ? updatedBlock as TemperatureBlock : block
                    )
                  };
                }
              }));
            }}
            onDeleteBlock={(blockId) => {
              if (!selectedChannel) return;
              setChannels(channels.map(ch => {
                if (ch.id !== selectedChannel.id) return ch;
                if (ch.channelType === 'audio') {
                  return {
                    ...ch,
                    audioBlocks: ch.audioBlocks.filter(block => block.id !== blockId)
                  };
                } else {
                  return {
                    ...ch,
                    temperatureBlocks: ch.temperatureBlocks.filter(block => block.id !== blockId)
                  };
                }
              }));
              if (selectedBlockId === blockId) {
                setSelectedBlockId(null);
              }
            }}
            pixelsPerSecond={PIXELS_PER_SECOND}
          />
        </div>
      </main>
      
      <footer className="border-t p-4">
        <ControlsComponent
          isPlaying={isPlaying}
          isLooping={isLooping}
          isActivatingAudio={isActivatingAudio}
          outputMode={outputMode}
          masterVolume={masterVolume}
          onPlay={async () => {
            if (!audioContextStarted) {
              const success = await ensureAudioIsActive();
              if (!success) return;
            }
            setIsPlaying(true);
          }}
          onStop={() => {
            setIsPlaying(false);
            setCurrentPlayTime(0);
          }}
          onAddBlock={handleAddBlock}
          onAddSilenceBlock={handleAddSilenceBlock}
          onAddTemperatureBlock={handleAddTemperatureBlock}
          onToggleLoop={handleToggleLoop}
          onToggleOutputMode={handleToggleOutputMode}
          onMasterVolumeChange={setMasterVolume}
          onTestAudio={handleTestAudio}
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
      </footer>

      <AlertDialog open={!!channelToDelete} onOpenChange={() => setChannelToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Channel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this channel? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteChannel}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
