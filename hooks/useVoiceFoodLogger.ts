import { useState, useCallback } from 'react';
import { useVoiceInput } from './useVoiceInput';
import { parseFoodInput } from '../services/llm';
import { LLMResponse, DailyLog } from '../types';

export interface UseVoiceFoodLoggerResult {
  isRecording: boolean;
  isProcessing: boolean;
  transcript: string;
  parsedFood: LLMResponse | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecordingAndParse: (previousDayLog?: DailyLog) => Promise<void>;
  cancelRecording: () => void;
  reset: () => void;
}

export function useVoiceFoodLogger(): UseVoiceFoodLoggerResult {
  const voiceInput = useVoiceInput();
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedFood, setParsedFood] = useState<LLMResponse | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);

  const stopRecordingAndParse = useCallback(
    async (previousDayLog?: DailyLog) => {
      try {
        await voiceInput.stopRecording();

        if (!voiceInput.transcript) {
          setLlmError('No speech detected. Please try again.');
          return;
        }

        setIsProcessing(true);
        setLlmError(null);

        const result = await parseFoodInput({
          transcript: voiceInput.transcript,
          currentTime: new Date(),
          previousDayLog,
        });

        setParsedFood(result);
      } catch (err) {
        console.error('Error parsing food:', err);
        setLlmError(err instanceof Error ? err.message : 'Failed to parse food input');
      } finally {
        setIsProcessing(false);
      }
    },
    [voiceInput]
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

  return {
    isRecording: voiceInput.isRecording,
    isProcessing,
    transcript: voiceInput.transcript,
    parsedFood,
    error: voiceInput.error || llmError,
    startRecording: voiceInput.startRecording,
    stopRecordingAndParse,
    cancelRecording,
    reset,
  };
}
