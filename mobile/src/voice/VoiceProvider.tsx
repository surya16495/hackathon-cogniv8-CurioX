// Voice mode: CurioX speaks, then listens, then acts on what you said, on every screen.
// Each screen describes itself with useVoiceScreen(): what to say when it appears, and what to
// do with commands and free speech. This provider runs the speak → listen → act loop.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { HELP_TEXT, parseCommand, type Command, type ScreenId } from '@curiox/shared';
import { api } from '../api/client';
import { useSession } from '../hooks/useSession';
import { KEYS, loadStorage, storage } from '../lib/storage';
import { useRecorderListener } from './recorder';
import { browserRecognitionSupported, listenWithBrowser, VoiceInputError, type ListenHandle } from './stt-browser';
import { speak, stopSpeaking } from './tts';

export type VoiceStatus = 'off' | 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

export interface VoiceScreenConfig {
  screen: ScreenId;
  /** Spoken whenever it changes while this screen is shown (a new question, a greeting…). */
  intro?: string | null;
  /** Return false to treat the phrase as free speech instead. */
  onCommand?: (cmd: Command) => boolean | void;
  /** Free speech that is not a command: an answer, a question… */
  onDictation?: (text: string) => void;
  /** Options of the quiz question waiting for an answer. */
  quizOptions?: string[];
  /** A destructive action is waiting for yes/no. */
  confirming?: boolean;
}

interface VoiceContextValue {
  enabled: boolean;
  status: VoiceStatus;
  interim: string;
  error: string | null;
  canListen: boolean;
  needsTap: boolean;
  helpOpen: boolean;
  screen: ScreenId | null;
  setHelpOpen: (open: boolean) => void;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  micPress: () => void;
  say: (text: string, opts?: { listenAfter?: boolean }) => Promise<void>;
  /** The screen is busy (answer streaming, quiz loading): don't start listening yet. */
  setThinking: (thinking: boolean) => void;
  register: (ref: { current: VoiceScreenConfig }) => () => void;
  announce: (text: string | null | undefined) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);
const isWeb = Platform.OS === 'web';

export function voiceLang(): string {
  let locale = 'en-US';
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale || locale;
  } catch {
    // keep default
  }
  return locale.toLowerCase().startsWith('en') ? locale : 'en-US';
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { health } = useSession();
  const lang = useMemo(voiceLang, []);
  const serverStt = Boolean(health?.providers.stt);
  const recorderListen = useRecorderListener();
  const engine: 'browser' | 'recorder' | 'none' = isWeb && browserRecognitionSupported() ? 'browser' : serverStt ? 'recorder' : 'none';
  const canListen = engine !== 'none';

  const [enabled, setEnabled] = useState(false);
  // Browsers allow speech and the mic only after a tap; phones don't need one.
  const [needsTap, setNeedsTap] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('off');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [screen, setScreen] = useState<ScreenId | null>(null);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const needsTapRef = useRef(needsTap);
  needsTapRef.current = needsTap;
  const statusRef = useRef(status);
  // Screens stay mounted under the one on top (Chat stays under Profile), so keep a stack:
  // the top entry is the screen voice talks to; popping it hands control back to the one below.
  const screens = useRef<{ current: VoiceScreenConfig }[]>([]);
  const top = () => screens.current[screens.current.length - 1]?.current;
  const listenRef = useRef<ListenHandle | null>(null);
  const lastSpoken = useRef('');
  const lastIntro = useRef('');
  const thinkingRef = useRef(false);
  const silentTries = useRef(0);
  const followUp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Bumped whenever speech is replaced or interrupted, so a finished say() knows it is stale.
  const sayGen = useRef(0);
  const listenFn = useRef<() => void>(() => undefined);
  const disableRef = useRef<() => void>(() => undefined);

  const set = (s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const say = useCallback(
    async (text: string, opts: { listenAfter?: boolean } = {}) => {
      if (!enabledRef.current || needsTapRef.current) return;
      const mine = ++sayGen.current;
      clearTimeout(followUp.current);
      listenRef.current?.abort();
      listenRef.current = null;
      lastSpoken.current = text;
      set('speaking');
      await speak(text, lang);
      // A newer say(), a mic tap or a stop replaced this one: it owns what happens next.
      if (mine !== sayGen.current || !enabledRef.current) return;
      set('idle');
      if (opts.listenAfter !== false && !thinkingRef.current) listenFn.current();
    },
    [lang],
  );

  /** If a command led to no speech and no work, listen again so the loop never stalls. */
  const scheduleFollowUp = useCallback(() => {
    clearTimeout(followUp.current);
    followUp.current = setTimeout(() => {
      if (enabledRef.current && !thinkingRef.current && statusRef.current === 'idle') listenFn.current();
    }, 700);
  }, []);

  const handleSpeech = useCallback(
    (alternatives: string[]) => {
      const cfg = top();
      if (!cfg) return;
      const ctx = { screen: cfg.screen, quizOptions: cfg.quizOptions, confirming: cfg.confirming };
      let cmd: Command | null = null;
      for (const alt of alternatives) {
        cmd = parseCommand(alt, ctx);
        if (cmd) break;
      }
      const text = alternatives[0]!;
      set('idle');

      if (cmd?.type === 'help') {
        setHelpOpen(true);
        void say(HELP_TEXT[cfg.screen]);
        return;
      }
      if (cmd?.type === 'voiceOff') {
        void say('Voice mode off. Tap the mic whenever you want to talk.', { listenAfter: false }).then(() => disableRef.current());
        return;
      }
      if (cmd?.type === 'repeat' && lastSpoken.current) {
        void say(lastSpoken.current);
        return;
      }
      if (cmd && cfg.onCommand && cfg.onCommand(cmd) !== false) {
        if (cmd.type !== 'stop') scheduleFollowUp();
        return;
      }
      // Never send these words as a question when the screen has nothing to do with them.
      if (cmd?.type === 'stop') return;
      if (cmd?.type === 'back' || cmd?.type === 'retry' || cmd?.type === 'repeat') {
        void say(cmd.type === 'repeat' ? "I haven't said anything yet." : cmd.type === 'back' ? "You're already here." : 'There is nothing to retry.');
        return;
      }
      if (cfg.onDictation) {
        cfg.onDictation(text);
        scheduleFollowUp();
        return;
      }
      void say(`Sorry, I didn't get "${text}". Say help to hear what you can say.`);
    },
    [say, scheduleFollowUp],
  );

  const transcribe = useCallback(
    async (uri: string) => {
      if (isWeb) {
        const blob = await (await fetch(uri)).blob();
        return api.transcribe(blob, lang);
      }
      return api.transcribe({ uri, type: 'audio/m4a' }, lang);
    },
    [lang],
  );

  const listen = useCallback(() => {
    if (!enabledRef.current || needsTapRef.current || engine === 'none') return;
    if (statusRef.current === 'listening' || statusRef.current === 'transcribing') return;
    clearTimeout(followUp.current);
    sayGen.current++;
    stopSpeaking();
    setError(null);
    setInterim('');
    set('listening');
    let handle: ListenHandle;
    try {
      handle =
        engine === 'browser'
          ? listenWithBrowser({ lang, onInterim: setInterim })
          : recorderListen({ transcribe, onTranscribing: () => set('transcribing') });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice input is not available.');
      set('idle');
      return;
    }
    listenRef.current = handle;
    handle.done
      .then(({ alternatives }) => {
        if (listenRef.current !== handle) return; // replaced or aborted
        listenRef.current = null;
        setInterim('');
        if (!alternatives.length) {
          // Nothing heard: try once more, then wait for a tap.
          set('idle');
          if (enabledRef.current && ++silentTries.current < 2) setTimeout(() => listenFn.current(), 250);
          return;
        }
        silentTries.current = 0;
        setInterim(alternatives[0]!);
        handleSpeech(alternatives);
      })
      .catch((err) => {
        if (listenRef.current !== handle) return;
        listenRef.current = null;
        setInterim('');
        set('idle');
        setError(err instanceof Error ? err.message : 'Voice input failed.');
        if (err instanceof VoiceInputError && err.code === 'failed') void say("Sorry, I couldn't catch that. Please try again.");
      });
  }, [engine, handleSpeech, lang, recorderListen, say, transcribe]);
  listenFn.current = listen;

  const stopAll = useCallback(() => {
    clearTimeout(followUp.current);
    sayGen.current++;
    listenRef.current?.abort();
    listenRef.current = null;
    stopSpeaking();
  }, []);

  const disable = useCallback(() => {
    stopAll();
    setEnabled(false);
    enabledRef.current = false;
    setNeedsTap(false);
    setInterim('');
    set('off');
    storage.set(KEYS.voice, 'off');
  }, [stopAll]);
  disableRef.current = disable;

  /** Speak the current screen's intro, or just start listening. */
  const resume = useCallback(() => {
    const intro = top()?.intro;
    silentTries.current = 0;
    if (intro) {
      lastIntro.current = intro;
      void say(intro);
    } else {
      void say(canListen ? "I'm listening." : 'Voice replies are on.');
    }
  }, [canListen, say]);

  const enable = useCallback(() => {
    setEnabled(true);
    enabledRef.current = true;
    setNeedsTap(false);
    needsTapRef.current = false;
    set('idle');
    storage.set(KEYS.voice, 'on');
    resume();
  }, [resume]);

  const toggle = useCallback(() => (enabledRef.current && !needsTapRef.current ? disable() : enable()), [disable, enable]);

  const micPress = useCallback(() => {
    if (!enabledRef.current || needsTapRef.current) return enable();
    const s = statusRef.current;
    if (s === 'listening') {
      listenRef.current?.stop(); // use what was said so far
      return;
    }
    if (s === 'transcribing') return;
    sayGen.current++;
    stopSpeaking();
    silentTries.current = 0;
    set('idle');
    listen();
  }, [enable, listen]);

  // Restore voice mode from the last session once storage has loaded (it loads asynchronously).
  useEffect(() => {
    let cancelled = false;
    void loadStorage().then(() => {
      if (cancelled || enabledRef.current || storage.get(KEYS.voice) !== 'on') return;
      enabledRef.current = true;
      setEnabled(true);
      if (isWeb) {
        needsTapRef.current = true;
        setNeedsTap(true);
      }
      set('idle');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Web only: resume a remembered voice mode on the first tap or key press anywhere.
  useEffect(() => {
    if (!needsTap || !isWeb || typeof window === 'undefined') return;
    const onGesture = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-voice-control]')) return;
      enable();
    };
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [needsTap, enable]);

  // Stop talking and listening when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stopAll();
        if (enabledRef.current) set('idle');
      }
    });
    return () => sub.remove();
  }, [stopAll]);

  useEffect(() => () => stopAll(), [stopAll]);

  const setThinking = useCallback(
    (thinking: boolean) => {
      if (thinkingRef.current === thinking) return;
      thinkingRef.current = thinking;
      if (!enabledRef.current) return;
      if (thinking) {
        clearTimeout(followUp.current);
        if (statusRef.current === 'idle') set('thinking');
      } else {
        if (statusRef.current === 'thinking') set('idle');
        scheduleFollowUp();
      }
    },
    [scheduleFollowUp],
  );

  const register = useCallback((ref: { current: VoiceScreenConfig }) => {
    screens.current = [...screens.current.filter((r) => r !== ref), ref];
    setScreen(ref.current.screen);
    return () => {
      screens.current = screens.current.filter((r) => r !== ref);
      setScreen(top()?.screen ?? null);
    };
  }, []);

  const announce = useCallback(
    (text: string | null | undefined) => {
      if (!text || !enabledRef.current || needsTapRef.current) return;
      if (text === lastIntro.current && statusRef.current === 'speaking') return;
      lastIntro.current = text;
      silentTries.current = 0;
      void say(text);
    },
    [say],
  );

  const value = useMemo<VoiceContextValue>(
    () => ({
      enabled: enabled && !needsTap,
      status: enabled && !needsTap ? status : 'off',
      interim,
      error,
      canListen,
      needsTap: enabled && needsTap,
      helpOpen,
      screen,
      setHelpOpen,
      enable,
      disable,
      toggle,
      micPress,
      say,
      setThinking,
      register,
      announce,
    }),
    [enabled, needsTap, status, interim, error, canListen, helpOpen, screen, enable, disable, toggle, micPress, say, setThinking, register, announce],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>');
  return ctx;
}

/** Describe the current screen to voice mode. Call it on every screen. Pass active: false while it is hidden (tabs stay mounted). */
export function useVoiceScreen(config: VoiceScreenConfig & { active?: boolean }): VoiceContextValue {
  const voice = useVoice();
  const ref = useRef(config);
  ref.current = config;
  const active = config.active !== false;
  const { register, announce, enabled } = voice;
  useEffect(() => (active ? register(ref) : undefined), [register, active]);
  useEffect(() => {
    if (active) announce(config.intro);
    // Re-announce when the intro text changes, the screen comes back, or voice mode is switched on.
  }, [config.intro, config.screen, enabled, announce, active]);
  return voice;
}
