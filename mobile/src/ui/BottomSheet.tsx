// A paper sheet that slides up over a dimmed screen: sources, teach it back.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconBtn, T, useReduceMotion } from './kit';
import { curves, paper, useGround } from './tokens';

export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const g = useGround();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: reduce ? 0 : open ? 400 : 250, easing: Easing.bezier(...curves.slap), useNativeDriver: true }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, reduce, anim]);

  if (!mounted) return null;
  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: g.scrim, opacity: anim }}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: height * 0.8,
          backgroundColor: g.strip,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [height * 0.85, 0] }) }],
        }}
      >
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 22 + insets.bottom }}>
          <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: paper.ink, opacity: 0.25, alignSelf: 'center', marginBottom: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -10, marginBottom: 8 }}>
            <T v="m" onPaper accessibilityRole="header">
              {title}
            </T>
            <IconBtn name="x" label="Close" color={paper.ink} onPress={onClose} />
          </View>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
