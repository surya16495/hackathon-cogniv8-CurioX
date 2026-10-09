// What voice mode shows app-wide: an error pill and the "what can I say" sheet. Talk itself draws the blob.
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HELP_TEXT } from '@curiox/shared';
import { BottomSheet } from '../ui/BottomSheet';
import { Btn } from '../ui/kit';
import { fonts, paper, type } from '../ui/tokens';
import { useVoice } from './VoiceProvider';

/** Live status, what was heard, errors, and the "what can I say" sheet. Rendered once, app-wide. */
export function VoiceOverlay() {
  const voice = useVoice();
  const insets = useSafeAreaInsets();
  // Over the screen's top bar, so it never sits on a headline or a card.
  const top = insets.top + 6;

  const pill = (content: React.ReactNode) => (
    <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 60, right: 60, alignItems: 'center', zIndex: 60 }}>
      <View style={{ backgroundColor: paper.ink, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 420, transform: [{ rotate: '-0.6deg' }] }}>{content}</View>
    </View>
  );
  const text = { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: paper.white } as const;

  return (
    <>
      {voice.needsTap && pill(<Text style={[text, { fontFamily: fonts.bodyBold }]}>Tap anywhere to carry on in voice mode</Text>)}
      {voice.enabled && !!voice.error && pill(<Text style={text}>{voice.error}</Text>)}
      <BottomSheet open={voice.helpOpen} title="What you can say" onClose={() => voice.setHelpOpen(false)}>
        <View style={{ gap: 10 }}>
          {voice.screen && <Text style={[type.body, { color: paper.ink }]}>{HELP_TEXT[voice.screen]}</Text>}
          <Text style={{ fontFamily: fonts.disp800, fontSize: 17, color: paper.ink, marginTop: 6 }}>Anywhere</Text>
          {['“help”: hear these again', '“repeat”: say the last thing again', '“stop”: stop talking', '“staple it”: keep the talk as a deck', '“that’s all” or “bye”: wrap up'].map((t) => (
            <Text key={t} style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: paper.ink2 }}>
              {t}
            </Text>
          ))}
          <Text style={[type.typed, { color: paper.ink2, marginTop: 6 }]}>Press the blob to talk, or press it while CurioX is speaking to interrupt.</Text>
          <Btn label="Got it" onYellow wide onPress={() => voice.setHelpOpen(false)} style={{ marginTop: 8 }} />
        </View>
      </BottomSheet>
    </>
  );
}
