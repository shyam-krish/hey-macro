import { useState, useCallback, useRef } from 'react';
import { useVoiceInput } from './useVoiceInput';
import { parseFoodInput } from '../services/llm';
import { replaceDailyFoodEntries } from '../services/storage';
import { LLMResponse, DailyLog } from '../types';

export interface StopRecordingOptions {
  todayLog?: DailyLog;
  previousDayLogs?: DailyLog[];
}

export interface UseVoiceFoodLoggerResult {
  isRecording: boolean;
  isProcessing: boolean;
  transcript: string;
  parsedFood: LLMResponse | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecordingAndParse: (options?: StopRecordingOptions) => Promise<void>;
  saveParsedFood: (dailyLogID: string, userID: string) => Promise<void>;
  cancelRecording: () => void;
  cancelProcessing: () => void;
  reset: () => void;
}

export function useVoiceFoodLogger(): UseVoiceFoodLoggerResult {
  const voiceInput = useVoiceInput();
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedFood, setParsedFood] = useState<LLMResponse | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const stopRecordingAndParse = useCallback(
    async (options?: StopRecordingOptions) => {
      try {
        await voiceInput.stopRecording();

        // If no transcript, just silently return - the voice error handler will deal with it
        if (!voiceInput.transcript) {
          return;
        }

        console.log(`[Voice] 🎤 Voice input received at ${new Date().toISOString()}`);
        console.log(`[Voice] Transcript: "${voiceInput.transcript}"`);

        cancelledRef.current = false;
        setIsProcessing(true);
        setLlmError(null);

        const result = await parseFoodInput({
          transcript: voiceInput.transcript,
          currentTime: new Date(),
          todayLog: options?.todayLog,
          previousDayLogs: options?.previousDayLogs,
        });

        // Check if cancelled before setting result
        if (!cancelledRef.current) {
          setParsedFood(result);
        }
      } catch (err) {
        if (!cancelledRef.current) {
          console.error('Error parsing food:', err);
          setLlmError(err instanceof Error ? err.message : 'Failed to parse food input');
        }
      } finally {
        if (!cancelledRef.current) {
          setIsProcessing(false);
        }
      }
    },
    [voiceInput]
  );

  const saveParsedFood = useCallback(
    async (dailyLogID: string, userID: string): Promise<void> => {
      if (!parsedFood) return;
      await replaceDailyFoodEntries(userID, dailyLogID, parsedFood);
    },
    [parsedFood]
  );

  const reset = useCallback(() => {
    voiceInput.clearTranscript();
    setParsedFood(null);
    setLlmError(null);
  }, [voiceInput]);

  const cancelRecording = useCallback(() => {
    voiceInput.cancelRecording();
    reset();
  }, [voiceInput, reset]);

  const cancelProcessing = useCallback(() => {
    cancelledRef.current = true;
    setIsProcessing(false);
    setLlmError(null);
    setParsedFood(null);
  }, []);

  return {
    isRecording: voiceInput.isRecording,
    isProcessing,
    transcript: voiceInput.transcript,
    parsedFood,
    error: voiceInput.error || llmError,
    startRecording: voiceInput.startRecording,
    stopRecordingAndParse,
    saveParsedFood,
    cancelRecording,
    cancelProcessing,
    reset,
  };
}
