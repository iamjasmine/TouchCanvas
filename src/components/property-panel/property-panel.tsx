"use client";

import type React from 'react';
import type { AudioBlock, WaveformType, AudibleAudioBlock, SilentAudioBlock, TemperatureBlock, AnyBlock, TemperatureType, TemperatureIntensity, Channel } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MicOffIcon, Trash2Icon, Music2Icon, ThermometerIcon, ThermometerSnowflake, ThermometerSun } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PropertyPanelComponentProps {
  selectedBlock: AnyBlock | null;
  selectedChannelType: Channel['channelType'] | null;
  onUpdateBlock: (updatedBlock: AnyBlock) => void;
  onDeleteBlock: (blockId: string) => void;
  className?: string;
  pixelsPerSecond: number;
}

const waveformOptions: WaveformType[] = ['sine', 'triangle', 'square', 'sawtooth'];
const temperatureModeOptions: TemperatureType[] = ['cool', 'hot'];
const coolIntensityOptions: TemperatureIntensity[] = ['rapid', 'high', 'mid', 'low'];
const hotIntensityOptions: TemperatureIntensity[] = ['high', 'mid', 'low'];


const formatPercentage = (value: number) => `${(value * 100).toFixed(0)}%`;
const formatSeconds = (value: number) => `${value.toFixed(2)}s`;

export const PropertyPanelComponent: React.FC<PropertyPanelComponentProps> = ({
  selectedBlock,
  selectedChannelType,
  onUpdateBlock,
  onDeleteBlock,
  className,
}) => {
  if (!selectedBlock) {
    return (
      <Card className={cn("p-6 flex flex-col items-center justify-center text-center bg-muted/30 shadow-lg transition-all duration-300 ease-in-out min-h-[400px]", className)}>
        <CardHeader>
          <Music2Icon className="h-16 w-16 text-primary mx-auto mb-4" />
          <CardTitle className="text-xl text-foreground/80">Block Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select a block from a channel's timeline to view and edit its properties here.
          </p>
          <img src="https://placehold.co/200x150.png?text=Select+Block" alt="Placeholder for property panel" data-ai-hint="music interface abstract" className="mt-4 rounded-md opacity-50"/>
        </CardContent>
      </Card>
    );
  }

  const handleDelete = () => {
    if (selectedBlock) {
      onDeleteBlock(selectedBlock.id);
    }
  };

  // Audio Block (Silent)
  if (selectedChannelType === 'audio' && 'isSilent' in selectedBlock && selectedBlock.isSilent) {
    const silentBlock = selectedBlock as SilentAudioBlock;
    return (
      <Card className={cn("p-1 bg-gradient-to-br from-slate-500/10 via-slate-400/10 to-slate-300/10 shadow-xl transition-all duration-300 ease-in-out min-h-[400px]", className)}>
        <CardContent className="p-5 bg-card rounded-md h-full flex flex-col">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="text-2xl font-semibold text-gradient-primary-accent-secondary flex items-center">
              <MicOffIcon className="mr-2 h-6 w-6" /> Silent Block
            </CardTitle>
            <CardDescription className="text-sm">Adjust the duration of this silence.</CardDescription>
          </CardHeader>

          <div className="space-y-6 flex-grow">
            <div>
              <Label htmlFor="duration-silent" className="text-sm font-medium">Duration ({silentBlock.duration.toFixed(1)} s)</Label>
               <Slider
                id="duration-silent"
                min={0.1}
                max={10}
                step={0.1}
                value={[silentBlock.duration]}
                onValueChange={(value) => onUpdateBlock({ ...silentBlock, duration: value[0], blockRenderType: 'audio' })}
                className="mt-2"
              />
            </div>
          </div>
          <Button onClick={handleDelete} variant="destructive" className="w-full mt-auto">
            <Trash2Icon className="mr-2 h-4 w-4" /> Delete Block
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Audio Block (Audible)
  if (selectedChannelType === 'audio' && 'waveform' in selectedBlock) {
    const audibleBlock = selectedBlock as AudibleAudioBlock;
    const handleAudiblePropertyChange = (property: keyof Omit<AudibleAudioBlock, 'id' | 'startTime' | 'isSilent'>, value: any) => {
      onUpdateBlock({ ...audibleBlock, [property]: value, blockRenderType: 'audio' });
    };
    const handleAudibleSliderChange = (property: keyof Pick<AudibleAudioBlock, 'frequency' | 'duration' | 'attack' | 'decay' | 'sustainLevel' | 'release'>, value: number[]) => {
       handleAudiblePropertyChange(property, value[0]);
    };
     const adsrTooltip = (label: string, description: string, children: React.ReactNode) => (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
          <TooltipContent>
            <p className="font-semibold">{label}</p>
            <p className="text-xs">{description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    return (
      <Card className={cn("p-1 bg-gradient-to-br from-accent/10 via-secondary/10 to-primary/10 shadow-xl transition-all duration-300 ease-in-out min-h-[400px]", className)}>
        <CardContent className="p-5 bg-card rounded-md h-full flex flex-col">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="text-2xl font-semibold text-gradient-primary-accent-secondary">
              Audio Block Properties
            </CardTitle>
            <CardDescription className="text-sm">Adjust the selected audio block.</CardDescription>
          </CardHeader>

          <div className="space-y-5 flex-grow overflow-y-auto pr-2">
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
                id="frequency" min={10} max={300} step={1}
                value={[audibleBlock.frequency]}
                onValueChange={(value) => handleAudibleSliderChange('frequency', value)}
                className="mt-2 data-[state=active]:ring-primary"
              />
            </div>
            <div>
              <Label htmlFor="duration-audible" className="text-sm font-medium">Duration ({formatSeconds(audibleBlock.duration)})</Label>
               <Slider
                id="duration-audible" min={0.1} max={10} step={0.01}
                value={[audibleBlock.duration]}
                onValueChange={(value) => handleAudibleSliderChange('duration', value)}
                className="mt-2"
              />
            </div>
            <div className="space-y-1 pt-2 border-t mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Envelope (ADSR)</h4>
              <div>
                {adsrTooltip("Fade In (Attack)", "Time for sound to reach full volume.",
                  <Label htmlFor="attack" className="text-xs font-medium flex items-center">
                    <span className="mr-1 text-base">↗️</span>Fade In ({formatSeconds(audibleBlock.attack)}, {audibleBlock.duration > 0 ? formatPercentage(audibleBlock.attack / audibleBlock.duration) : 'N/A'})
                  </Label>
                )}
                <Slider
                  id="attack" min={0} max={audibleBlock.duration} step={0.01}
                  value={[audibleBlock.attack]}
                  onValueChange={(value) => handleAudibleSliderChange('attack', value)} className="mt-1"
                />
              </div>
              <div>
                {adsrTooltip("Volume Drop (Decay)", "Time for sound to drop to sustain level.",
                  <Label htmlFor="decay" className="text-xs font-medium flex items-center">
                    <span className="mr-1 text-base">↘️</span>Volume Drop ({formatSeconds(audibleBlock.decay)}, {audibleBlock.duration > 0 ? formatPercentage(audibleBlock.decay / audibleBlock.duration) : 'N/A'})
                  </Label>
                )}
                <Slider
                  id="decay" min={0} max={audibleBlock.duration} step={0.01}
                  value={[audibleBlock.decay]}
                  onValueChange={(value) => handleAudibleSliderChange('decay', value)} className="mt-1"
                />
              </div>
              <div>
                {adsrTooltip("Hold Level (Sustain)", "Volume level while the sound is held.",
                  <Label htmlFor="sustainLevel" className="text-xs font-medium flex items-center">
                    <span className="mr-1 text-base">➡️</span>Hold Level ({formatPercentage(audibleBlock.sustainLevel)})
                  </Label>
                )}
                <Slider
                  id="sustainLevel" min={0} max={1} step={0.01}
                  value={[audibleBlock.sustainLevel]}
                  onValueChange={(value) => handleAudibleSliderChange('sustainLevel', value)} className="mt-1"
                />
              </div>
              <div>
                {adsrTooltip("Fade Out (Release)", "Time for sound to fade to silence at the end.",
                  <Label htmlFor="release" className="text-xs font-medium flex items-center">
                    <span className="mr-1 text-base">↘️</span>Fade Out ({formatSeconds(audibleBlock.release)}, {audibleBlock.duration > 0 ? formatPercentage(audibleBlock.release / audibleBlock.duration) : 'N/A'})
                  </Label>
                )}
                <Slider
                  id="release" min={0} max={audibleBlock.duration} step={0.01}
                  value={[audibleBlock.release]}
                  onValueChange={(value) => handleAudibleSliderChange('release', value)} className="mt-1"
                />
              </div>
            </div>
          </div>
          <Button onClick={handleDelete} variant="destructive" className="w-full mt-auto pt-3">
            <Trash2Icon className="mr-2 h-4 w-4" /> Delete Block
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Temperature Block
  if (selectedChannelType === 'thermal' && 'type' in selectedBlock) {
    const tempBlock = selectedBlock as TemperatureBlock;
    const currentIntensityOptions = tempBlock.type === 'cool' ? coolIntensityOptions : hotIntensityOptions;

    const handleTemperaturePropertyChange = (property: keyof Omit<TemperatureBlock, 'id' | 'startTime' | 'blockRenderType'>, value: any) => {
      let newBlockData = { ...tempBlock, [property]: value, blockRenderType: 'temperature' as const };
      // If changing type from cool to hot and intensity was 'rapid', reset intensity
      if (property === 'type' && value === 'hot' && tempBlock.intensity === 'rapid') {
        newBlockData.intensity = 'low'; // Default to 'low' or another appropriate value for 'hot'
      }
      onUpdateBlock(newBlockData);
    };

    return (
      <Card className={cn("p-1 bg-gradient-to-br from-sky-500/10 via-orange-400/10 to-red-500/10 shadow-xl transition-all duration-300 ease-in-out min-h-[400px]", className)}>
        <CardContent className="p-5 bg-card rounded-md h-full flex flex-col">
          <CardHeader className="p-0 mb-4">
             <CardTitle className="text-2xl font-semibold text-gradient-primary-accent-secondary flex items-center">
              {tempBlock.type === 'cool' ? <ThermometerSnowflake className="mr-2 h-6 w-6 text-blue-500" /> : <ThermometerSun className="mr-2 h-6 w-6 text-orange-500" />}
              Temperature Block
            </CardTitle>
            <CardDescription className="text-sm">Adjust temperature settings.</CardDescription>
          </CardHeader>

          <div className="space-y-6 flex-grow">
            <div>
              <Label htmlFor="temperature-mode" className="text-sm font-medium">Mode</Label>
              <Select
                value={tempBlock.type}
                onValueChange={(value: TemperatureType) => handleTemperaturePropertyChange('type', value)}
              >
                <SelectTrigger id="temperature-mode" className="mt-1">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {temperatureModeOptions.map((option) => (
                    <SelectItem key={option} value={option} className="capitalize">
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Intensity</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {currentIntensityOptions.map(intensity => (
                  <Button
                    key={intensity}
                    variant={tempBlock.intensity === intensity ? 'default' : 'outline'}
                    onClick={() => handleTemperaturePropertyChange('intensity', intensity)}
                    className="capitalize"
                  >
                    {intensity}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Duration (seconds)</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    min={0}
                    max={15}
                    step={0.1}
                    value={[tempBlock.duration]}
                    onValueChange={(value) => handleTemperaturePropertyChange('duration', value[0])}
                    className="flex-grow"
                  />
                  <span className="text-sm w-12 text-right">{tempBlock.duration.toFixed(1)}s</span>
                </div>
              </div>
            </div>
          </div>
          <Button onClick={handleDelete} variant="destructive" className="w-full mt-auto">
            <Trash2Icon className="mr-2 h-4 w-4" /> Delete Block
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Fallback if block type is unknown or doesn't match channel type
  return (
    <Card className={cn("p-6 flex flex-col items-center justify-center text-center bg-muted/30 shadow-lg", className)}>
      <CardHeader><CardTitle className="text-xl text-foreground/80">Invalid Block</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">The selected block type is not recognized or doesn't match the channel type.</p></CardContent>
    </Card>
  );
};
