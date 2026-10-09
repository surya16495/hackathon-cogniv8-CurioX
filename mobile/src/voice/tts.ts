// Text-to-speech with the device's voices (expo-speech, works in Expo Go).
import * as Speech from 'expo-speech';
import { chunkForSpeech } from '@curiox/shared';

let generation = 0;

export function stopSpeaking(): void {
  generation++;
  void Speech.stop();
}

/**
 * Speak `text`, cancelling anything already playing. Resolves true when finished,
 * false if it was stopped or replaced.
 */
export function speak(text: string, lang: string): Promise<boolean> {
  stopSpeaking();
  const mine = generation;
  if (!text.trim()) return Promise.resolve(true);
  // Short chunks: some engines cut off long utterances, and stop() reacts faster between chunks.
  const max = Math.min(Speech.maxSpeechInputLength || 4000, 400);
  const chunks = chunkForSpeech(text, max);

  return new Promise((resolve) => {
    let i = 0;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const finish = (ok: boolean) => {
      clearTimeout(watchdog);
      resolve(ok);
    };
    const next = () => {
      if (mine !== generation) return finish(false);
      if (i >= chunks.length) return finish(true);
      const chunk = chunks[i++]!;
      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        next();
      };
      clearTimeout(watchdog);
      // Safety net: if an engine never reports "done", move on anyway.
      watchdog = setTimeout(() => mine === generation && advance(), 4000 + chunk.length * 110);
      Speech.speak(chunk, {
        language: lang,
        rate: 1.0,
        onDone: advance,
        onStopped: () => {
          advanced = true;
          finish(false);
        },
        onError: advance,
      });
    };
    next();
  });
}
