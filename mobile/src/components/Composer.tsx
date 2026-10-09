import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { LIMITS } from '@curiox/shared';
import { useColors } from '../theme';

interface Props {
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  onSend: (text: string) => void;
  onStop?: () => void;
  /** Mic button shown next to the send button. */
  voiceButton?: ReactNode;
}

export default function Composer({ busy, disabled, placeholder = 'Ask anything…', maxLength = LIMITS.messageMaxChars, onSend, onStop, voiceButton }: Props) {
  const c = useColors();
  const [text, setText] = useState('');
  const canSend = !!text.trim() && !busy && !disabled;

  const submit = () => {
    const value = text.trim();
    if (!canSend) return;
    onSend(value);
    setText('');
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 22, padding: 6 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={c.subtle}
        multiline
        maxLength={maxLength}
        editable={!disabled}
        accessibilityLabel="Message"
        returnKeyType="send"
        submitBehavior="submit"
        onSubmitEditing={submit}
        style={{ flex: 1, color: c.text, fontSize: 16, maxHeight: 140, minHeight: 40, paddingHorizontal: 10, paddingVertical: 9 }}
      />
      {voiceButton}
      {busy && onStop ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Stop answering" onPress={onStop} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: c.bg }} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={submit}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: canSend ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: canSend ? c.onPrimary : c.subtle, fontSize: 20, fontWeight: '700' }}>↑</Text>
        </Pressable>
      )}
    </View>
  );
}
