// The top update as a notification: "Issue No. 14 is out · <lead title>", once per issue per device.
// Local notifications only (no push server), which is all Expo Go allows; tapping one opens the deck.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { KEYS, storage } from './storage';

type Notifications = typeof import('expo-notifications');

let mod: Notifications | null | undefined;
/**
 * expo-notifications is native-only, so web skips the feature. Expo Go on Android skips it too:
 * since SDK 53 the module raises "Android Push notifications … removed from Expo Go" as soon as
 * it is loaded there, even for local notifications. iOS Expo Go and real builds keep it.
 */
function load(): Notifications | null {
  if (mod !== undefined) return mod;
  const expoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (Platform.OS === 'web' || (Platform.OS === 'android' && expoGo)) return (mod = null);
  try {
    mod = require('expo-notifications') as Notifications;
    mod.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
  } catch {
    mod = null;
  }
  return mod;
}

async function allowed(n: Notifications): Promise<boolean> {
  try {
    const current = await n.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await n.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/** Post today's issue once. `key` is the issue's number plus date, so a fresh issue posts again. */
export async function notifyIssue(opts: { key: string; no: number; title: string; deckId: string }): Promise<void> {
  const n = load();
  if (!n) return;
  const seenKey = `${KEYS.notified}:${opts.key}`;
  if (storage.get(seenKey)) return;
  storage.set(seenKey, '1');
  if (!(await allowed(n))) return;
  try {
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync('issues', { name: "Today's issue", importance: n.AndroidImportance.DEFAULT });
    }
    await n.scheduleNotificationAsync({
      content: { title: `Issue No. ${opts.no} is out`, body: `${opts.title}. A few cards, about three minutes.`, data: { deckId: opts.deckId } },
      trigger: null,
    });
  } catch {
    // A device without notification support: nothing to do.
  }
}

/** Call `onOpen(deckId)` when the reader taps an issue notification. Returns a cleanup. */
export function onNotificationOpen(onOpen: (deckId: string) => void): () => void {
  const n = load();
  if (!n) return () => undefined;
  const handle = (r: { notification: { request: { content: { data?: Record<string, unknown> } } } } | null) => {
    const id = r?.notification.request.content.data?.deckId;
    if (typeof id === 'string') onOpen(id);
  };
  const sub = n.addNotificationResponseReceivedListener(handle);
  // The app may have been opened by the notification itself.
  void n.getLastNotificationResponseAsync?.().then(handle).catch(() => undefined);
  return () => sub.remove();
}
