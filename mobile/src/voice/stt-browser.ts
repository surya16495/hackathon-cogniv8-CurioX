// Speech-to-text on the web build: the browser's built-in SpeechRecognition (Chrome, Edge, Safari).
// Phones use the recorder in recorder.ts instead.

export type VoiceInputErrorCode = 'not-allowed' | 'no-mic' | 'network' | 'unsupported' | 'failed';

export class VoiceInputError extends Error {
  constructor(
    public readonly code: VoiceInputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VoiceInputError';
  }
}

export interface ListenResult {
  /** Best guess first. Empty when nothing was said. */
  alternatives: string[];
}

export interface ListenHandle {
  /** Stop and use what was heard so far. */
  stop: () => void;
  /** Stop and discard. */
  abort: () => void;
  done: Promise<ListenResult>;
}

export interface ListenOptions {
  lang: string;
  onInterim?: (text: string) => void;
}

// ---------- Built-in recognition ----------

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [i: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const browserRecognitionSupported = () => recognitionCtor() !== null;

export function listenWithBrowser({ lang, onInterim }: ListenOptions): ListenHandle {
  const Ctor = recognitionCtor();
  if (!Ctor) throw new VoiceInputError('unsupported', 'Speech recognition is not available in this browser.');
  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 3;

  let finals: string[] = [];
  let interim = '';
  let aborted = false;

  const done = new Promise<ListenResult>((resolve, reject) => {
    let failure: VoiceInputError | null = null;
    rec.onresult = (e) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) {
          const alts: string[] = [];
          for (let a = 0; a < r.length; a++) {
            const t = r[a]?.transcript?.trim();
            if (t) alts.push(t);
          }
          finals = alts.length ? alts : finals;
        } else {
          interim += r[0]?.transcript ?? '';
        }
      }
      onInterim?.((finals[0] ?? interim).trim());
    };
    rec.onerror = (e) => {
      switch (e.error) {
        case 'no-speech':
        case 'aborted':
          return;
        case 'not-allowed':
        case 'service-not-allowed':
          failure = new VoiceInputError('not-allowed', 'Microphone access is blocked. Allow it in your browser’s site settings, then tap the mic.');
          return;
        case 'audio-capture':
          failure = new VoiceInputError('no-mic', 'No microphone was found.');
          return;
        case 'network':
          failure = new VoiceInputError('network', 'Speech recognition needs a connection.');
          return;
        default:
          failure = new VoiceInputError('failed', `Speech recognition failed (${e.error}).`);
      }
    };
    rec.onend = () => {
      if (failure) return reject(failure);
      if (aborted) return resolve({ alternatives: [] });
      // Safari sometimes ends without marking a result final.
      const alternatives = finals.length ? finals : interim.trim() ? [interim.trim()] : [];
      resolve({ alternatives });
    };
  });

  try {
    rec.start();
  } catch {
    // start() throws if a previous session is still closing; the caller retries.
  }
  return {
    done,
    stop: () => rec.stop(),
    abort: () => {
      aborted = true;
      rec.abort();
    },
  };
}
