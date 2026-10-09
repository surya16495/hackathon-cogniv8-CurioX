// You: the reader card, editable row by row. Saved on this device, no login.
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { READER_KEYS, interestsQuestion, tailorQuestions, type ReaderCard, type ReaderKey } from '@curiox/shared';
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
      <ScrollView contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 22 + insets.bottom }}>
        <T v="xl" accessibilityRole="header">
          Your reader card
        </T>
        <T v="hint" muted style={{ marginTop: 6, marginBottom: 22 }}>
          Saved on this device. No login.{p.saving ? ' Saving…' : ''}
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
        <T v="typed" muted style={{ marginTop: 36 }}>
          Sticker artwork: Twemoji, CC BY 4.0.
        </T>
      </ScrollView>
    </Ground>
  );
}
