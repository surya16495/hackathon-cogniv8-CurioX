import { HELP_TEXT } from './commands';
import { useVoice, type VoiceStatus } from './VoiceProvider';

const LABEL: Record<VoiceStatus, string> = {
  off: 'Turn on voice mode',
  idle: 'Tap to talk',
  listening: 'Listening… tap when done',
  transcribing: 'Working out what you said…',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to interrupt',
};

function MicIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function WaveIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {[4, 8, 12, 16, 20].map((x, i) => (
        <rect key={x} x={x - 1} y={6} width="2" height="12" rx="1" className="voice-bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </svg>
  );
}

/** The main voice button. "inline" sits in a composer; "fab" floats on screens without one. */
export function MicButton({ variant = 'inline' }: { variant?: 'inline' | 'fab' }) {
  const voice = useVoice();
  if (!voice.canListen && !voice.canSpeak) return null;
  const s = voice.status;
  const size = variant === 'fab' ? 'h-16 w-16' : 'h-10 w-10';
  const icon = variant === 'fab' ? 'h-7 w-7' : 'h-5 w-5';
  const tone =
    s === 'listening'
      ? 'bg-red-500 text-white ring-4 ring-red-300/60 dark:ring-red-800/60'
      : s === 'speaking'
        ? 'bg-brand-600 text-white'
        : s === 'off'
          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
          : 'bg-brand-100 text-brand-700 hover:bg-brand-200 dark:bg-brand-900 dark:text-brand-200';
  return (
    <button
      type="button"
      data-voice-control
      onClick={voice.micPress}
      aria-label={voice.needsTap ? 'Resume voice mode' : LABEL[s]}
      aria-pressed={voice.enabled}
      title={LABEL[s]}
      className={`relative shrink-0 rounded-full transition ${size} ${tone} ${variant === 'fab' ? 'shadow-lg' : ''}`}
    >
      {s === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" aria-hidden="true" />}
      {s === 'speaking' ? <WaveIcon className={`relative mx-auto ${icon}`} /> : s === 'thinking' || s === 'transcribing' ? (
        <span className={`relative mx-auto block animate-spin rounded-full border-2 border-current border-t-transparent ${variant === 'fab' ? 'h-6 w-6' : 'h-4 w-4'}`} aria-hidden="true" />
      ) : (
        <MicIcon className={`relative mx-auto ${icon}`} />
      )}
    </button>
  );
}

/** Floating mic for screens that have no message box. */
export function MicFab() {
  return (
    <div className="fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30">
      <MicButton variant="fab" />
    </div>
  );
}

/** Header switch for voice replies. */
export function VoiceToggle() {
  const voice = useVoice();
  if (!voice.canSpeak && !voice.canListen) return null;
  const on = voice.enabled;
  return (
    <button
      type="button"
      data-voice-control
      onClick={voice.toggle}
      aria-pressed={on}
      aria-label={on ? 'Turn off voice mode' : 'Turn on voice mode'}
      className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${on ? 'bg-brand-600 text-white hover:bg-brand-700' : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800'}`}
    >
      <span aria-hidden="true">{on ? '🔊' : '🔈'}</span> Voice
    </button>
  );
}

/** Live status, what was heard, errors and the "what can I say" sheet. Rendered once, app-wide. */
export function VoiceOverlay() {
  const voice = useVoice();

  if (voice.needsTap) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4">
        <div className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg">🎤 Tap anywhere to continue in voice mode</div>
      </div>
    );
  }

  return (
    <>
      {voice.enabled && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4" aria-live="polite">
          {(voice.status === 'listening' || voice.status === 'transcribing' || voice.error) && (
            <div className="pointer-events-auto max-w-md rounded-2xl bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur dark:bg-slate-100/95 dark:text-slate-900">
              {voice.error ? (
                <span className="text-amber-300 dark:text-amber-700">{voice.error}</span>
              ) : voice.status === 'transcribing' ? (
                'Working out what you said…'
              ) : voice.interim ? (
                <>“{voice.interim}”</>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Listening… say “help” for commands
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {voice.helpOpen && <HelpSheet />}
    </>
  );
}

function HelpSheet() {
  const voice = useVoice();
  const close = () => voice.setHelpOpen(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={close} role="dialog" aria-modal="true" aria-label="Voice commands">
      <div className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">What you can say</h2>
        {voice.screen && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{HELP_TEXT[voice.screen]}</p>}
        <h3 className="mt-4 text-sm font-semibold">Anywhere</h3>
        <ul className="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <li>“help”: hear these commands</li>
          <li>“repeat”: say the last thing again</li>
          <li>“stop”: stop the current answer</li>
          <li>“go back”, “open profile”</li>
          <li>“voice off”: turn voice mode off</li>
        </ul>
        <p className="mt-4 text-xs text-slate-500">Tap the mic to talk, or tap it while CurioX is speaking to interrupt.</p>
        <button onClick={close} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700">
          Got it
        </button>
      </div>
    </div>
  );
}
