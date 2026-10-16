import * as IntentLauncher from "expo-intent-launcher";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export function useVoiceSearch(
  onTranscript: (transcript: string) => void,
  focusInput: () => void,
) {
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(
    () => () => {
      recognitionRef.current?.stop?.();
    },
    [],
  );

  const clearVoiceNotice = useCallback(() => setVoiceNotice(null), []);

  const stopVoiceSearch = useCallback(() => {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, []);

  const startVoiceSearch = useCallback(async () => {
    setVoiceNotice(null);

    if (Platform.OS === "android") {
      setIsListening(true);
      try {
        const result = await IntentLauncher.startActivityAsync(
          "android.speech.action.RECOGNIZE_SPEECH",
          {
            extra: {
              "android.speech.extra.LANGUAGE_MODEL": "free_form",
              "android.speech.extra.LANGUAGE": "en-IN",
              "android.speech.extra.MAX_RESULTS": 1,
              "android.speech.extra.PROMPT": "Say a movie or show title",
            },
          },
        );
        const extra = result.extra as Record<string, unknown> | undefined;
        const candidates = extra?.["android.speech.extra.RESULTS"];
        const spoken = Array.isArray(candidates)
          ? candidates.find(
              (candidate): candidate is string =>
                typeof candidate === "string" && candidate.trim().length > 0,
            )?.trim()
          : undefined;

        if (result.resultCode === IntentLauncher.ResultCode.Success && spoken) {
          onTranscript(spoken);
        } else if (result.resultCode === IntentLauncher.ResultCode.Success) {
          setVoiceNotice("No speech was recognized. Try again or type your search.");
        }
      } catch (error) {
        console.warn("[SearchVoice] Android speech recognition failed:", error);
        setVoiceNotice(
          "Voice search couldn't start. Check microphone access and that speech recognition is available.",
        );
      } finally {
        setIsListening(false);
      }
      return;
    }

    if (Platform.OS === "web") {
      const SpeechRecognition = (globalThis as any).SpeechRecognition
        ?? (globalThis as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        focusInput();
        setVoiceNotice(
          "Voice search isn't supported in this browser. Try Chrome or use your keyboard microphone.",
        );
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
        if (recognitionRef.current === recognition) recognitionRef.current = null;
      };
      recognition.onerror = (event: { error?: string }) => {
        setIsListening(false);
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        if (event.error === "aborted") return;
        setVoiceNotice(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Allow microphone access in your browser settings, then try again."
            : event.error === "no-speech"
              ? "No speech was detected. Try speaking a little closer to the microphone."
              : "Voice search failed. Check your microphone and internet connection.",
        );
      };
      recognition.onresult = (event: any) => {
        const spoken = event.results?.[0]?.[0]?.transcript?.trim();
        if (spoken) {
          setVoiceNotice(null);
          onTranscript(spoken);
        } else {
          setVoiceNotice("No speech was recognized. Try again or type your search.");
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
        setIsListening(false);
        setVoiceNotice("Microphone couldn't start. Allow access and try again.");
      }
      return;
    }

    focusInput();
    setVoiceNotice("On iPhone, tap the microphone on your keyboard to dictate your search.");
  }, [focusInput, onTranscript]);

  return {
    isListening,
    voiceNotice,
    startVoiceSearch,
    stopVoiceSearch,
    clearVoiceNotice,
  };
}
