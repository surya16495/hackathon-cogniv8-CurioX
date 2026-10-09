// You: the reader card, editable row by row. Saved on this device, no login.
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { READER_KEYS, interestsQuestion, tailorQuestions, type Account, type ReaderCard, type ReaderKey } from '@curiox/shared';
import { ChipGroup } from '../components/ChipGroup';
import { ReaderCardView } from '../components/ReaderCard';
import { Btn, EmptyCard, Ground, IconBtn, T } from '../ui/kit';
import { fonts } from '../ui/tokens';

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
}

export function YouScreen(p: YouProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<ReaderKey | null>(null);
  const empty = READER_KEYS.every((k) => !p.reader[k].length);
  const questions = [interestsQuestion(), ...tailorQuestions(p.reader.interests)];

  return (
    <Ground>
      <View style={{ paddingTop: insets.top + 4, paddingLeft: 6 }}>
        <IconBtn name="back" label="Back to Home" onPress={p.onBack} />
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 22 }}>
        <T v="xl" accessibilityRole="header">
          Your reader card
        </T>
        <T v="hint" muted style={{ marginTop: 6, marginBottom: 22 }}>
          {p.account ? `Signed in as ${p.account.name || p.account.email}.` : 'Saved on this device.'}
          {p.saving ? ' Saving…' : ''}
        </T>
        {empty ? (
          <EmptyCard note="nothing saved yet" body="Answer the six questions and CurioX fills this card in." action="Start the six questions" onAction={p.onRedo} />
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
          <Btn label="Redo the six questions" variant="paper" onPress={p.onRedo} />
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
        {p.account ? (
          <View style={{ gap: 12 }}>
            <T v="hint" muted>
              {p.account.email}. Your reader card, issues and pins follow this account on any phone.
            </T>
            <Btn label="Sign out" variant="paper" onPress={p.onSignOut} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <T v="hint" muted>
              Make an account to keep your reader card, issues and pins on every phone.
            </T>
            <Btn label="Sign in or create an account" onPress={p.onSignIn} />
          </View>
        )}
        <T v="typed" muted style={{ marginTop: 36 }}>
          Sticker artwork: Twemoji, CC BY 4.0.
        </T>
      </ScrollView>
    </Ground>
  );
}
