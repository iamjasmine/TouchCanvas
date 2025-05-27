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
    if (Tone.context.state !== 'running') {
      try {
        await Tone.start();
        setAudioContextStarted(true);
        toast({
          title: "Audio Initialized",
          description: "Sound is now enabled.",
        });
      } catch (error) {
        console.error("Failed to start Tone.js audio context:", error);
        toast({
          title: "Audio Error",
          description: "Could not initialize audio. Please try interacting with the page again.",
          variant: "destructive",
        });
      }
    } else {
      setAudioContextStarted(true); // Already running
    }
  }, [toast]);

  return (
    <ToneContext.Provider value={{ audioContextStarted, startAudioContext }}>
      {children}
    </ToneContext.Provider>
  );
};
