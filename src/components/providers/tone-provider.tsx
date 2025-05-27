
"use client";

import type React from 'react';
import { createContext, useContext, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { useToast } from '@/hooks/use-toast';

interface ToneContextType {
  audioContextStarted: boolean;
  startAudioContext: () => Promise<void>;
}

const ToneContext = createContext<ToneContextType | null>(null);

export const useToneContext = () => {
  const context = useContext(ToneContext);
  if (!context) {
    throw new Error('useToneContext must be used within a ToneProvider');
  }
  return context;
};

export const ToneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [audioContextStarted, setAudioContextStarted] = useState(false);
  const { toast } = useToast();

  const startAudioContext = useCallback(async () => {
    console.log('[ToneProvider] Attempting to start audio context. Current state:', Tone.context.state);
    if (Tone.context.state !== 'running') {
      try {
        await Tone.start();
        setAudioContextStarted(true);
        console.log('[ToneProvider] Tone.start() successful. Audio context state:', Tone.context.state);
        console.log('[ToneProvider] Tone.Destination.volume.value (dB):', Tone.Destination.volume.value); // Should be 0 dB for max output from Destination itself
        toast({
          title: "Audio Initialized",
          description: "Sound is now enabled.",
        });
      } catch (error) {
        console.error("[ToneProvider] Failed to start Tone.js audio context:", error);
        toast({
          title: "Audio Error",
          description: "Could not initialize audio. Please try interacting with the page again.",
          variant: "destructive",
        });
      }
    } else {
      setAudioContextStarted(true); // Already running
      console.log('[ToneProvider] Audio context was already running. State:', Tone.context.state);
      if (Tone.Destination) { // Check if Destination is available
         console.log('[ToneProvider] Tone.Destination.volume.value (dB):', Tone.Destination.volume.value);
      } else {
         console.warn('[ToneProvider] Tone.Destination is not available yet to check volume.');
      }
    }
  }, [toast]);

  return (
    <ToneContext.Provider value={{ audioContextStarted, startAudioContext }}>
      {children}
    </ToneContext.Provider>
  );
};

