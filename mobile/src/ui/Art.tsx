// Halftone cut-outs and outlined stickers, pre-rendered by scripts/build-art.mjs.
// Artwork: Twemoji (c) Twitter, Inc and other contributors, CC BY 4.0.
import { Image, View, type ViewStyle } from 'react-native';
import type { ArtKey } from '@curiox/shared';
import { CUT_ASSETS, STICKER_ASSETS } from './art-assets';

// Keep in step with build-art.mjs: the size each PNG was drawn at, and the room around it for shadows.
const CUT_SIZE = 180;
const CUT_PAD = 10;
const STK_SIZE = 42;
const STK_PAD = 6;

export type CutKey = ArtKey | 'qmark';

/** A halftone cut-out: ink dots on a white die-cut, with a soft shadow. */
export function Cut({ art, size, rotate = 0, style }: { art: CutKey; size: number; rotate?: number; style?: ViewStyle }) {
  const k = size / CUT_SIZE;
  const src = CUT_ASSETS[art] ?? CUT_ASSETS.bulb;
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null, style]}>
      <Image source={src} style={{ position: 'absolute', left: -CUT_PAD * k, top: -CUT_PAD * k, width: (CUT_SIZE + 2 * CUT_PAD) * k, height: (CUT_SIZE + 2 * CUT_PAD) * k }} />
    </View>
  );
}

/** A full-colour sticker with a white outline, slapped on at an angle. */
export function Sticker({ art, size = 42, rotate = 0, style }: { art: ArtKey; size?: number; rotate?: number; style?: ViewStyle }) {
  const k = size / STK_SIZE;
  const src = STICKER_ASSETS[art] ?? STICKER_ASSETS.bulb;
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null, style]}>
      <Image source={src} style={{ position: 'absolute', left: -STK_PAD * k, top: -STK_PAD * k, width: (STK_SIZE + 2 * STK_PAD) * k, height: (STK_SIZE + 2 * STK_PAD) * k }} />
    </View>
  );
}
