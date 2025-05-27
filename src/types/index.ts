export type WaveformType = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface AudioBlock {
  id: string;
  waveform: WaveformType;
  frequency: number; // Hz
  duration: number;  // seconds
  startTime: number; // seconds from start of timeline
}
