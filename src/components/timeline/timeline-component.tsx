"use client";

import type React from 'react';
import type { AudioBlock } from '@/types';
import { AudioBlockComponent } from './audio-block-component';
import { PlaybackIndicatorComponent } from './playback-indicator-component';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface TimelineComponentProps {
  blocks: AudioBlock[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  currentPlayTime: number; // in seconds
  isPlaying: boolean;
  pixelsPerSecond: number;
  className?: string;
}

export const TimelineComponent: React.FC<TimelineComponentProps> = ({
  blocks,
  selectedBlockId,
  onSelectBlock,
  currentPlayTime,
  isPlaying,
  pixelsPerSecond,
  className,
}) => {
  const playbackIndicatorPosition = currentPlayTime * pixelsPerSecond;
  const totalTimelineWidth = blocks.reduce((sum, block) => sum + block.duration * pixelsPerSecond, 0);

  return (
    <Card className={cn("p-4 flex-grow h-full overflow-hidden shadow-inner bg-muted/50", className)}>
      <ScrollArea className="h-full w-full whitespace-nowrap rounded-md border border-border">
        <div className="relative py-4 px-2 min-h-[200px]" style={{ width: Math.max(totalTimelineWidth + pixelsPerSecond, 300) /* Ensure minimum width */ }}>
          {blocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <p>No audio blocks yet. Click "Add Audio Block" to get started!</p>
            </div>
          )}
          <div className="flex space-x-2 items-start h-full">
            {blocks.map((block) => (
              <AudioBlockComponent
                key={block.id}
                block={block}
                isSelected={block.id === selectedBlockId}
                onClick={() => onSelectBlock(block.id)}
                pixelsPerSecond={pixelsPerSecond}
              />
            ))}
          </div>
          <PlaybackIndicatorComponent
            position={playbackIndicatorPosition}
            isVisible={isPlaying}
          />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </Card>
  );
};
