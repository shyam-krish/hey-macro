import { useState, useCallback, useRef, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useVoiceInput } from './useVoiceInput';
import { parseFoodInput } from '../services/llm';
import { replaceDailyFoodEntries } from '../services/storage';
import { LLMResponse, DailyLog } from '../types';

export interface StopRecordingOptions {
  todayLog?: DailyLog;
  previousDayLogs?: DailyLog[];
  onTranscript?: (transcript: string) => void; // if provided, skip food parsing (recommendation mode)
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
  const wasBackgroundedDuringProcessing = useRef(false);

  // Monitor app state to detect backgrounding during processing
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      // If app is backgrounded while processing, mark it
      if (nextAppState === 'background' && isProcessing) {
        wasBackgroundedDuringProcessing.current = true;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isProcessing]);

  const stopRecordingAndParse = useCallback(
    async (options?: StopRecordingOptions) => {
      try {
        // stopRecording now waits for final results and returns the transcript
        const finalTranscript = await voiceInput.stopRecording();

        // If no transcript, just silently return - the voice error handler will deal with it
        if (!finalTranscript) {
          return;
        }

        // In recommendation mode, caller handles the transcript directly
        if (options?.onTranscript) {
          options.onTranscript(finalTranscript);
          return;
        }

        cancelledRef.current = false;
        setIsProcessing(true);
        setLlmError(null);

        const result = await parseFoodInput({
          transcript: finalTranscript,
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
          // If app was backgrounded during processing, provide helpful context
          let errorMessage = err instanceof Error ? err.message : 'Failed to parse food input';
          if (wasBackgroundedDuringProcessing.current) {
            errorMessage = 'Request failed because app was backgrounded. Keep the app open while processing.';
          }

          setLlmError(errorMessage);
          wasBackgroundedDuringProcessing.current = false;
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
