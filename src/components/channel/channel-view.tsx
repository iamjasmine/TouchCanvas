
"use client";

import type React from 'react';
import { useState, useRef, useMemo } from 'react';
import type { Channel, AudioBlock, TemperatureBlock as TemperatureBlockType, TypedAudioBlock, AnyBlock } from '@/types';
import { AudioBlockComponent } from '@/components/timeline/audio-block-component';
import { TemperatureBlockComponent } from '@/components/timeline/temperature-block-component';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Volume2Icon, MicIcon, MicOffIcon, Edit3Icon, CheckIcon, XIcon, ListMusicIcon, ThermometerIcon } from 'lucide-react';


interface ChannelViewComponentProps {
  channel: Channel;
  isSelected: boolean;
  selectedBlockId: string | null;
  onSelectChannel: (channelId: string) => void;
  onUpdateChannel: (channelId: string, updates: Partial<Pick<Channel, 'name' | 'volume' | 'isMuted'>>) => void;
  onSelectBlock: (channelId: string, blockId: string) => void;
  onReorderBlock: (channelId: string, draggedBlockId: string, targetIndex: number) => void;
  pixelsPerSecond: number;
  currentPlayTime: number;
  isPlaying: boolean;
}

export const ChannelViewComponent: React.FC<ChannelViewComponentProps> = ({
  channel,
  isSelected,
  selectedBlockId,
  onSelectChannel,
  onUpdateChannel,
  onSelectBlock,
  onReorderBlock,
  pixelsPerSecond,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(channel.name);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingName(e.target.value);
  };

  const saveName = () => {
    if (editingName.trim() !== '') {
      onUpdateChannel(channel.id, { name: editingName.trim() });
    } else {
      setEditingName(channel.name);
    }
    setIsEditingName(false);
  };

  const cancelNameEdit = () => {
    setEditingName(channel.name);
    setIsEditingName(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const transferData = e.dataTransfer.getData('application/json');
    if (!transferData) return;

    const { blockId: draggedBlockId, sourceChannelId, blockType } = JSON.parse(transferData);

    if (sourceChannelId !== channel.id) {
        console.warn("Inter-channel drag and drop not yet fully supported for different block types.");
        return;
    }
     if (channel.channelType !== blockType) {
        console.warn(`Cannot drop ${blockType} block into ${channel.channelType} channel.`);
        return;
    }

    if (!draggedBlockId || !dropZoneRef.current) return;

    const dropZone = dropZoneRef.current;
    const clientX = e.clientX;
    const currentBlocksList = channel.channelType === 'audio' ? channel.audioBlocks : channel.temperatureBlocks;
    let targetIndex = currentBlocksList.length;

    const blockElements = Array.from(dropZone.children) as HTMLElement[];
    for (let i = 0; i < blockElements.length; i++) {
      const blockElement = blockElements[i];
      if (!blockElement.hasAttribute('draggable') || !blockElement.dataset.blockId) continue;
      const rect = blockElement.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      if (clientX < midpoint) {
        targetIndex = i;
        break;
      }
    }
    onReorderBlock(channel.id, draggedBlockId, targetIndex);
  };

  const displayBlocks: AnyBlock[] = useMemo(() => {
    if (channel.channelType === 'audio') {
      return channel.audioBlocks.map(b => ({ ...b, blockRenderType: 'audio' as const }));
    } else if (channel.channelType === 'thermal') {
      return channel.temperatureBlocks.map(b => ({ ...b, blockRenderType: 'temperature' as const }));
    }
    return [];
  }, [channel]);


  const ChannelIcon = channel.channelType === 'audio' ? ListMusicIcon : ThermometerIcon;

  return (
    <Card
      className={cn(
        "flex flex-col p-3 transition-all duration-200 ease-in-out h-32",
        isSelected ? "ring-2 ring-primary shadow-lg bg-muted/50" : "bg-muted/20 hover:bg-muted/30"
      )}
      onClick={() => onSelectChannel(channel.id)}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 flex-grow">
         <ChannelIcon className={cn("h-5 w-5", channel.channelType === 'audio' ? "text-blue-500" : "text-orange-500")} />
          {isEditingName ? (
            <>
              <Input
                type="text" value={editingName} onChange={handleNameChange} onBlur={saveName}
                onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter') saveName(); if (keyEvent.key === 'Escape') cancelNameEdit(); }}
                className="h-8 text-sm" autoFocus onClick={(e) => e.stopPropagation()}
              />
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); saveName(); }} className="h-8 w-8"><CheckIcon className="h-4 w-4"/></Button>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); cancelNameEdit(); }} className="h-8 w-8"><XIcon className="h-4 w-4"/></Button>
            </>
          ) : (
            <>
              <CardTitle className="text-lg font-semibold hover:text-primary cursor-pointer" onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }}>
                {channel.name}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }} className="h-6 w-6 p-0">
                <Edit3Icon className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        {channel.channelType === 'audio' && (
          <div className="flex items-center space-x-2 shrink-0 min-w-[200px]">
            <Button
              variant={channel.isMuted ? "destructive" : "outline"} size="icon"
              onClick={(e) => { e.stopPropagation(); onUpdateChannel(channel.id, { isMuted: !channel.isMuted }); }}
              className="h-8 w-8" title={channel.isMuted ? "Unmute Channel" : "Mute Channel"}
            >
              {channel.isMuted ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
            </Button>
            <Volume2Icon className="h-5 w-5 text-muted-foreground" />
            <Slider
              min={0} max={1} step={0.01} value={[channel.volume]}
              onValueChange={(value) => onUpdateChannel(channel.id, { volume: value[0] })}
              className="w-24" onClick={(e) => e.stopPropagation()} aria-label={`${channel.name} volume`}
            />
            <span className="text-xs w-8 text-right">{Math.round(channel.volume * 100)}%</span>
          </div>
        )}
         {channel.channelType === 'thermal' && (
          <div className="flex items-center space-x-2 shrink-0 min-w-[200px] text-sm text-muted-foreground">
            (Thermal Controls Area)
          </div>
        )}
      </div>

      <ScrollArea className="h-full w-full whitespace-nowrap rounded-md border border-border bg-background/30 flex-grow">
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="relative py-2 px-2 min-h-[80px] flex space-x-2 items-center"
          style={{
            width: Math.max(
              300,
              displayBlocks.reduce((sum, block) => sum + (Number(block.duration) || 0) * pixelsPerSecond, 0) + pixelsPerSecond
            ),
          }}
        >
          {displayBlocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
              <p>No blocks. Add to selected {channel.channelType} channel.</p>
            </div>
          )}
          {displayBlocks.map((block) => {
            if (block.blockRenderType === 'audio') {
              return (
                <AudioBlockComponent
                  key={block.id}
                  block={block as AudioBlock} // Type assertion
                  isSelected={block.id === selectedBlockId && channel.channelType === 'audio'}
                  onClick={(e) => { e.stopPropagation(); onSelectBlock(channel.id, block.id);}}
                  pixelsPerSecond={pixelsPerSecond}
                  heightInRem={6}
                  channelId={channel.id}
                />
              );
            } else if (block.blockRenderType === 'temperature') {
              return (
                <TemperatureBlockComponent
                  key={block.id}
                  block={block as TemperatureBlockType} // Type assertion
                  isSelected={block.id === selectedBlockId && channel.channelType === 'thermal'}
                  onClick={(e) => { e.stopPropagation(); onSelectBlock(channel.id, block.id);}}
                  pixelsPerSecond={pixelsPerSecond}
                  heightInRem={6}
                  channelId={channel.id}
                />
              );
            }
            return null;
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </Card>
  );
};
