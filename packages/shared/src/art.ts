// The artwork library: Twemoji (CC BY 4.0), pre-rendered for the app as halftone cut-outs and outlined stickers.
// Decks name their art by key; the server maps anything unknown to a safe default.
// Adding a key here needs a re-run of mobile/scripts/build-art.mjs.

export const ART = {
  // from the design
  popcorn: '🍿', clapper: '🎬', target: '🎯', cricket: '🏏', eyes: '👀', bulb: '💡', speech: '💬', books: '📚',
  megaphone: '📣', plug: '🔌', magnifier: '🔍', microscope: '🔬', wow: '😮', hands: '🙌', rocket: '🚀', truck: '🚛',
  scooter: '🛵', thinking: '🤔', robot: '🤖', mindblown: '🤯', monocle: '🧐', child: '🧒', compass: '🧭', scales: '⚖',
  zap: '⚡', plane: '✈', gift: '🎁', droplet: '💧', moneybag: '💰', memo: '📝',
  // science and space
  globe: '🌍', sun: '☀', moon: '🌙', star: '⭐', comet: '☄', satellite: '🛰', telescope: '🔭', alien: '👽',
  dna: '🧬', atom: '⚛', testtube: '🧪', magnet: '🧲', brain: '🧠',
  // health and body
  heart: '❤', pill: '💊', stethoscope: '🩺', runner: '🏃', apple: '🍎', salad: '🥗', coffee: '☕', sleeping: '😴',
  muscle: '💪',
  // sport and play
  football: '⚽', basketball: '🏀', tennis: '🎾', trophy: '🏆', medal: '🥇', chess: '♟', gamepad: '🎮', dice: '🎲',
  puzzle: '🧩',
  // arts
  music: '🎵', guitar: '🎸', headphones: '🎧', microphone: '🎤', palette: '🎨', camera: '📷', tv: '📺', book: '📖',
  // history and society
  scroll: '📜', temple: '🏛', castle: '🏰', crown: '👑', swords: '⚔', shield: '🛡', map: '🗺', hourglass: '⏳',
  alarm: '⏰', calendar: '📅', ballot: '🗳', newspaper: '📰', people: '👥', baby: '👶', elder: '👴', school: '🏫',
  graduate: '🎓',
  // money and work
  chartup: '📈', chartdown: '📉', barchart: '📊', coin: '🪙', bank: '🏦', card: '💳', cart: '🛒', briefcase: '💼',
  handshake: '🤝', office: '🏢', factory: '🏭', house: '🏠', abacus: '🧮',
  // nature and climate
  seedling: '🌱', tree: '🌳', leaf: '🍃', fire: '🔥', snowflake: '❄', wave: '🌊', tornado: '🌪', rain: '🌧',
  thermometer: '🌡', recycle: '♻', battery: '🔋', mountain: '⛰', volcano: '🌋', island: '🏝', rainbow: '🌈',
  // tech and tools
  gear: '⚙', wrench: '🔧', hammer: '🔨', laptop: '💻', phone: '📱', antenna: '📡', lock: '🔒', key: '🔑',
  pencil: '✏', ruler: '📏', envelope: '✉',
  // travel
  car: '🚗', train: '🚆', ship: '🚢', bicycle: '🚲', tent: '⛺',
  // animals and food
  dog: '🐶', cat: '🐱', lion: '🦁', whale: '🐳', dinosaur: '🦕', butterfly: '🦋', bee: '🐝', mushroom: '🍄',
  pizza: '🍕', teapot: '🫖',
  // marks and moods
  question: '❓', check: '✅', cross: '❌', warning: '⚠', party: '🎉', sparkles: '✨', crystalball: '🔮', laugh: '😂',
  cool: '😎', fear: '😱', shush: '🤫', clap: '👏', wave_hand: '👋', ok_hand: '👌', point: '👉', fingers_crossed: '🤞',
} as const;

export type ArtKey = keyof typeof ART;
export const ART_KEYS = Object.keys(ART) as ArtKey[];

/** Art a deck may use for a "?" cut-out drawn in the display font rather than from an emoji. */
export const TEXT_ART = { qmark: '?' } as const;
export type TextArtKey = keyof typeof TEXT_ART;

const BY_GLYPH = new Map<string, ArtKey>(ART_KEYS.map((k) => [ART[k].replace(/️/g, ''), k]));

/** Map a model's art choice (a key, a near-miss, or an emoji) to a known key. */
export function toArtKey(value: unknown, fallback: ArtKey = 'bulb'): ArtKey {
  if (typeof value !== 'string') return fallback;
  const raw = value.trim();
  const glyph = BY_GLYPH.get(raw.replace(/️/g, ''));
  if (glyph) return glyph;
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (key in ART) return key as ArtKey;
  const loose = key.replace(/_/g, '');
  return ART_KEYS.find((k) => k.replace(/_/g, '') === loose) ?? fallback;
}
