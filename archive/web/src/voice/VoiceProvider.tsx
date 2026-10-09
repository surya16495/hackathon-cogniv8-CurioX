// Voice mode: CurioX speaks, then listens, then acts on what you said, on every screen.
// Each page describes itself with useVoiceScreen(): what to say when it appears, and what
// to do with commands and free speech. This provider runs the speak → listen → act loop.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { useSession } from '../hooks/useSession';
import { storage } from '../lib/storage';
import { HELP_TEXT, parseCommand, type Command, type ScreenId } from './commands';
import { browserRecognitionSupported, listenWithBrowser, listenWithRecorder, recorderSupported, VoiceInputError, type ListenHandle } from './stt';
import { speak, stopSpeaking, ttsSupported, unlockSpeech } from './tts';

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

interface SayOptions {
  /** Listen again when finished (default: true). */
  listenAfter?: boolean;
}

interface VoiceContextValue {
  enabled: boolean;
  status: VoiceStatus;
  interim: string;
  heard: string;
  error: string | null;
  canListen: boolean;
  canSpeak: boolean;
  needsTap: boolean;
  helpOpen: boolean;
  screen: ScreenId | null;
  setHelpOpen: (open: boolean) => void;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  micPress: () => void;
  say: (text: string, opts?: SayOptions) => Promise<void>;
  /** The screen is busy (answer streaming, quiz loading): don't start listening yet. */
  setThinking: (thinking: boolean) => void;
  register: (ref: { current: VoiceScreenConfig }) => () => void;
  announce: (text: string | null | undefined) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);
const STORAGE_KEY = 'curiox.voice';

function voiceLang(): string {
  const l = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  return l && l.toLowerCase().startsWith('en') ? l : 'en-US';
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { health } = useSession();
  const lang = useMemo(voiceLang, []);
  const serverStt = Boolean(health?.providers.stt);
  const [engine, setEngine] = useState<'browser' | 'recorder' | 'none'>(() => (browserRecognitionSupported() ? 'browser' : 'none'));
  useEffect(() => {
    if (engine === 'none' && serverStt && recorderSupported()) setEngine('recorder');
  }, [engine, serverStt]);

  const remembered = storage.get(STORAGE_KEY) === 'on';
  const [enabled, setEnabled] = useState(remembered);
  // Browsers only allow speech and the mic after a tap, so a remembered voice mode waits for one.
  const [needsTap, setNeedsTap] = useState(remembered);
  const [status, setStatus] = useState<VoiceStatus>(remembered ? 'idle' : 'off');
  const [interim, setInterim] = useState('');
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [screen, setScreen] = useState<ScreenId | null>(null);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const needsTapRef = useRef(needsTap);
  needsTapRef.current = needsTap;
  const statusRef = useRef(status);
  statusRef.current = status;
  const screenRef = useRef<{ current: VoiceScreenConfig } | null>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const lastSpoken = useRef('');
  const lastIntro = useRef('');
  const thinkingRef = useRef(false);
  const silentTries = useRef(0);
  const followUp = useRef<number | undefined>(undefined);
  // Bumped whenever speech is replaced or interrupted, so a finished say() knows it is stale.
  const sayGen = useRef(0);

  const set = (s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const canListen = engine !== 'none';

  // Forward declarations through refs so callbacks can call each other without stale closures.
  const listenFn = useRef<() => void>(() => undefined);

  const say = useCallback(
    async (text: string, opts: SayOptions = {}) => {
      if (!enabledRef.current || needsTapRef.current) return;
      const mine = ++sayGen.current;
      window.clearTimeout(followUp.current);
      listenRef.current?.abort();
      listenRef.current = null;
      lastSpoken.current = text;
      set('speaking');
      await speak(text, { lang });
      // A newer say(), a mic tap or a stop replaced this one: it owns what happens next.
      if (mine !== sayGen.current || !enabledRef.current) return;
      set('idle');
      if (opts.listenAfter !== false && !thinkingRef.current) listenFn.current();
    },
    [lang],
  );

  /** If a command led to no speech and no work, listen again so the loop never stalls. */
  const scheduleFollowUp = useCallback(() => {
    window.clearTimeout(followUp.current);
    followUp.current = window.setTimeout(() => {
      if (enabledRef.current && !thinkingRef.current && statusRef.current === 'idle') listenFn.current();
    }, 700);
  }, []);

  const handleSpeech = useCallback(
    (alternatives: string[]) => {
      const cfg = screenRef.current?.current;
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

  const listen = useCallback(() => {
    if (!enabledRef.current || needsTapRef.current || engine === 'none') return;
    if (statusRef.current === 'listening' || statusRef.current === 'transcribing') return;
    window.clearTimeout(followUp.current);
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
          : listenWithRecorder({
              lang,
              onInterim: (t) => {
                if (t === '…') set('transcribing');
                setInterim(t === '…' ? '' : t);
              },
              transcribe: (blob) => api.transcribe(blob, lang),
            });
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
          if (enabledRef.current && ++silentTries.current < 2) window.setTimeout(() => listenFn.current(), 250);
          return;
        }
        silentTries.current = 0;
        setHeard(alternatives[0]!);
        handleSpeech(alternatives);
      })
      .catch((err) => {
        if (listenRef.current !== handle) return;
        listenRef.current = null;
        setInterim('');
        set('idle');
        if (err instanceof VoiceInputError && err.code === 'network' && engine === 'browser' && serverStt && recorderSupported()) {
          // e.g. Brave blocks the built-in recognizer: switch to server transcription and retry.
          setEngine('recorder');
          window.setTimeout(() => listenFn.current(), 100);
          return;
        }
        setError(err instanceof Error ? err.message : 'Voice input failed.');
        if (err instanceof VoiceInputError && err.code === 'failed') void say("Sorry, I couldn't catch that. Please try again.");
      });
  }, [engine, handleSpeech, lang, say, serverStt]);
  listenFn.current = listen;

  const stopAll = useCallback(() => {
    window.clearTimeout(followUp.current);
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
    storage.set(STORAGE_KEY, 'off');
  }, [stopAll]);
  const disableRef = useRef(disable);
  disableRef.current = disable;

  /** Speak the current screen's intro, or just start listening. */
  const resume = useCallback(() => {
    const intro = screenRef.current?.current.intro;
    silentTries.current = 0;
    if (intro) {
      lastIntro.current = intro;
      void say(intro);
    } else {
      void say(canListen ? "I'm listening." : 'Voice replies are on.', { listenAfter: true });
    }
  }, [canListen, say]);

  const enable = useCallback(() => {
    unlockSpeech(); // must happen inside the tap
    setEnabled(true);
    enabledRef.current = true;
    setNeedsTap(false);
    needsTapRef.current = false;
    set('idle');
    storage.set(STORAGE_KEY, 'on');
    resume();
  }, [resume]);

  const toggle = useCallback(() => (enabledRef.current && !needsTapRef.current ? disable() : enable()), [disable, enable]);

  const micPress = useCallback(() => {
    if (!enabledRef.current || needsTapRef.current) return enable();
    unlockSpeech();
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

  // Resume a remembered voice mode on the first tap or key press anywhere.
  useEffect(() => {
    if (!needsTap) return;
    const onGesture = (e: Event) => {
      // The mic button and voice toggle handle their own tap.
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

  const setThinking = useCallback(
    (thinking: boolean) => {
      if (thinkingRef.current === thinking) return;
      thinkingRef.current = thinking;
      if (!enabledRef.current) return;
      if (thinking) {
        window.clearTimeout(followUp.current);
        if (statusRef.current === 'idle') set('thinking');
      } else {
        if (statusRef.current === 'thinking') set('idle');
        scheduleFollowUp();
      }
    },
    [scheduleFollowUp],
  );

  const register = useCallback((ref: { current: VoiceScreenConfig }) => {
    screenRef.current = ref;
    setScreen(ref.current.screen);
    return () => {
      if (screenRef.current === ref) screenRef.current = null;
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

  // Stop talking when the tab is hidden; Chrome would otherwise queue speech oddly.
  useEffect(() => {
    const onHide = () => document.hidden && stopAll();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [stopAll]);

  useEffect(() => () => stopAll(), [stopAll]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      enabled: enabled && !needsTap,
      status: enabled && !needsTap ? status : 'off',
      interim,
      heard,
      error,
      canListen,
      canSpeak: ttsSupported,
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
    [enabled, needsTap, status, interim, heard, error, canListen, helpOpen, screen, enable, disable, toggle, micPress, say, setThinking, register, announce],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>');
  return ctx;
}

/** Describe the current screen to voice mode. Call it on every page. */
export function useVoiceScreen(config: VoiceScreenConfig): VoiceContextValue {
  const voice = useVoice();
  const ref = useRef(config);
  ref.current = config;
  const { register, announce, enabled } = voice;
  useEffect(() => register(ref), [register]);
  useEffect(() => {
    announce(config.intro);
    // Re-announce when the intro text changes or voice mode is switched on.
  }, [config.intro, config.screen, enabled, announce]);
  return voice;
}
