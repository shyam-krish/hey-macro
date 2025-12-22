import { useState, useEffect, useCallback } from 'react';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
  SpeechStartEvent,
  SpeechEndEvent,
} from '@react-native-voice/voice';

export interface UseVoiceInputResult {
  isRecording: boolean;
  transcript: string;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  clearTranscript: () => void;
}

export function useVoiceInput(): UseVoiceInputResult {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const onSpeechStart = (e: SpeechStartEvent) => {
    console.log('Speech started', e);
    setIsRecording(true);
    setError(null);
  };

  const onSpeechEnd = (e: SpeechEndEvent) => {
    console.log('Speech ended', e);
    setIsRecording(false);
  };

  const onSpeechResults = (e: SpeechResultsEvent) => {
    console.log('Speech results', e);
    if (e.value && e.value.length > 0) {
      setTranscript(e.value[0]);
    }
  };

  const onSpeechError = async (e: SpeechErrorEvent) => {
    setIsRecording(false);

    // Handle "No speech detected" gracefully - just reset without showing error
    const errorCode = e.error?.code;
    const errorMessage = e.error?.message || '';

    if (errorCode === 'recognition_fail' || errorMessage.includes('No speech detected')) {
      // Silently handle - user just didn't speak, no need to show error
      console.log('No speech detected, resetting...');
      setError(null);
      // Cancel to fully reset the voice recognition state
      try {
        await Voice.cancel();
      } catch (err) {
        // Ignore cancel errors
      }
      return;
    }

    // For other errors, show the error message
    console.error('Speech error', e);
    setError(errorMessage || 'Speech recognition error');
  };

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      await Voice.start('en-US');
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      await Voice.stop();
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    try {
      await Voice.cancel();
      setTranscript('');
    } catch (err) {
      console.error('Error canceling recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel recording');
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isRecording,
    transcript,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearTranscript,
  };
}
