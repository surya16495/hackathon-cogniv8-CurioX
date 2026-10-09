// You: a profile on paper. Photo and name on the yellow panel with a few numbers, then the reader
// card (editable row by row), the account, and the small print.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { READER_KEYS, interestsQuestion, tailorQuestions, topicName, type Account, type ReaderCard, type ReaderKey } from '@curiox/shared';
import { ChipGroup } from '../components/ChipGroup';
import { ReaderCardView } from '../components/ReaderCard';
import { Icon } from '../ui/Icon';
import { Btn, Chip, EmptyCard, Ground, IconBtn, Note, Panel, Sheet, Stamp, T, useReduceMotion } from '../ui/kit';
import { curves, fonts, paper, type } from '../ui/tokens';

export interface YouProps {
  reader: ReaderCard;
  saving: boolean;
  onChange: (r: ReaderCard) => void;
  onRedo: () => void;
  onClear: () => void;
  onBack: () => void;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  account: Account | null;
  onSignIn: () => void;
  onSignOut: () => void;
  /** The photo and name, with or without an account. */
  avatar: string | null;
  name: string;
  photoBusy: boolean;
  photoError: string | null;
  onPickPhoto: () => void;
  onRemovePhoto: () => void;
  onName: (name: string) => void;
  stats: { read: number; pinned: number; issues: number };
}

/** The photo, or the first letter of the name on a white round of paper. */
export function Avatar({ uri, name, size = 88 }: { uri: string | null; name: string; size?: number }) {
  const letter = (name.trim()[0] ?? 'C').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: paper.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0px 2px 6px rgba(20,19,16,0.22)' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={{ fontFamily: fonts.disp900, fontSize: size * 0.5, lineHeight: size * 0.58, color: paper.ink }}>{letter}</Text>
      )}
    </View>
  );
}

function Stat({ n, label, delay }: { n: number; label: string; delay: number }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(v, { toValue: 1, duration: 380, delay, easing: Easing.bezier(...curves.slap), useNativeDriver: true }).start();
  }, [v, delay, reduce]);
  return (
    <Animated.View style={{ alignItems: 'center', minWidth: 72, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
      <Text style={{ fontFamily: fonts.disp900, fontSize: 30, lineHeight: 34, color: paper.ink }}>{n}</Text>
      <Text style={[type.typed, { color: paper.ink2 }]}>{label}</Text>
    </Animated.View>
  );
}

export function YouScreen(p: YouProps) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [open, setOpen] = useState<ReaderKey | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(p.name);
  const empty = READER_KEYS.every((k) => !p.reader[k].length);
  const questions = [interestsQuestion(), ...tailorQuestions(p.reader.interests)];
  const displayName = p.name.trim() || p.account?.name || 'Curious reader';

  // The panel lands first, then the photo settles on it.
  const land = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(land, { toValue: 1, duration: 460, easing: Easing.bezier(...curves.slap), useNativeDriver: true }).start();
  }, [land, reduce]);

  const commitName = () => {
    setEditingName(false);
    const v = nameDraft.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (v && v !== p.name) p.onName(v);
    else setNameDraft(p.name);
  };

  return (
    <Ground>
      <View style={{ paddingTop: insets.top + 4, paddingLeft: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 }}>
        <IconBtn name="back" label="Back to Home" onPress={p.onBack} />
        <T v="typed" muted>
          {p.saving ? 'saving…' : p.account ? 'synced to your account' : 'saved on this device'}
        </T>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 22 }} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: land, transform: [{ translateY: land.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { rotate: land.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '-0.6deg'] }) }] }}>
          <Panel style={{ paddingTop: 22, paddingHorizontal: 20, paddingBottom: 20, overflow: 'visible' }}>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={p.avatar ? 'Change your photo' : 'Add a photo'}
                disabled={p.photoBusy}
                onPress={p.onPickPhoto}
                style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.96 : 1 }, { rotate: '-3deg' }] }]}
              >
                <Avatar uri={p.avatar} name={displayName} />
                <View style={{ position: 'absolute', right: -4, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: paper.ink, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 1px 3px rgba(20,19,16,0.3)' }}>
                  <Icon name={p.photoBusy ? 'refresh' : 'pen'} size={16} color={paper.yellow} />
                </View>
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                {editingName ? (
                  <TextInput
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    onBlur={commitName}
                    onSubmitEditing={commitName}
                    autoFocus
                    maxLength={60}
                    returnKeyType="done"
                    accessibilityLabel="Your name"
                    style={[type.note, { color: paper.pen, borderBottomWidth: 2, borderStyle: 'dashed', borderBottomColor: paper.ink, paddingVertical: 2, lineHeight: undefined }]}
                  />
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${displayName}. Edit your name`} onPress={() => { setNameDraft(p.name); setEditingName(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text numberOfLines={2} style={{ fontFamily: fonts.disp800, fontSize: 24, lineHeight: 28, color: paper.ink, flexShrink: 1 }}>{displayName}</Text>
                    <Icon name="pen" size={16} color={paper.ink2} />
                  </Pressable>
                )}
                <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: paper.ink2 }}>{p.account ? p.account.email : 'Reading on this device'}</Text>
                {p.reader.interests.length > 0 && (
                  <Text numberOfLines={2} style={[type.note, { color: paper.pen, marginTop: 4, lineHeight: 24 }]}>follows {p.reader.interests.slice(0, 3).map(topicName).join(', ')}{p.reader.interests.length > 3 ? ` +${p.reader.interests.length - 3}` : ''}</Text>
                )}
              </View>
            </View>
            {!!p.photoError && (
              <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 18, color: paper.ink2, marginTop: 10 }} accessibilityLiveRegion="polite">
                {p.photoError}
              </Text>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 20, paddingTop: 16, borderTopWidth: 1.5, borderStyle: 'dotted', borderTopColor: paper.rule }}>
              <Stat n={p.stats.issues} label="issues" delay={260} />
              <Stat n={p.stats.read} label="read" delay={340} />
              <Stat n={p.stats.pinned} label="pinned" delay={420} />
            </View>
            {p.avatar && (
              <Pressable accessibilityRole="button" onPress={p.onRemovePhoto} style={{ position: 'absolute', right: 14, top: 10 }} hitSlop={8}>
                <Text style={[type.typed, { color: paper.ink2 }]}>remove photo</Text>
              </Pressable>
            )}
            <Stamp label={p.account ? 'Member' : 'Guest'} small style={{ position: 'absolute', right: -6, bottom: -12 }} bg={paper.white} />
          </Panel>
        </Animated.View>

        <T v="secH" style={{ marginTop: 34, marginBottom: 12 }}>
          Your reader card
        </T>
        {empty ? (
          <EmptyCard note="nothing saved yet" body="Answer the five questions and CurioX fills this card in." action="Start the five questions" onAction={p.onRedo} />
        ) : (
          <ReaderCardView
            reader={p.reader}
            editable
            openKey={open}
            onRow={(k) => setOpen(open === k ? null : k)}
            renderEditor={(k) => {
              const q = questions.find((x) => x.key === k)!;
              return <ChipGroup q={q} values={p.reader[k]} onChange={(v) => p.onChange({ ...p.reader, [k]: v })} />;
            }}
          />
        )}
        {!empty && <Note arrow style={{ marginTop: 10 }}>tap a row to change it</Note>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
          <Btn label="Redo the five questions" variant="paper" onPress={p.onRedo} />
          {!empty && <Btn label="Clear my card" variant="paper" onPress={() => p.setConfirming(true)} />}
        </View>
        {p.confirming && (
          <View style={{ marginTop: 12, gap: 12 }} accessibilityLiveRegion="polite">
            <T style={{ fontFamily: fonts.disp700, fontSize: 17, lineHeight: 22 }}>Clear everything CurioX knows about you?</T>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Btn label="Yes, clear it" onPress={p.onClear} />
              <Btn label="Keep it" variant="paper" onPress={() => p.setConfirming(false)} />
            </View>
          </View>
        )}

        <T v="secH" style={{ marginTop: 36, marginBottom: 12 }}>
          Account
        </T>
        <Sheet staple>
          {p.account ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                <Chip label={p.account.email} selected icon="you" />
              </View>
              <T v="hint" muted onPaper>
                Your reader card, issues and pins follow this account on any phone.
              </T>
              <Btn label="Sign out" variant="paper" onPress={p.onSignOut} />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <T v="hint" muted onPaper>
                Make an account to keep your reader card, issues and pins on every phone.
              </T>
              <Btn label="Sign in or create an account" onPress={p.onSignIn} />
            </View>
          )}
        </Sheet>
        <T v="typed" muted style={{ marginTop: 36 }}>
          CurioX by Team cogniv8. Sticker artwork: Twemoji, CC BY 4.0.
        </T>
      </ScrollView>
    </Ground>
  );
}
