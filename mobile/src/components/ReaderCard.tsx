// The reader card: six answers on a taped-down sheet, written in pen. Read-only after onboarding,
// editable row by row under You.
import { Fragment, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { READER_KEYS, READER_LABELS, type ReaderCard as Card, type ReaderKey } from '@curiox/shared';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/kit';
import { fonts, paper, type } from '../ui/tokens';

function Row({ k, value, editable, open, onPress, empty }: { k: ReaderKey; value: string; editable: boolean; open: boolean; onPress?: () => void; empty: string }) {
  const content = (
    <>
      <Text style={{ width: 92, fontFamily: fonts.typeBold, fontSize: 13, lineHeight: 17, textTransform: 'uppercase', letterSpacing: 0.78, color: paper.ink2, paddingBottom: 3 }}>{READER_LABELS[k]}</Text>
      {value ? (
        <Text style={[type.note, { flex: 1, color: paper.pen, lineHeight: 27 }]}>{value}</Text>
      ) : (
        <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 22, color: paper.ink2 }}>{empty}</Text>
      )}
      {editable ? <Icon name="pen" size={19} color={paper.ink2} /> : <View style={{ width: 19 }} />}
    </>
  );
  const style = { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 13, paddingBottom: 7, borderBottomWidth: 1.5, borderStyle: 'dotted', borderBottomColor: paper.rule } as const;
  if (!editable) return <View style={style}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${READER_LABELS[k]}: ${value || empty}. Edit`} accessibilityState={{ expanded: open }} onPress={onPress} style={style}>
      {content}
    </Pressable>
  );
}

export function ReaderCardView({ reader, editable = false, openKey, onRow, renderEditor }: { reader: Card; editable?: boolean; openKey?: ReaderKey | null; onRow?: (k: ReaderKey) => void; renderEditor?: (k: ReaderKey) => ReactNode }) {
  return (
    <Sheet tape style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 12 }}>
      {READER_KEYS.filter((k) => k !== 'curious' || reader.curious.length > 0).map((k) => (
        <Fragment key={k}>
          <Row k={k} value={reader[k].join(', ')} editable={editable} open={openKey === k} onPress={() => onRow?.(k)} empty={editable ? 'not answered' : 'skipped'} />
          {openKey === k && renderEditor && <View style={{ paddingTop: 14, paddingBottom: 16 }}>{renderEditor(k)}</View>}
        </Fragment>
      ))}
    </Sheet>
  );
}
