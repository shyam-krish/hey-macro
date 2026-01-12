import { useState, useEffect, useCallback, useRef } from 'react';
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
  stopRecording: () => Promise<string>;
  cancelRecording: () => Promise<void>;
  clearTranscript: () => void;
}

export function useVoiceInput(): UseVoiceInputResult {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Use ref to track latest transcript synchronously (avoids stale closure issues)
  const transcriptRef = useRef('');
  // Promise resolver for waiting on final results after stop
  const stopResolverRef = useRef<((transcript: string) => void) | null>(null);

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
    // Resolve any pending stop with the final transcript
    if (stopResolverRef.current) {
      stopResolverRef.current(transcriptRef.current);
      stopResolverRef.current = null;
    }
  };

  const onSpeechResults = (e: SpeechResultsEvent) => {
    console.log('Speech results', e);
    if (e.value && e.value.length > 0) {
      const newTranscript = e.value[0];
      transcriptRef.current = newTranscript;
      setTranscript(newTranscript);
    }
  };

  const onSpeechError = async (e: SpeechErrorEvent) => {
    setIsRecording(false);

    // Resolve any pending stop promise with current transcript
    if (stopResolverRef.current) {
      stopResolverRef.current(transcriptRef.current);
      stopResolverRef.current = null;
    }

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
      transcriptRef.current = '';
      await Voice.start('en-US');
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    try {
      // Create a promise that will resolve when onSpeechEnd fires
      const finalTranscriptPromise = new Promise<string>((resolve) => {
        stopResolverRef.current = resolve;
        // Timeout fallback in case onSpeechEnd doesn't fire
        setTimeout(() => {
          if (stopResolverRef.current) {
            console.log('Stop timeout - using current transcript');
            stopResolverRef.current(transcriptRef.current);
            stopResolverRef.current = null;
          }
        }, 500);
      });

      await Voice.stop();

      // Wait for onSpeechEnd to fire with final results
      const finalTranscript = await finalTranscriptPromise;
      return finalTranscript;
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      return transcriptRef.current;
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
