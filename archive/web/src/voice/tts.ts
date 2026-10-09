// Text-to-speech with the browser's built-in voices (speechSynthesis). Works offline on most devices.
import { chunkForSpeech } from './speakable';

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // not loaded yet; try again next time
  const base = lang.split('-')[0]!.toLowerCase();
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  const exact = sameLang.filter((v) => v.lang.toLowerCase() === lang.toLowerCase());
  // Prefer natural-sounding voices where the platform has them.
  const quality = /natural|neural|premium|enhanced|google|samantha|siri|aria|jenny|guy/i;
  cachedVoice =
    exact.find((v) => quality.test(v.name)) ??
    sameLang.find((v) => quality.test(v.name)) ??
    exact.find((v) => v.localService) ??
    exact[0] ??
    sameLang[0] ??
    null;
  return cachedVoice;
}

if (ttsSupported) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    cachedVoice = undefined;
  });
}

let generation = 0;

/** Stop anything being spoken now. */
export function stopSpeaking(): void {
  generation++;
  if (ttsSupported) window.speechSynthesis.cancel();
}

/**
 * Speak `text`, cancelling anything already playing. Resolves when finished,
 * or early (with false) if it was stopped or replaced.
 */
export function speak(text: string, opts: { lang: string; rate?: number } = { lang: 'en-US' }): Promise<boolean> {
  stopSpeaking();
  const mine = generation;
  if (!ttsSupported || !text.trim()) return Promise.resolve(true);
  const synth = window.speechSynthesis;
  const chunks = chunkForSpeech(text);

  return new Promise((resolve) => {
    let i = 0;
    // Safety net: some engines never fire "end" (e.g. a tab moved to the background).
    let watchdog: number | undefined;
    const finish = (ok: boolean) => {
      window.clearTimeout(watchdog);
      resolve(ok);
    };
    const next = () => {
      if (mine !== generation) return finish(false);
      if (i >= chunks.length) return finish(true);
      const chunk = chunks[i++]!;
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = opts.lang;
      u.rate = opts.rate ?? 1.03;
      const voice = pickVoice(opts.lang);
      if (voice) u.voice = voice;
      // Each chunk advances exactly once, whether by "end", "error" or the watchdog.
      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        next();
      };
      u.onend = advance;
      u.onerror = (e) => {
        // "interrupted"/"canceled" mean we stopped it on purpose.
        if (e.error === 'interrupted' || e.error === 'canceled') {
          advanced = true;
          return finish(false);
        }
        advance();
      };
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(() => mine === generation && advance(), 3000 + chunk.length * 110);
      synth.speak(u);
      // Chrome sometimes starts paused after cancel(); nudge it.
      if (synth.paused) synth.resume();
    };
    next();
  });
}

/** Must run inside a tap/click: iOS and Chrome only allow speech after a user gesture. */
export function unlockSpeech(): void {
  if (!ttsSupported) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
  window.speechSynthesis.getVoices();
}
