
"use client";

import type React from 'react';
import type { AudioBlock, WaveformType, AudibleAudioBlock, SilentAudioBlock } from '@/types';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Waves, Activity, Square, TrendingUp, MicOffIcon } from 'lucide-react';

interface AudioBlockComponentProps {
  block: AudioBlock;
  isSelected: boolean;
  onClick: () => void;
  pixelsPerSecond: number;
}

const waveformIcons: Record<WaveformType, React.ElementType> = {
  sine: Waves,
  triangle: Activity,
  square: Square,
  sawtooth: TrendingUp,
};

const waveformColors: Record<WaveformType, string> = {
  sine: 'from-blue-400 to-blue-600',
  triangle: 'from-green-400 to-green-600',
  square: 'from-red-400 to-red-600',
  sawtooth: 'from-yellow-400 to-yellow-600',
};

const silentBlockColor = 'from-slate-300 to-slate-500';

export const AudioBlockComponent: React.FC<AudioBlockComponentProps> = ({
  block,
  isSelected,
  onClick,
  pixelsPerSecond,
}) => {
  const width = block.duration * pixelsPerSecond;

  if (block.isSilent) {
    const silentBlock = block as SilentAudioBlock;
    return (
      <Card
        className={cn(
          'h-28 flex flex-col justify-between cursor-pointer transition-all duration-200 ease-in-out shadow-md hover:shadow-lg relative group',
          isSelected ? 'ring-2 ring-primary ring-offset-2 shadow-xl scale-105' : 'hover:scale-[1.02]',
          `bg-gradient-to-br ${silentBlockColor} text-white`
        )}
        style={{ width: `${width}px`, minWidth: `${Math.max(pixelsPerSecond * 0.5, 30)}px` }}
        onClick={onClick}
        role="button"
        aria-pressed={isSelected}
        aria-label={`Silent block, ${silentBlock.duration}s`}
      >
        <CardHeader className="p-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium truncate">
            Silence
          </CardTitle>
          <MicOffIcon className="h-4 w-4 text-white/80" />
        </CardHeader>
        <CardContent className="p-2 text-center flex-grow flex flex-col justify-center">
          <p className="text-lg font-semibold">-</p>
          <p className="text-xs opacity-80">{silentBlock.duration.toFixed(1)} s</p>
        </CardContent>
      </Card>
    );
  }

  const audibleBlock = block as AudibleAudioBlock;
  const Icon = waveformIcons[audibleBlock.waveform];
  const gradientClass = waveformColors[audibleBlock.waveform] || 'from-gray-400 to-gray-600';

  return (
    <Card
      className={cn(
        'h-28 flex flex-col justify-between cursor-pointer transition-all duration-200 ease-in-out shadow-md hover:shadow-lg relative group',
        isSelected ? 'ring-2 ring-primary ring-offset-2 shadow-xl scale-105' : 'hover:scale-[1.02]',
        `bg-gradient-to-br ${gradientClass} text-white`
      )}
      style={{ width: `${width}px`, minWidth: `${Math.max(pixelsPerSecond * 0.5, 30)}px` }}
      onClick={onClick}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Audio block: ${audibleBlock.waveform}, ${audibleBlock.frequency}Hz, ${audibleBlock.duration}s`}
    >
      <CardHeader className="p-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-medium truncate">
          {audibleBlock.waveform.charAt(0).toUpperCase() + audibleBlock.waveform.slice(1)}
        </CardTitle>
        <Icon className="h-4 w-4 text-white/80" />
      </CardHeader>
      <CardContent className="p-2 text-center flex-grow flex flex-col justify-center">
        <p className="text-lg font-semibold">{audibleBlock.frequency} Hz</p>
        <p className="text-xs opacity-80">{audibleBlock.duration.toFixed(1)} s</p>
      </CardContent>
    </Card>
  );
};
