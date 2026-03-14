/**
 * Voice Engine — ElevenLabs TTS + Web Speech API recognition.
 * Powers the natural voice conversation mode.
 */

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

let recognition: any = null;
let currentAudio: HTMLAudioElement | null = null;

export function isSpeechRecognitionSupported(): boolean {
  return SpeechRecognitionAPI !== null;
}

export interface RecognitionCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
}

export function startListening(callbacks: RecognitionCallbacks): void {
  if (!SpeechRecognitionAPI) {
    callbacks.onError("Speech recognition not supported in this browser");
    return;
  }

  stopListening();

  recognition = new SpeechRecognitionAPI();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  let finalTranscript = "";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;

  recognition.onresult = (event: any) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interim += transcript;
      }
    }

    if (interim) {
      callbacks.onInterim(finalTranscript + interim);
    }

    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (finalTranscript.trim()) {
        callbacks.onFinal(finalTranscript.trim());
        finalTranscript = "";
      }
    }, 1500);
  };

  recognition.onerror = (event: any) => {
    if (event.error !== "no-speech" && event.error !== "aborted") {
      callbacks.onError(event.error);
    }
  };

  recognition.onend = () => {
    callbacks.onEnd();
  };

  recognition.start();
}

export function stopListening(): void {
  if (recognition) {
    try {
      recognition.abort();
    } catch (_) {}
    recognition = null;
  }
}

export async function speakWithElevenLabs(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<void> {
  stopSpeaking();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs error (${response.status})`);
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);

  return new Promise((resolve, reject) => {
    currentAudio = new Audio(audioUrl);
    currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      resolve();
    };
    currentAudio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      reject(new Error("Audio playback failed"));
    };
    currentAudio.play().catch(reject);
  });
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

export function stopAll(): void {
  stopListening();
  stopSpeaking();
}
