
export type WaveformType = 'sine' | 'triangle' | 'square' | 'sawtooth';

interface BaseBlock {
  id: string;
  duration: number;  // seconds
  startTime: number; // seconds from start of timeline
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

export type AudioBlock = AudibleAudioBlock | SilentAudioBlock;

