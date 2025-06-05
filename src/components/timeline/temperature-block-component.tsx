
import type React from 'react';
import { useState } from 'react';
import type { TemperatureBlock } from '../../types';
import { cn } from '@/lib/utils'; 
import { ThermometerSnowflake, ThermometerSun } from 'lucide-react'; 

interface TemperatureBlockComponentProps {
  block: TemperatureBlock;
  pixelsPerSecond: number;
  heightInRem?: number;
  isSelected?: boolean; 
  onClick?: (event: React.MouseEvent) => void; 
  className?: string;
  channelId: string; // Added for drag data
}

export const TemperatureBlockComponent: React.FC<TemperatureBlockComponentProps> = ({
  block,
  pixelsPerSecond,
  heightInRem = 6, 
  isSelected,
  onClick,
  className,
  channelId,
}) => {
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const width = (Number(block.duration) || 0) * pixelsPerSecond;
  const heightStyle = `${heightInRem}rem`; 

  const Icon = block.type === 'cool' ? ThermometerSnowflake : ThermometerSun;
  const gradientClass = block.type === 'cool' 
    ? 'from-sky-400 to-sky-600' 
    : 'from-orange-400 to-orange-600';

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ 
      blockId: block.id, 
      sourceChannelId: channelId,
      blockType: 'thermal' // Identify block type for drag/drop
    }));
    e.dataTransfer.effectAllowed = 'move';
    setIsBeingDragged(true);
    e.currentTarget.setAttribute('data-block-id', block.id);
  };

  const handleDragEnd = () => {
    setIsBeingDragged(false);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      data-block-id={block.id}
      className={cn(
        'flex flex-col justify-between items-center cursor-pointer transition-all duration-200 ease-in-out shadow-md hover:shadow-lg relative group overflow-hidden text-white p-1.5 rounded-md',
        `bg-gradient-to-br ${gradientClass}`,
        isSelected ? 'ring-2 ring-primary ring-offset-2 shadow-xl scale-105' : 'hover:scale-[1.02]',
        isBeingDragged ? 'opacity-50 ring-2 ring-accent scale-105' : '',
        className
      )}
      style={{ 
        width: `${width}px`, 
        minWidth: `${Math.max(pixelsPerSecond * 0.25, 30)}px`,
        height: heightStyle,
        boxSizing: 'border-box',
      }}
      onClick={onClick}
      role="button"
      aria-pressed={!!isSelected}
      aria-label={`Temperature block: ${block.type} ${block.intensity}, ${block.duration}s`}
    >
      <div className="w-full flex justify-between items-center">
        <span className="text-xs font-medium truncate">
          {block.type.charAt(0).toUpperCase() + block.type.slice(1)}
        </span>
        <Icon className="h-3 w-3 text-white/80" />
      </div>
      <div className="text-center flex-grow flex flex-col justify-center">
        <p className="text-sm font-semibold">{block.intensity.charAt(0).toUpperCase() + block.intensity.slice(1)}</p>
        <p className="text-xs opacity-80">{Number(block.duration).toFixed(1)} s</p>
      </div>
    </div>
  );
};

export default TemperatureBlockComponent;
