// Phone speech-to-text that works in Expo Go: record with expo-audio, stop when the speaker
// goes quiet (using the live input level), then transcribe on the server (Groq Whisper).
import { useCallback, useRef } from 'react';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { VoiceInputError, type ListenHandle } from './stt-browser';

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export interface RecorderListenOptions {
  /** Called when recording ends and transcription starts. */
  onTranscribing?: () => void;
  transcribe: (uri: string) => Promise<string>;
  maxMs?: number;
  silenceMs?: number;
  noSpeechMs?: number;
}

/** Ask for microphone permission ahead of time; throws with a readable message when refused. */
export async function warmUpRecorder(): Promise<void> {
  const perm = await requestRecordingPermissionsAsync();
  if (!perm.granted) throw new VoiceInputError('not-allowed', 'Microphone access is off. Turn it on for CurioX in your phone’s Settings.');
}

export function useRecorderListener() {
  const recorder = useAudioRecorder(OPTIONS);
  // One recording at a time: a new listen waits for the previous one to release the mic.
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  return useCallback(
    ({ onTranscribing, transcribe, maxMs = 15000, silenceMs = 1500, noSpeechMs = 7000 }: RecorderListenOptions): ListenHandle => {
      let reason: 'stop' | 'abort' | null = null;
      // Read through a function: reason changes from stop()/abort() while we await.
      const why = (): 'stop' | 'abort' | null => reason;
      let wake: () => void = () => undefined;
      const request = (r: 'stop' | 'abort') => {
        reason ??= r;
        wake();
      };

      const run = async () => {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) throw new VoiceInputError('not-allowed', 'Microphone access is off. Turn it on for CurioX in your phone’s Settings, then tap the mic.');
        if (why() === 'abort') return { alternatives: [] };

        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        try {
          await recorder.prepareToRecordAsync();
          recorder.record();
        } catch {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
          throw new VoiceInputError('no-mic', 'Could not start the microphone.');
        }

        const started = Date.now();
        let heard = false;
        let sawLevel = false;
        let lastVoice = started;
        let noise = -160;
        // Some phones report a constant 0 dB (or nothing) for the level: then record fixed windows.
        let meterBroken = false;

        await new Promise<void>((resolve) => {
          const timer = setInterval(() => {
            const now = Date.now();
            const level = recorder.getStatus().metering;
            if (!meterBroken && typeof level === 'number' && Number.isFinite(level) && level < -1) {
              sawLevel = true;
              // Calibrate on room noise for the first moment, then look for speech above it.
              if (now - started < 400) noise = Math.max(noise, level);
              else if (level > Math.min(Math.max(noise, -70), -35) + 12) {
                heard = true;
                lastVoice = now;
              }
            } else if (typeof level === 'number' && level >= -1 && now - started > 400) {
              meterBroken = true;
              sawLevel = false;
            }
            const silentAfterSpeech = heard && sawLevel && now - lastVoice > silenceMs;
            const nothingSaid = sawLevel && !heard && now - started > noSpeechMs;
            // Without level data (some devices), record a fixed window; a tap ends it sooner.
            const blindLimit = !sawLevel && now - started > 6000;
            if (silentAfterSpeech || nothingSaid || blindLimit || now - started > maxMs) finish();
          }, 100);
          const finish = () => {
            clearInterval(timer);
            resolve();
          };
          wake = finish;
          if (why()) finish();
        });

        const duration = Date.now() - started;
        await recorder.stop().catch(() => undefined);
        // Leave recording mode so replies play from the loudspeaker, not the earpiece (iOS).
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);

        const tappedDone = why() === 'stop' && duration > 600;
        const usable = heard || tappedDone || (!sawLevel && duration > 600);
        const uri = recorder.uri;
        if (why() === 'abort' || !usable || !uri) return { alternatives: [] };

        onTranscribing?.();
        try {
          const text = (await transcribe(uri)).trim();
          return { alternatives: text ? [text] : [] };
        } catch (err) {
          throw new VoiceInputError('failed', err instanceof Error ? err.message : 'Could not transcribe.');
        }
      };

      const done = chain.current.catch(() => undefined).then(run);
      chain.current = done.catch(() => undefined);
      return { done, stop: () => request('stop'), abort: () => request('abort') };
    },
    [recorder],
  );
}
