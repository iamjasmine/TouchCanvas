
"use client";

import type React from 'react';
import type { AudioBlock, WaveformType, AudibleAudioBlock, SilentAudioBlock } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MicOffIcon, Trash2Icon } from 'lucide-react';

interface PropertyPanelComponentProps {
  selectedBlock: AudioBlock | null;
  onUpdateBlock: (updatedBlock: AudioBlock) => void;
  onDeleteBlock: (blockId: string) => void;
  className?: string;
}

const waveformOptions: WaveformType[] = ['sine', 'triangle', 'square', 'sawtooth'];

export const PropertyPanelComponent: React.FC<PropertyPanelComponentProps> = ({
  selectedBlock,
  onUpdateBlock,
  onDeleteBlock,
  className,
}) => {
  if (!selectedBlock) {
    return (
      <Card className={cn("p-6 flex flex-col items-center justify-center text-center bg-muted/30 shadow-lg transition-all duration-300 ease-in-out", className)}>
        <CardHeader>
          <CardTitle className="text-xl text-foreground/80">No Block Selected</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Click on a block in the timeline to see its properties.</p>
          <img src="https://placehold.co/200x150.png?text=Select+a+Block" alt="Placeholder for property panel" data-ai-hint="music interface" className="mt-4 rounded-md opacity-70"/>
        </CardContent>
      </Card>
    );
  }

  const handleDelete = () => {
    if (selectedBlock) {
      onDeleteBlock(selectedBlock.id);
    }
  };

  // Handle Silent Blocks
  if (selectedBlock.isSilent) {
    const silentBlock = selectedBlock as SilentAudioBlock;
    return (
      <Card className={cn("p-1 bg-gradient-to-br from-slate-500/10 via-slate-400/10 to-slate-300/10 shadow-xl transition-all duration-300 ease-in-out", className)}>
        <CardContent className="p-5 bg-card rounded-md">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="text-2xl font-semibold text-gradient-primary-accent-secondary flex items-center">
              <MicOffIcon className="mr-2 h-6 w-6" /> Silent Block
            </CardTitle>
            <CardDescription className="text-sm">Adjust the duration of this silence.</CardDescription>
          </CardHeader>
          
          <div className="space-y-6">
            <div>
              <Label htmlFor="duration-silent" className="text-sm font-medium">Duration ({silentBlock.duration.toFixed(1)} s)</Label>
               <Slider
                id="duration-silent"
                min={0.1} 
                max={10} // Increased max duration for silence
                step={0.1}
                value={[silentBlock.duration]}
                onValueChange={(value) => onUpdateBlock({ ...silentBlock, duration: value[0] })}
                className="mt-2"
              />
            </div>
            <Button onClick={handleDelete} variant="destructive" className="w-full mt-4">
              <Trash2Icon className="mr-2 h-4 w-4" />
              Delete Block
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Handle Audible Blocks
  const audibleBlock = selectedBlock as AudibleAudioBlock;

  const handleAudiblePropertyChange = (property: keyof Omit<AudibleAudioBlock, 'id' | 'startTime' | 'isSilent'>, value: any) => {
    onUpdateBlock({ ...audibleBlock, [property]: value });
  };
  
  const handleAudibleSliderChange = (property: 'frequency' | 'duration', value: number[]) => {
     handleAudiblePropertyChange(property, value[0]);
  };

  return (
    <Card className={cn("p-1 bg-gradient-to-br from-accent/10 via-secondary/10 to-primary/10 shadow-xl transition-all duration-300 ease-in-out", className)}>
      <CardContent className="p-5 bg-card rounded-md">
        <CardHeader className="p-0 mb-4">
          <CardTitle className="text-2xl font-semibold text-gradient-primary-accent-secondary">
            Audio Block Properties
          </CardTitle>
          <CardDescription className="text-sm">Adjust the selected audio block.</CardDescription>
        </CardHeader>
        
        <div className="space-y-6">
          <div>
            <Label htmlFor="waveform" className="text-sm font-medium">Waveform</Label>
            <Select
              value={audibleBlock.waveform}
              onValueChange={(value: WaveformType) => handleAudiblePropertyChange('waveform', value)}
            >
              <SelectTrigger id="waveform" className="mt-1">
                <SelectValue placeholder="Select waveform" />
              </SelectTrigger>
              <SelectContent>
                {waveformOptions.map((option) => (
                  <SelectItem key={option} value={option} className="capitalize">
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="frequency" className="text-sm font-medium">Frequency ({audibleBlock.frequency.toFixed(0)} Hz)</Label>
            <Slider
              id="frequency"
              min={10}
              max={300}
              step={1}
              value={[audibleBlock.frequency]}
              onValueChange={(value) => handleAudibleSliderChange('frequency', value)}
              className="mt-2 data-[state=active]:ring-primary"
            />
          </div>

          <div>
            <Label htmlFor="duration-audible" className="text-sm font-medium">Duration ({audibleBlock.duration.toFixed(1)} s)</Label>
             <Slider
              id="duration-audible"
              min={0.1}
              max={5}
              step={0.1}
              value={[audibleBlock.duration]}
              onValueChange={(value) => handleAudibleSliderChange('duration', value)}
              className="mt-2"
            />
          </div>
          <Button onClick={handleDelete} variant="destructive" className="w-full mt-4">
            <Trash2Icon className="mr-2 h-4 w-4" />
            Delete Block
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
