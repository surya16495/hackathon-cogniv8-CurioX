// Speech-to-text. Primary: the browser's built-in SpeechRecognition (Chrome, Edge, Safari, Android).
// Fallback: record audio, stop on silence, transcribe on the server (Firefox, Brave, in-app browsers).

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

// ---------- Recorder fallback ----------

export const recorderSupported = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

function pickMime(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
}

export interface RecorderOptions extends ListenOptions {
  transcribe: (audio: Blob) => Promise<string>;
  maxMs?: number;
  silenceMs?: number;
  noSpeechMs?: number;
}

export function listenWithRecorder({ onInterim, transcribe, maxMs = 15000, silenceMs = 1400, noSpeechMs = 7000 }: RecorderOptions): ListenHandle {
  // stop()/abort() can arrive before the microphone is ready; remember it.
  let early: 'stop' | 'abort' | null = null;
  let stopNow: (discard: boolean) => void = (d) => {
    early = d ? 'abort' : 'stop';
  };

  const done = (async (): Promise<ListenResult> => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new VoiceInputError('not-allowed', 'Microphone access is blocked. Allow it in your browser’s site settings, then tap the mic.');
      }
      throw new VoiceInputError('no-mic', 'No microphone was found.');
    }
    if (early === 'abort') {
      stream.getTracks().forEach((t) => t.stop());
      return { alternatives: [] };
    }

    const mime = pickMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Simple voice-activity detection on the input level.
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    let heardSpeech = false;
    let discard = false;
    const started = performance.now();
    let lastVoice = started;
    let noise = 0.01;

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    stopNow = (d: boolean) => {
      discard = discard || d;
      if (recorder.state !== 'inactive') recorder.stop();
    };

    recorder.start(250);
    onInterim?.('');
    if (early) stopNow(early === 'abort');
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (now - started < 300) noise = Math.max(noise, rms); // calibrate on room noise
      if (rms > Math.max(0.02, noise * 2.5)) {
        heardSpeech = true;
        lastVoice = now;
      }
      if ((heardSpeech && now - lastVoice > silenceMs) || (!heardSpeech && now - started > noSpeechMs) || now - started > maxMs) {
        stopNow(false);
      }
    }, 100);

    await stopped;
    window.clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx.close().catch(() => undefined);

    if (discard || !heardSpeech || !chunks.length) return { alternatives: [] };
    onInterim?.('…');
    const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
    try {
      const text = (await transcribe(blob)).trim();
      return { alternatives: text ? [text] : [] };
    } catch (err) {
      throw new VoiceInputError('failed', err instanceof Error ? err.message : 'Could not transcribe.');
    }
  })();

  return { done, stop: () => stopNow(false), abort: () => stopNow(true) };
}
