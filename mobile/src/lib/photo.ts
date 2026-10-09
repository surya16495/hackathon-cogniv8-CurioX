// Pick a profile photo and shrink it to a small square JPEG data URL (at most 48 KB, so it fits
// in the user record and travels with the session). Works on web too.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const PHOTO_LIMIT = 48 * 1024;

export type PhotoPick = { status: 'ok'; dataUrl: string } | { status: 'cancelled' } | { status: 'denied' } | { status: 'error'; message: string };

async function shrink(uri: string, width: number, compress: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri).resize({ width });
  const img = await ctx.renderAsync();
  try {
    const out = await img.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    return `data:image/jpeg;base64,${out.base64 ?? ''}`;
  } finally {
    img.release();
    ctx.release();
  }
}

export async function pickPhoto(): Promise<PhotoPick> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { status: 'denied' };
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (res.canceled || !res.assets[0]) return { status: 'cancelled' };
    // Try a 256px square first; drop the size until it fits the limit.
    for (const [width, compress] of [[256, 0.8], [192, 0.7], [128, 0.6], [96, 0.5]] as const) {
      const dataUrl = await shrink(res.assets[0].uri, width, compress);
      if (dataUrl.length <= PHOTO_LIMIT) return { status: 'ok', dataUrl };
    }
    return { status: 'error', message: 'That photo is too detailed to shrink. Try another.' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Could not open your photos.' };
  }
}
