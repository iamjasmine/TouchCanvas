
export type WaveformType = 'sine' | 'triangle' | 'square' | 'sawtooth';

interface BaseBlock {
  id: string;
  duration: number;  // seconds
  startTime: number; // seconds from start of timeline (within its channel)
}

export interface AudibleAudioBlock extends BaseBlock {
  isSilent?: false; // Can be omitted or explicitly false
  waveform: WaveformType;
  frequency: number; // Hz
  attack: number; // seconds
  decay: number; // seconds
  sustainLevel: number; // 0.0 to 1.0
  release: number; // seconds
}

export interface SilentAudioBlock extends BaseBlock {
  isSilent: true;
}

export type TemperatureType = 'cool' | 'hot';
export type TemperatureIntensity = 'low' | 'mid' | 'high' | 'rapid'; // Added 'rapid'

export interface TemperatureBlock extends BaseBlock {
  blockRenderType?: 'temperature';
  type: TemperatureType;
  intensity: TemperatureIntensity;
}

export type AudioBlock = AudibleAudioBlock | SilentAudioBlock;

// Add blockRenderType to AudioBlock for consistent handling in combined lists
export type TypedAudioBlock = (AudibleAudioBlock & { blockRenderType?: 'audio' }) | (SilentAudioBlock & { blockRenderType?: 'audio' });


export type AnyBlock = TypedAudioBlock | TemperatureBlock;


export interface Channel {
  id: string;
  name: string;
  channelType: 'audio' | 'thermal'; // Added channel type
  volume: number; // 0.0 to 1.0 (Primarily for audio channels)
  isMuted: boolean; // (Primarily for audio channels)
  audioBlocks: AudioBlock[];
  temperatureBlocks: TemperatureBlock[];
}
