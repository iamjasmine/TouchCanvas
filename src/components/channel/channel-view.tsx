
"use client";

import type React from 'react';
import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { Channel, AudioBlock, TemperatureBlock as TemperatureBlockType, AnyBlock } from '@/types';
import { AudioBlockComponent } from '@/components/timeline/audio-block-component';
import { TemperatureBlockComponent } from '@/components/timeline/temperature-block-component';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Volume2Icon, MicIcon, MicOffIcon, Edit3Icon, CheckIcon, XIcon, ListMusicIcon, ThermometerIcon, Trash2Icon, LinkIcon, CheckCircle2Icon, AlertTriangleIcon, Loader2 } from 'lucide-react';
import BluetoothManager from '@/lib/bluetooth.js';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


interface ChannelViewComponentProps {
  channel: Channel;
  isSelected: boolean;
  selectedBlockId: string | null;
  onSelectChannel: (channelId: string) => void;
  onUpdateChannel: (channelId: string, updates: Partial<Pick<Channel, 'name' | 'volume' | 'isMuted'>>) => void;
  onSelectBlock: (channelId: string, blockId: string) => void;
  onReorderBlock: (channelId: string, draggedBlockId: string, targetIndex: number) => void;
  onDeleteChannelRequest: (channelId: string) => void;
  pixelsPerSecond: number;
  currentPlayTime: number;
  isPlaying: boolean;
}

type BluetoothStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnecting';


export const ChannelViewComponent: React.FC<ChannelViewComponentProps> = ({
  channel,
  isSelected,
  selectedBlockId,
  onSelectChannel,
  onUpdateChannel,
  onSelectBlock,
  onReorderBlock,
  onDeleteChannelRequest,
  pixelsPerSecond,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(channel.name);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [bluetoothStatus, setBluetoothStatus] = useState<BluetoothStatus>('idle');
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);

  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    if (channel.channelType === 'thermal') {
      const initialStatus = BluetoothManager.getConnectionStatus();
      if (isMounted.current) {
        setBluetoothStatus(initialStatus.isConnected ? 'connected' : 'idle');
        setConnectedDeviceName(initialStatus.deviceName);
      }

      const handleConnectionChange = (isConnected: boolean, deviceName?: string | null) => {
        if (isMounted.current) {
          setBluetoothStatus(isConnected ? 'connected' : bluetoothStatus === 'connecting' && !isConnected ? 'error' : 'idle');
          setConnectedDeviceName(deviceName || null);
          // Toasting can be done by the action initiator (handleBluetoothAction) for more context
        }
      };
      BluetoothManager.onConnectionChanged(handleConnectionChange);
    }
    return () => {
      isMounted.current = false;
    };
  }, [channel.channelType, toast, bluetoothStatus]);


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

    if (channel.channelType !== blockType) {
        console.warn(`Cannot drop ${blockType} block into ${channel.channelType} channel.`);
        toast({ title: "Drag & Drop Error", description: `Cannot move a ${blockType} block to a ${channel.channelType} channel.`, variant: "destructive"});
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

  const handleBluetoothAction = useCallback(async () => {
    if (channel.channelType !== 'thermal') return;

    if (bluetoothStatus === 'connected') {
      setBluetoothStatus('disconnecting');
      await BluetoothManager.disconnectDevice(); // onConnectionChanged will update status
      toast({ title: "PebbleFeel Disconnecting..." });
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      toast({ title: "Bluetooth Not Supported", description: "Web Bluetooth is not available in this browser.", variant: "destructive" });
      if (isMounted.current) setBluetoothStatus('error');
      return;
    }

    if (isMounted.current) setBluetoothStatus('connecting');
    const result = await BluetoothManager.connectDevice();

    if (isMounted.current) { 
        if (result.success) {
            // onConnectionChanged handles setting to 'connected'
            toast({ title: "PebbleFeel Connected", description: `Device: ${result.deviceName}` });
        } else {
            setBluetoothStatus('error');
            let description = "Failed to connect to PebbleFeel.";
            if (result.error === 'cancelled') description = "Device selection cancelled by user.";
            else if (result.error === 'not_found') description = "PebbleFeel device not found. Ensure it's on and in range.";
            else if (result.error === 'not_allowed') description = "Bluetooth permission denied. Please allow Bluetooth access in your browser.";
            else if (result.error === 'security_error') description = "Bluetooth access is restricted by browser security policy (e.g., in an iframe). Try opening the app in a new tab or window.";
            else if (result.message) description = `Failed to connect: ${result.message}`;
            
            toast({ title: "Connection Failed", description, variant: "destructive" });
        }
    }
  }, [channel.channelType, toast, bluetoothStatus]);


  const getBluetoothButtonConfig = () => {
    switch (bluetoothStatus) {
      case 'connecting':
        return { text: "Connecting...", Icon: Loader2, variant: "outline", className: "text-yellow-500 animate-spin", disabled: true, tooltip: "Attempting to connect..." };
      case 'connected':
        return { text: connectedDeviceName || "Connected", Icon: CheckCircle2Icon, variant: "default", className: "bg-green-500 hover:bg-green-600 text-white", disabled: false, tooltip: `Connected to ${connectedDeviceName || 'PebbleFeel'}. Click to disconnect.` };
      case 'error':
        return { text: "Connection Failed", Icon: AlertTriangleIcon, variant: "destructive", className: "", disabled: false, tooltip: "Connection failed. Click to retry." };
      case 'disconnecting':
        return { text: "Disconnecting...", Icon: Loader2, variant: "outline", className: "text-orange-500 animate-spin", disabled: true, tooltip: "Disconnecting..." };
      case 'idle':
      default:
        return { text: "Connect PebbleFeel", Icon: LinkIcon, variant: "outline", className: "text-blue-500 hover:bg-blue-500/10", disabled: false, tooltip: "Connect to PebbleFeel device" };
    }
  };

  const btButtonConfig = getBluetoothButtonConfig();


  return (
    <Card
      className={cn(
        "flex flex-col p-3 transition-all duration-200 ease-in-out h-32",
        isSelected ? "ring-2 ring-primary shadow-lg bg-muted/50" : "bg-muted/20 hover:bg-muted/30"
      )}
      onClick={() => onSelectChannel(channel.id)}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 flex-grow min-w-0">
         <ChannelIcon className={cn("h-5 w-5 shrink-0", channel.channelType === 'audio' ? "text-blue-500" : "text-orange-500")} />
          {isEditingName ? (
            <div className="flex items-center gap-1 flex-grow min-w-0">
              <Input
                type="text" value={editingName} onChange={handleNameChange} onBlur={saveName}
                onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter') saveName(); if (keyEvent.key === 'Escape') cancelNameEdit(); }}
                className="h-8 text-sm flex-grow" autoFocus onClick={(e) => e.stopPropagation()}
              />
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); saveName(); }} className="h-8 w-8 shrink-0"><CheckIcon className="h-4 w-4"/></Button>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); cancelNameEdit(); }} className="h-8 w-8 shrink-0"><XIcon className="h-4 w-4"/></Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <CardTitle className="text-lg font-semibold hover:text-primary cursor-pointer truncate" onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }}>
                {channel.name}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }} className="h-6 w-6 p-0 shrink-0">
                <Edit3Icon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2 shrink-0 ml-auto">
          {channel.channelType === 'thermal' && (
             <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={btButtonConfig.variant as any}
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleBluetoothAction(); }}
                    disabled={btButtonConfig.disabled}
                    className={cn("h-8 w-auto px-2", btButtonConfig.className)}
                  >
                    <btButtonConfig.Icon className={cn("h-4 w-4", btButtonConfig.text && "mr-1.5")} />
                    {btButtonConfig.text}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{btButtonConfig.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {channel.channelType === 'audio' && (
            <>
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
                className="w-20 md:w-24" onClick={(e) => e.stopPropagation()} aria-label={`${channel.name} volume`}
              />
              <span className="text-xs w-8 text-right">{Math.round(channel.volume * 100)}%</span>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteChannelRequest(channel.id);
            }}
            title="Delete Channel"
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-full w-full whitespace-nowrap rounded-md border border-border bg-background/30 flex-grow">
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="relative py-2 px-2 min-h-[calc(100%-1rem)] flex space-x-2 items-center" 
          style={{
            width: Math.max(
              300,
              displayBlocks.reduce((sum, block) => sum + (Number(block.duration) || 0) * pixelsPerSecond, 0) + pixelsPerSecond * 2 
            ),
          }}
        >
          {displayBlocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
              <p>No blocks. Add to selected {channel.channelType} channel using controls above.</p>
            </div>
          )}
          {displayBlocks.map((block) => {
            if (block.blockRenderType === 'audio') {
              return (
                <AudioBlockComponent
                  key={block.id}
                  block={block as AudioBlock}
                  isSelected={block.id === selectedBlockId && channel.id === (channel.channelType === 'audio' ? channel.id : null)}
                  onClick={(e) => { e.stopPropagation(); onSelectBlock(channel.id, block.id);}}
                  pixelsPerSecond={pixelsPerSecond}
                  heightInRem={5} 
                  channelId={channel.id}
                />
              );
            } else if (block.blockRenderType === 'temperature') {
              return (
                <TemperatureBlockComponent
                  key={block.id}
                  block={block as TemperatureBlockType}
                  isSelected={block.id === selectedBlockId && channel.id === (channel.channelType === 'thermal' ? channel.id : null)}
                  onClick={(e) => { e.stopPropagation(); onSelectBlock(channel.id, block.id);}}
                  pixelsPerSecond={pixelsPerSecond}
                  heightInRem={5} 
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
