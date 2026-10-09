// Speech-to-text fallback for browsers without built-in speech recognition (Firefox, Brave, in-app browsers).
// Most browsers transcribe on-device or via their vendor; this route is only the backup path.
import Groq, { toFile } from 'groq-sdk';
import { withTimeout } from '../../utils/async';

export interface SttService {
  available(): boolean;
  transcribe(audio: Buffer, mimeType: string, language?: string): Promise<string>;
}

export const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
};

/** "audio/webm;codecs=opus" -> "audio/webm" */
export function baseMime(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0]!.trim().toLowerCase();
}

// Stays on in DEMO_MODE: it turns the user's own speech into text, which the voice UI needs
// even while answers are canned. It is the only Groq call demo mode makes.
export function createGroqStt(opts: { apiKey?: string; model: string; timeoutMs?: number }): SttService {
  const client = opts.apiKey ? new Groq({ apiKey: opts.apiKey, maxRetries: 0 }) : null;
  return {
    available: () => client !== null,
    async transcribe(audio, mimeType, language) {
      if (!client) throw new Error('Speech-to-text is not configured');
      const ext = AUDIO_TYPES[baseMime(mimeType)] ?? 'webm';
      const file = await toFile(audio, `speech.${ext}`, { type: baseMime(mimeType) });
      const res = await withTimeout(
        client.audio.transcriptions.create({
          file,
          model: opts.model,
          response_format: 'json',
          temperature: 0,
          ...(language ? { language } : {}),
        }),
        opts.timeoutMs ?? 20000,
        'transcription',
      );
      return (res.text ?? '').trim();
    },
  };
}
