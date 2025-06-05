
"use client";

import type React from 'react';
import { useState } from 'react';
import type { AudioBlock, WaveformType, AudibleAudioBlock, SilentAudioBlock } from '@/types';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Waves, Activity, Square, TrendingUp, MicOffIcon } from 'lucide-react';

interface AudioBlockComponentProps {
  block: AudioBlock;
  isSelected: boolean;
  onClick: (event: React.MouseEvent) => void;
  pixelsPerSecond: number;
  heightInRem?: number;
  className?: string;
  channelId: string; // Added for drag data if needed, though not strictly for intra-channel
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

const ADSR_VISUAL_HEIGHT = 20;

const AdsrVisualizer: React.FC<{ block: AudibleAudioBlock; widthInPixels: number }> = ({ block, widthInPixels }) => {
  const { duration, attack, decay, sustainLevel, release } = block;

  if (duration <= 0) return null;

  const y_bottom = ADSR_VISUAL_HEIGHT;
  const y_peak = 0;
  const y_sustain = (1 - sustainLevel) * ADSR_VISUAL_HEIGHT;

  const timeToPx = (time: number) => (time / duration) * widthInPixels;

  const x_start = 0;
  const x_attack_end = timeToPx(attack);
  const x_decay_end = timeToPx(attack + decay);
  const x_release_start = timeToPx(duration - release);
  const x_end = timeToPx(duration);

  const p1x = Math.max(x_start, Math.min(x_attack_end, widthInPixels));
  const p2x = Math.max(p1x, Math.min(x_decay_end, widthInPixels));
  const p3x = Math.max(p2x, Math.min(x_release_start, widthInPixels));
  const p4x = Math.max(p3x, Math.min(x_end, widthInPixels));

  const pathData = `M ${x_start},${y_bottom} L ${p1x},${y_peak} L ${p2x},${y_sustain} L ${p3x},${y_sustain} L ${p4x},${y_bottom}`;

  return (
    <svg
      width="100%"
      height={ADSR_VISUAL_HEIGHT}
      viewBox={`0 0 ${widthInPixels} ${ADSR_VISUAL_HEIGHT}`}
      preserveAspectRatio="none"
      className="absolute bottom-1 left-0 w-full pointer-events-none"
      style={{ opacity: 0.33 }}
    >
      <path d={pathData} fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
    </svg>
  );
};

export const AudioBlockComponent: React.FC<AudioBlockComponentProps> = ({
  block,
  isSelected,
  onClick,
  pixelsPerSecond,
  heightInRem = 7,
  className,
  channelId,
}) => {
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const width = block.duration * pixelsPerSecond;
  const heightClass = `h-${heightInRem * 4}`;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ blockId: block.id, sourceChannelId: channelId }));
    e.dataTransfer.effectAllowed = 'move';
    setIsBeingDragged(true);
  };

  const handleDragEnd = () => {
    setIsBeingDragged(false);
  };

  if (block.isSilent) {
    const silentBlock = block as SilentAudioBlock;
    return (
      <Card
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={cn(
          heightClass,
          'flex flex-col justify-between cursor-pointer transition-all duration-200 ease-in-out shadow-md hover:shadow-lg relative group',
          isSelected ? 'ring-2 ring-primary ring-offset-2 shadow-xl scale-105' : 'hover:scale-[1.02]',
          isBeingDragged ? 'opacity-50 ring-2 ring-accent scale-105' : '',
          `bg-gradient-to-br ${silentBlockColor} text-white`,
          className
        )}
        style={{ width: `${width}px`, minWidth: `${Math.max(pixelsPerSecond * 0.25, 30)}px` }}
        onClick={onClick}
        role="button"
        aria-pressed={isSelected}
        aria-label={`Silent block, ${silentBlock.duration}s`}
      >
        <CardHeader className="p-1.5 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium truncate">
            Silence
          </CardTitle>
          <MicOffIcon className="h-3 w-3 text-white/80" />
        </CardHeader>
        <CardContent className="p-1.5 text-center flex-grow flex flex-col justify-center">
          <p className="text-sm font-semibold">-</p>
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
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn(
        heightClass,
        'flex flex-col justify-between cursor-pointer transition-all duration-200 ease-in-out shadow-md hover:shadow-lg relative group overflow-hidden',
        isSelected ? 'ring-2 ring-primary ring-offset-2 shadow-xl scale-105' : 'hover:scale-[1.02]',
        isBeingDragged ? 'opacity-50 ring-2 ring-accent scale-105' : '',
        `bg-gradient-to-br ${gradientClass} text-white`,
        className
      )}
      style={{ width: `${width}px`, minWidth: `${Math.max(pixelsPerSecond * 0.25, 30)}px` }}
      onClick={onClick}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Audio block: ${audibleBlock.waveform}, ${audibleBlock.frequency}Hz, ${audibleBlock.duration}s`}
    >
      <CardHeader className="p-1.5 flex-row items-center justify-between space-y-0 z-10">
        <CardTitle className="text-xs font-medium truncate">
          {audibleBlock.waveform.charAt(0).toUpperCase() + audibleBlock.waveform.slice(1)}
        </CardTitle>
        <Icon className="h-3 w-3 text-white/80" />
      </CardHeader>
      <CardContent className="p-1.5 text-center flex-grow flex flex-col justify-center z-10">
        <p className="text-sm font-semibold">{audibleBlock.frequency} Hz</p>
        <p className="text-xs opacity-80">{audibleBlock.duration.toFixed(1)} s</p>
      </CardContent>
      {width > 0 && <AdsrVisualizer block={audibleBlock} widthInPixels={width} />}
    </Card>
  );
};

