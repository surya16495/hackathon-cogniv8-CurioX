// Sign in or create an account, on paper. An account keeps the reader card, issues and pins
// across phones; "Skip for now" keeps everything on this device only.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cut } from '../ui/Art';
import { Btn, Ground, Note, Panel, Sheet, T } from '../ui/kit';
import { fonts, paper, type } from '../ui/tokens';

export interface AuthProps {
  busy: boolean;
  error: string | null;
  onSignUp: (name: string, email: string, password: string) => void;
  onSignIn: (email: string, password: string) => void;
  onSkip?: () => void;
  /** Already have a reader card on this device: say so, the account will keep it. */
  hasCard?: boolean;
}

function Field({ label, value, onChange, secure, keyboard, autoComplete }: { label: string; value: string; onChange: (t: string) => void; secure?: boolean; keyboard?: 'email-address' | 'default'; autoComplete?: 'name' | 'email' | 'password' | 'new-password' }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontFamily: fonts.typeBold, fontSize: 13, letterSpacing: 0.78, textTransform: 'uppercase', color: paper.ink2 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={keyboard}
        autoCapitalize={keyboard === 'email-address' || secure ? 'none' : 'words'}
        autoCorrect={false}
        autoComplete={autoComplete}
        accessibilityLabel={label}
        style={[type.note, { color: paper.pen, borderBottomWidth: 2, borderStyle: 'dashed', borderBottomColor: paper.ink, paddingVertical: 6, paddingHorizontal: 2, lineHeight: undefined }]}
      />
    </View>
  );
}

export function AuthScreen({ busy, error, onSignUp, onSignIn, onSkip, hasCard }: AuthProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'up' | 'in'>('up');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const canGo = email.includes('@') && password.length >= 6 && (mode === 'in' || name.trim().length > 0);
  const go = () => (mode === 'up' ? onSignUp(name.trim(), email.trim(), password) : onSignIn(email.trim(), password));

  return (
    <Ground>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 18) }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ gap: 6, flex: 1 }}>
              <T v="xl" accessibilityRole="header">
                {mode === 'up' ? 'Make it yours' : 'Welcome back'}
              </T>
              <T v="hint" muted style={{ maxWidth: 240 }}>
                {mode === 'up' ? 'An account keeps your reader card, issues and pins on every phone.' : 'Sign in and your issues and pins come with you.'}
              </T>
            </View>
            <Cut art={mode === 'up' ? 'key' : 'wave_hand'} size={96} rotate={8} />
          </View>

          <Sheet tape style={{ marginTop: 26, gap: 18 }}>
            {mode === 'up' && <Field label="Name" value={name} onChange={setName} autoComplete="name" />}
            <Field label="Email" value={email} onChange={setEmail} keyboard="email-address" autoComplete="email" />
            <Field label="Password" value={password} onChange={setPassword} secure autoComplete={mode === 'up' ? 'new-password' : 'password'} />
            {!!error && <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: paper.bad }}>{error}</Text>}
            <Btn label={busy ? 'One moment…' : mode === 'up' ? 'Create my account' : 'Sign in'} onYellow wide disabled={!canGo || busy} onPress={go} />
          </Sheet>

          <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <T v="hint" muted>
              {mode === 'up' ? 'Already have an account?' : 'New here?'}
            </T>
            <Btn label={mode === 'up' ? 'Sign in' : 'Create one'} variant="text" onPress={() => setMode(mode === 'up' ? 'in' : 'up')} />
          </View>

          {hasCard && <Note arrow style={{ marginTop: 8 }}>your reader card on this phone stays with the account</Note>}

          <View style={{ flex: 1, minHeight: 24 }} />
          {onSkip && (
            <Panel style={{ padding: 16, gap: 8 }}>
              <Text style={[type.panelBody, { color: paper.ink }]}>Just looking? You can read without an account; everything stays on this phone.</Text>
              <Btn label="Skip for now" onYellow onPress={onSkip} />
            </Panel>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Ground>
  );
}
