
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

export interface TemperatureBlock extends BaseBlock {
  type: 'cool' | 'hot';
  intensity: 'low' | 'mid' | 'high';
}

export type AudioBlock = AudibleAudioBlock | SilentAudioBlock;

export type AnyBlock = AudioBlock | TemperatureBlock;

export type TemperatureIntensity = 'low' | 'mid' | 'high';

export interface Channel {
  id: string;
  name: string;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  audioBlocks: AudioBlock[];
  // Future: pan, effects, etc.
  temperatureBlocks: TemperatureBlock[];
}

