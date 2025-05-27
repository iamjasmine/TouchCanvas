
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
}

export interface SilentAudioBlock extends BaseBlock {
  isSilent: true;
}

export type AudioBlock = AudibleAudioBlock | SilentAudioBlock;
