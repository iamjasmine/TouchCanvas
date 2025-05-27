"use client";

import type React from 'react';
import type { AudioBlock, WaveformType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PropertyPanelComponentProps {
  selectedBlock: AudioBlock | null;
  onUpdateBlock: (updatedBlock: AudioBlock) => void;
  className?: string;
}

const waveformOptions: WaveformType[] = ['sine', 'triangle', 'square', 'sawtooth'];

export const PropertyPanelComponent: React.FC<PropertyPanelComponentProps> = ({
  selectedBlock,
  onUpdateBlock,
  className,
}) => {
  if (!selectedBlock) {
    return (
      <Card className={cn("p-6 flex flex-col items-center justify-center text-center bg-muted/30 shadow-lg transition-all duration-300 ease-in-out", className)}>
        <CardHeader>
          <CardTitle className="text-xl text-foreground/80">No Block Selected</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Click on an audio block in the timeline to see its properties here.</p>
          <img src="https://placehold.co/200x150.png?text=Select+a+Block" alt="Placeholder for property panel" data-ai-hint="music interface" className="mt-4 rounded-md opacity-70"/>
        </CardContent>
      </Card>
    );
  }

  const handlePropertyChange = <K extends keyof AudioBlock>(property: K, value: AudioBlock[K]) => {
    onUpdateBlock({ ...selectedBlock, [property]: value });
  };
  
  const handleSliderChange = (property: 'frequency' | 'duration', value: number[]) => {
     handlePropertyChange(property, value[0]);
  }


  return (
    <Card className={cn("p-1 bg-gradient-to-br from-accent/10 via-secondary/10 to-primary/10 shadow-xl transition-all duration-300 ease-in-out", className)}>
      <CardContent className="p-5 bg-card rounded-md">
        <CardHeader className="p-0 mb-4">
          <CardTitle className="text-2xl font-semibold text-gradient-primary-accent-secondary">
            Block Properties
          </CardTitle>
          <CardDescription className="text-sm">Adjust the selected audio block.</CardDescription>
        </CardHeader>
        
        <div className="space-y-6">
          <div>
            <Label htmlFor="waveform" className="text-sm font-medium">Waveform</Label>
            <Select
              value={selectedBlock.waveform}
              onValueChange={(value: WaveformType) => handlePropertyChange('waveform', value)}
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
            <Label htmlFor="frequency" className="text-sm font-medium">Frequency ({selectedBlock.frequency.toFixed(0)} Hz)</Label>
            <Slider
              id="frequency"
              min={10}
              max={300}
              step={1}
              value={[selectedBlock.frequency]}
              onValueChange={(value) => handleSliderChange('frequency', value)}
              className="mt-2 data-[state=active]:ring-primary"
            />
          </div>

          <div>
            <Label htmlFor="duration" className="text-sm font-medium">Duration ({selectedBlock.duration.toFixed(1)} s)</Label>
             <Slider
              id="duration"
              min={0.1} // Min duration 0.1s
              max={5}
              step={0.1}
              value={[selectedBlock.duration]}
              onValueChange={(value) => handleSliderChange('duration', value)}
              className="mt-2"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
