// The phone's notifications: today's top update when the issue loads (local), and updates on what
// the reader follows sent by the server (push, through Expo). Tapping one opens the deck.
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

/**
 * This phone's Expo push token, once notifications are allowed. Needs the EAS project id in
 * app.json (written by `eas build:configure`); without it, or on web / Android Expo Go, null.
 */
export async function pushToken(): Promise<string | null> {
  const n = load();
  if (!n) return null;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  if (!(await allowed(n))) return null;
  try {
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync('issues', { name: "Today's issue", importance: n.AndroidImportance.DEFAULT });
    }
    return (await n.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/** Call `onOpen` with what the tapped notification carries (a deck id, or just a topic). Returns a cleanup. */
export function onNotificationOpen(onOpen: (data: { deckId?: string; topic?: string }) => void): () => void {
  const n = load();
  if (!n) return () => undefined;
  const handle = (r: { notification: { request: { content: { data?: Record<string, unknown> } } } } | null) => {
    const data = r?.notification.request.content.data;
    if (!data) return;
    const deckId = typeof data.deckId === 'string' ? data.deckId : undefined;
    const topic = typeof data.topic === 'string' ? data.topic : undefined;
    if (deckId || topic) onOpen({ deckId, topic });
  };
  const sub = n.addNotificationResponseReceivedListener(handle);
  // The app may have been opened by the notification itself.
  void n.getLastNotificationResponseAsync?.().then(handle).catch(() => undefined);
  return () => sub.remove();
}
