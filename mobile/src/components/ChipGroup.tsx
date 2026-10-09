// A question's chips: tap to choose (a highlighter swipe and a pen ring), plus an optional
// "write your own" line in pen. Answers the reader typed show up as chips too.
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { ReaderQuestion } from '@curiox/shared';
import { Chip } from '../ui/kit';
import { type, useGround } from '../ui/tokens';

export function toggleValue(q: Pick<ReaderQuestion, 'multi'>, values: string[], v: string): string[] {
  if (q.multi) return values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
  return values[0] === v ? [] : [v];
}

/** Add a typed answer to the picked values (no duplicates, any case). */
export function withDraft(q: Pick<ReaderQuestion, 'multi'>, values: string[], draft: string): string[] {
  const v = draft.trim().replace(/\s+/g, ' ');
  if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) return values;
  return q.multi ? [...values, v] : [v];
}

export function ChipGroup({ q, values, onChange, freeLabel, freePlaceholder = 'write it here', onFreeSubmit, onDraft }: { q: ReaderQuestion; values: string[]; onChange: (v: string[]) => void; freeLabel?: string; freePlaceholder?: string; onFreeSubmit?: () => void; onDraft?: (text: string) => void }) {
  const g = useGround();
  const [draft, setDraftState] = useState('');
  const setDraft = (t: string) => {
    setDraftState(t);
    onDraft?.(t);
  };
  // Typed answers become chips of their own, so they can be seen and un-picked.
  const options = [...q.options, ...values.filter((v) => !q.options.includes(v))];

  const addDraft = () => {
    if (!draft.trim()) return false;
    onChange(withDraft(q, values, draft));
    setDraft('');
    return true;
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {options.map((o, i) => (
          <Chip key={o} label={o} index={i} selected={values.includes(o)} onPress={() => onChange(toggleValue(q, values, o))} />
        ))}
      </View>
      {q.free && (
        <View style={{ gap: 6, marginTop: 22 }}>
          <Text style={[type.hint, { color: g.onGround2 }]}>{freeLabel ?? (q.key === 'interests' ? 'Something else?' : 'Your own question')}</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => {
              if (!addDraft()) onFreeSubmit?.();
            }}
            onBlur={addDraft}
            placeholder={freePlaceholder}
            placeholderTextColor={g.onGround2}
            returnKeyType="done"
            autoCorrect
            maxLength={q.key === 'curious' ? 200 : 60}
            accessibilityLabel={freeLabel ?? 'Write your own'}
            style={[type.note, { color: g.pen, borderBottomWidth: 2, borderStyle: 'dashed', borderBottomColor: g.onGround, paddingVertical: 8, paddingHorizontal: 2, lineHeight: undefined }]}
          />
        </View>
      )}
    </View>
  );
}
