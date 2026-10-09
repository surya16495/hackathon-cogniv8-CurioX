import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KNOWLEDGE_LEVELS, type KnowledgeLevel, type Profile as ProfileData } from '@curiox/shared';
import { ApiError, api } from '../api/client';
import { storage } from '../lib/storage';
import { useSession } from '../hooks/useSession';
import type { Command, ListField } from '../voice/commands';
import { MicFab } from '../voice/VoiceControls';
import { useVoiceScreen } from '../voice/VoiceProvider';

const toList = (text: string, max: number) =>
  [...new Set(text.split(/\n|,/).map((s) => s.trim()).filter(Boolean))].map((s) => s.slice(0, 200)).slice(0, max);

const FIELD_NAME: Record<ListField, string> = { interests: 'interest', goals: 'goal', curiosities: 'curiosity' };

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function describe(p: ProfileData): string {
  const parts: string[] = [];
  parts.push(p.interests.length ? `Your interests are ${joinList(p.interests)}.` : 'You have no interests saved yet.');
  if (p.knowledgeLevels.length) parts.push(`Levels: ${joinList(p.knowledgeLevels.map((k) => `${k.topic}, ${k.level}`))}.`);
  if (p.goals.length) parts.push(`Your goals: ${joinList(p.goals)}.`);
  if (p.explanationStyle) parts.push(`You like explanations with ${p.explanationStyle}.`);
  if (p.tone) parts.push(`Tone: ${p.tone}.`);
  if (p.curiosities.length) parts.push(`You're curious about ${joinList(p.curiosities)}.`);
  return parts.join(' ');
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Voice and data actions live here; the form below re-mounts after a spoken edit to show it. */
export default function Profile() {
  const { session, update } = useSession();
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const profile = session?.profile;

  const redoOnboarding = async () => {
    try {
      const res = await api.onboarding({ restart: true });
      update(session!.profile, res.onboarding);
      navigate('/');
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not restart.' });
    }
  };

  const clearAll = async () => {
    try {
      const res = await api.clearProfile(true);
      storage.remove('curiox.conversationId');
      update(res.profile, res.onboarding);
      navigate('/');
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not clear.' });
    }
  };

  /** Save one spoken edit right away and say what changed. */
  const voiceEdit = async (patch: Partial<ProfileData>, spoken: string) => {
    try {
      const res = await api.updateProfile(patch);
      update(res.profile, res.onboarding);
      setVersion((v) => v + 1);
      setMessage({ ok: true, text: spoken });
      void voice.say(`${spoken} Anything else?`);
    } catch (err) {
      const text = err instanceof ApiError ? err.message : 'Could not save.';
      setMessage({ ok: false, text });
      void voice.say(text);
    }
  };

  const onCommand = (cmd: Command): boolean | void => {
    if (!profile) return false;
    switch (cmd.type) {
      case 'back':
        navigate('/');
        return;
      case 'readProfile':
        void voice.say(describe(profile));
        return;
      case 'redoOnboarding':
        void redoOnboarding();
        return;
      case 'clearAll':
        setConfirming(true);
        void voice.say('This deletes your profile and all your conversations. Say yes to delete everything, or no to keep it.');
        return;
      case 'confirm':
        setConfirming(false);
        void clearAll();
        return;
      case 'cancel':
        setConfirming(false);
        void voice.say('Okay, nothing was deleted.');
        return;
      case 'profileAdd': {
        const value = capitalize(cmd.value.trim()).slice(0, 200);
        const list = profile[cmd.field];
        if (list.some((x) => x.toLowerCase() === value.toLowerCase())) {
          void voice.say(`${value} is already there.`);
          return;
        }
        const max = cmd.field === 'goals' ? 10 : 20;
        void voiceEdit({ [cmd.field]: [...list, value].slice(-max) }, `Added ${value} to your ${cmd.field}.`);
        return;
      }
      case 'profileRemove': {
        const target = cmd.value.trim().toLowerCase();
        const list = profile[cmd.field];
        const keep = list.filter((x) => x.toLowerCase() !== target && !x.toLowerCase().includes(target));
        if (keep.length === list.length) {
          void voice.say(`I couldn't find ${cmd.value} in your ${cmd.field}.`);
          return;
        }
        void voiceEdit({ [cmd.field]: keep }, `Removed ${FIELD_NAME[cmd.field]} ${cmd.value}.`);
        return;
      }
      case 'profileSet': {
        const value = cmd.value.trim().slice(0, cmd.field === 'tone' ? 200 : 300);
        void voiceEdit({ [cmd.field]: value }, cmd.field === 'tone' ? `Tone set to ${value}.` : `I'll explain things with ${value}.`);
        return;
      }
      default:
        return false;
    }
  };

  const voice = useVoiceScreen({
    screen: 'profile',
    intro: 'This is your learning profile. Say read my profile, or edit it with things like add interest chess, or set tone to playful. Say go back when you are done.',
    confirming,
    onCommand,
  });

  return (
    <>
      <ProfileForm
        key={version}
        confirmClear={confirming}
        setConfirmClear={setConfirming}
        message={message}
        setMessage={setMessage}
        onRedo={redoOnboarding}
        onClear={clearAll}
      />
      <MicFab />
    </>
  );
}

interface FormProps {
  confirmClear: boolean;
  setConfirmClear: (v: boolean) => void;
  message: { ok: boolean; text: string } | null;
  setMessage: (m: { ok: boolean; text: string } | null) => void;
  onRedo: () => void;
  onClear: () => void;
}

function ProfileForm({ confirmClear, setConfirmClear, message, setMessage, onRedo, onClear }: FormProps) {
  const { session, update } = useSession();
  const profile = session?.profile;

  const [interests, setInterests] = useState(profile?.interests.join(', ') ?? '');
  const [levels, setLevels] = useState(profile?.knowledgeLevels ?? []);
  const [goals, setGoals] = useState(profile?.goals.join('\n') ?? '');
  const [style, setStyle] = useState(profile?.explanationStyle ?? '');
  const [tone, setTone] = useState(profile?.tone ?? '');
  const [curiosities, setCuriosities] = useState(profile?.curiosities.join('\n') ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const patch: ProfileData = {
      interests: toList(interests, 20),
      knowledgeLevels: levels.filter((l) => l.topic.trim()).map((l) => ({ topic: l.topic.trim().slice(0, 200), level: l.level })).slice(0, 20),
      goals: toList(goals, 10),
      explanationStyle: style.trim().slice(0, 300),
      tone: tone.trim().slice(0, 200),
      curiosities: toList(curiosities, 20),
    };
    try {
      const res = await api.updateProfile(patch);
      update(res.profile, res.onboarding);
      setMessage({ ok: true, text: 'Saved. Your next answers will use this.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900';

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link to="/" className="rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800">
          ← Back
        </Link>
        <h1 className="text-lg font-bold">Your learning profile</h1>
      </header>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        CurioX uses this to tailor every answer. It's linked to this device only; there's no account. In voice mode, try saying “add interest chess” or
        “set tone to playful”.
      </p>

      <form onSubmit={save} className="mt-5 space-y-5">
        <Field label="Interests" hint="Separate with commas">
          <input className={input} value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="astronomy, cooking, AI" />
        </Field>

        <Field label="Knowledge levels">
          <div className="space-y-2">
            {levels.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={input}
                  aria-label="Topic"
                  value={l.topic}
                  onChange={(e) => setLevels((ls) => ls.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)))}
                />
                <select
                  aria-label="Level"
                  className={`${input} w-40`}
                  value={l.level}
                  onChange={(e) => setLevels((ls) => ls.map((x, j) => (j === i ? { ...x, level: e.target.value as KnowledgeLevel } : x)))}
                >
                  {KNOWLEDGE_LEVELS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label="Remove" onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))} className="px-2 text-slate-400 hover:text-red-600">
                  ✕
                </button>
              </div>
            ))}
            {levels.length < 20 && (
              <button type="button" onClick={() => setLevels((ls) => [...ls, { topic: '', level: 'beginner' }])} className="text-sm font-medium text-brand-600 dark:text-brand-300">
                + Add topic
              </button>
            )}
          </div>
        </Field>

        <Field label="Goals" hint="One per line">
          <textarea className={input} rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} />
        </Field>
        <Field label="How you like explanations">
          <input className={input} maxLength={300} value={style} onChange={(e) => setStyle(e.target.value)} placeholder="analogies, step by step" />
        </Field>
        <Field label="Tone">
          <input className={input} maxLength={200} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="casual and playful" />
        </Field>
        <Field label="Curious about" hint="One per line">
          <textarea className={input} rows={3} value={curiosities} onChange={(e) => setCuriosities(e.target.value)} />
        </Field>

        {message && <p className={`text-sm ${message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}
        <button disabled={saving} className="rounded-xl bg-brand-600 px-6 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <section className="mt-10 space-y-3 border-t border-slate-200 pt-6 dark:border-slate-800">
        <h2 className="font-semibold">Start fresh</h2>
        <button onClick={onRedo} className="block rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900">
          Redo the getting-to-know-you questions
        </button>
        {confirmClear ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3 text-sm dark:bg-red-950/40">
            <span className="text-red-800 dark:text-red-200">Delete your profile and all conversations on this device?</span>
            <button onClick={onClear} className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700">
              Delete everything
            </button>
            <button onClick={() => setConfirmClear(false)} className="px-2 py-1.5 text-slate-600 dark:text-slate-300">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmClear(true)} className="block rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
            Clear profile and history
          </button>
        )}
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-2 text-sm font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
