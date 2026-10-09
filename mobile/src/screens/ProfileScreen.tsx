import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KNOWLEDGE_LEVELS, type Command, type KnowledgeLevel, type ListField, type Profile } from '@curiox/shared';
import { ApiError, api } from '@/api/client';
import { Button } from '@/components/ui';
import { useSession } from '@/hooks/useSession';
import { KEYS, storage } from '@/lib/storage';
import { useColors } from '@/theme';
import { MicFab } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';

const FIELD_NAME: Record<ListField, string> = { interests: 'interest', goals: 'goal', curiosities: 'curiosity' };
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const toList = (text: string, max: number) =>
  [...new Set(text.split(/\n|,/).map((s) => s.trim()).filter(Boolean))].map((s) => s.slice(0, 200)).slice(0, max);

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function describe(p: Profile): string {
  const parts: string[] = [];
  parts.push(p.interests.length ? `Your interests are ${joinList(p.interests)}.` : 'You have no interests saved yet.');
  if (p.knowledgeLevels.length) parts.push(`Levels: ${joinList(p.knowledgeLevels.map((k) => `${k.topic}, ${k.level}`))}.`);
  if (p.goals.length) parts.push(`Your goals: ${joinList(p.goals)}.`);
  if (p.explanationStyle) parts.push(`You like explanations with ${p.explanationStyle}.`);
  if (p.tone) parts.push(`Tone: ${p.tone}.`);
  if (p.curiosities.length) parts.push(`You're curious about ${joinList(p.curiosities)}.`);
  return parts.join(' ');
}

type Message = { ok: boolean; text: string } | null;

/** Voice and data actions live here; the form re-mounts after a spoken edit to show it. */
export default function ProfileScreen() {
  const c = useColors();
  const router = useRouter();
  const { session, update } = useSession();
  const [version, setVersion] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const profile = session?.profile;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/chat'));

  const redoOnboarding = async () => {
    try {
      const res = await api.onboarding({ restart: true });
      update(session!.profile, res.onboarding); // the route guard moves us to onboarding
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not restart.' });
    }
  };

  const clearAll = async () => {
    try {
      const res = await api.clearProfile(true);
      storage.remove(KEYS.conversationId);
      update(res.profile, res.onboarding);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not clear.' });
    }
  };

  /** Save one spoken edit right away and say what changed. */
  const voiceEdit = async (patch: Partial<Profile>, spoken: string) => {
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
        back();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={{ padding: 8 }}>
          <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>‹ Back</Text>
        </Pressable>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>Your learning profile</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ProfileForm key={version} message={message} setMessage={setMessage} />
      </KeyboardAvoidingView>
      <DangerZone confirming={confirming} setConfirming={setConfirming} onRedo={redoOnboarding} onClear={clearAll} />
      <MicFab />
    </SafeAreaView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.text, fontWeight: '600' }}>
        {label}
        {hint ? <Text style={{ color: c.subtle, fontWeight: '400', fontSize: 12 }}>{`  ${hint}`}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function ProfileForm({ message, setMessage }: { message: Message; setMessage: (m: Message) => void }) {
  const c = useColors();
  const { session, update } = useSession();
  const profile = session?.profile;
  const [interests, setInterests] = useState(profile?.interests.join(', ') ?? '');
  const [levels, setLevels] = useState(profile?.knowledgeLevels ?? []);
  const [goals, setGoals] = useState(profile?.goals.join('\n') ?? '');
  const [style, setStyle] = useState(profile?.explanationStyle ?? '');
  const [tone, setTone] = useState(profile?.tone ?? '');
  const [curiosities, setCuriosities] = useState(profile?.curiosities.join('\n') ?? '');
  const [saving, setSaving] = useState(false);

  const input = { borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 } as const;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.updateProfile({
        interests: toList(interests, 20),
        knowledgeLevels: levels.filter((l) => l.topic.trim()).map((l) => ({ topic: l.topic.trim().slice(0, 200), level: l.level })).slice(0, 20),
        goals: toList(goals, 10),
        explanationStyle: style.trim().slice(0, 300),
        tone: tone.trim().slice(0, 200),
        curiosities: toList(curiosities, 20),
      });
      update(res.profile, res.onboarding);
      setMessage({ ok: true, text: 'Saved. Your next answers will use this.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: c.muted, lineHeight: 20 }}>
        CurioX uses this to tailor every answer. It's tied to this device only; there's no account. In voice mode, try “add interest chess” or “set tone to playful”.
      </Text>
      <Field label="Interests" hint="Separate with commas">
        <TextInput accessibilityLabel="Interests" style={input} value={interests} onChangeText={setInterests} placeholder="astronomy, cooking, AI" placeholderTextColor={c.subtle} />
      </Field>
      <Field label="Knowledge levels">
        <View style={{ gap: 10 }}>
          {levels.map((l, i) => (
            <View key={i} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  accessibilityLabel="Topic"
                  style={[input, { flex: 1 }]}
                  value={l.topic}
                  onChangeText={(t) => setLevels((ls) => ls.map((x, j) => (j === i ? { ...x, topic: t } : x)))}
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Remove topic" onPress={() => setLevels((ls) => ls.filter((_, j) => j !== i))} style={{ padding: 8 }}>
                  <Text style={{ color: c.subtle, fontSize: 18 }}>✕</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {KNOWLEDGE_LEVELS.map((k) => {
                  const on = l.level === k;
                  return (
                    <Pressable
                      key={k}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setLevels((ls) => ls.map((x, j) => (j === i ? { ...x, level: k as KnowledgeLevel } : x)))}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.accentBg : c.card, alignItems: 'center' }}
                    >
                      <Text style={{ color: on ? c.accentText : c.muted, fontWeight: '600', fontSize: 13 }}>{k}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {levels.length < 20 && (
            <Pressable accessibilityRole="button" onPress={() => setLevels((ls) => [...ls, { topic: '', level: 'beginner' }])}>
              <Text style={{ color: c.primary, fontWeight: '600' }}>+ Add topic</Text>
            </Pressable>
          )}
        </View>
      </Field>
      <Field label="Goals" hint="One per line">
        <TextInput accessibilityLabel="Goals" style={[input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={goals} onChangeText={setGoals} />
      </Field>
      <Field label="How you like explanations">
        <TextInput accessibilityLabel="How you like explanations" style={input} maxLength={300} value={style} onChangeText={setStyle} placeholder="analogies, step by step" placeholderTextColor={c.subtle} />
      </Field>
      <Field label="Tone">
        <TextInput accessibilityLabel="Tone" style={input} maxLength={200} value={tone} onChangeText={setTone} placeholder="casual and playful" placeholderTextColor={c.subtle} />
      </Field>
      <Field label="Curious about" hint="One per line">
        <TextInput accessibilityLabel="Curious about" style={[input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={curiosities} onChangeText={setCuriosities} />
      </Field>
      {message && <Text style={{ color: message.ok ? c.success : c.danger }}>{message.text}</Text>}
      <Button label={saving ? 'Saving…' : 'Save profile'} onPress={save} loading={saving} />
    </ScrollView>
  );
}

function DangerZone({ confirming, setConfirming, onRedo, onClear }: { confirming: boolean; setConfirming: (v: boolean) => void; onRedo: () => void; onClear: () => void }) {
  const c = useColors();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.border, padding: 16, paddingRight: 96, gap: 10 }}>
      {confirming ? (
        <View style={{ backgroundColor: c.dangerBg, borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: c.dangerText }}>Delete your profile and all conversations on this device?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Delete everything" variant="danger" onPress={onClear} style={{ paddingVertical: 8 }} />
            <Button label="Cancel" variant="ghost" onPress={() => setConfirming(false)} style={{ paddingVertical: 8 }} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <Pressable accessibilityRole="button" onPress={onRedo}>
            <Text style={{ color: c.primary, fontWeight: '600' }}>Redo the questions</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setConfirming(true)}>
            <Text style={{ color: c.danger, fontWeight: '600' }}>Clear profile and history</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
