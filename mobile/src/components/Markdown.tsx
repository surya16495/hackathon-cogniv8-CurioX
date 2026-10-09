// A small Markdown renderer for answers on paper: headings, lists, quotes, code, bold, italic,
// links and [n] citations as circled numbers. Model output only uses this subset, so no heavy dependency.
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Linking, Text, View } from 'react-native';
import type { Source } from '@curiox/shared';
import { fonts, paper, type } from '../ui/tokens';

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'bullet'; items: string[] }
  | { kind: 'number'; items: { n: string; text: string }[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string };

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line.trim())) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i]!.trim())) code.push(lines[i]!);
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^\s*[-*+•]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', text: heading[1]! });
    } else if (bullet) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'bullet') last.items.push(bullet[1]!);
      else blocks.push({ kind: 'bullet', items: [bullet[1]!] });
    } else if (numbered) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'number') last.items.push({ n: numbered[1]!, text: numbered[2]! });
      else blocks.push({ kind: 'number', items: [{ n: numbered[1]!, text: numbered[2]! }] });
    } else if (quote) {
      flush();
      blocks.push({ kind: 'quote', text: quote[1]! });
    } else if (!line.trim()) {
      flush();
    } else {
      // A wrapped line continues the previous list item.
      const last = blocks[blocks.length - 1];
      if (!para.length && /^\s{2,}\S/.test(line) && (last?.kind === 'bullet' || last?.kind === 'number')) {
        if (last.kind === 'bullet') last.items[last.items.length - 1] += ` ${line.trim()}`;
        else last.items[last.items.length - 1]!.text += ` ${line.trim()}`;
      } else para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\[\d{1,2}\])/g;

/** ① ② ③ …: the design's circled citation numbers. */
export const circled = (n: number) => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`);

function Inline({ text, sources }: { text: string; sources: Source[] }): ReactNode {
  const parts = text.split(INLINE).filter(Boolean);
  return parts.map((p, i) => {
    if (/^(\*\*|__)/.test(p)) return <Text key={i} style={{ fontFamily: fonts.bodyBold }}>{p.slice(2, -2)}</Text>;
    if (/^`/.test(p)) return <Text key={i} style={{ fontFamily: fonts.type, fontSize: 14 }}>{p.slice(1, -1)}</Text>;
    if (/^[*_]/.test(p) && p.length > 2) return <Text key={i} style={{ fontFamily: fonts.bodyItalic }}>{p.slice(1, -1)}</Text>;
    const cite = p.match(/^\[(\d{1,2})\]$/);
    if (cite) {
      const source = sources.find((s) => s.id === Number(cite[1]));
      if (!source) return null;
      return (
        <Text key={i} accessibilityRole="link" accessibilityLabel={`Source ${source.id}: ${source.title}`} onPress={() => Linking.openURL(source.url)} style={{ fontFamily: fonts.typeBold, fontSize: 15, color: paper.ink }}>
          {` ${circled(source.id)}`}
        </Text>
      );
    }
    const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link && /^https?:\/\//.test(link[2]!)) {
      return (
        <Text key={i} accessibilityRole="link" onPress={() => Linking.openURL(link[2]!)} style={{ textDecorationLine: 'underline' }}>
          {link[1]}
        </Text>
      );
    }
    return p;
  });
}

/** The pen caret while an answer is still arriving. */
function Caret() {
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.delay(400), Animated.timing(blink, { toValue: 0, duration: 0, useNativeDriver: true }), Animated.delay(400), Animated.timing(blink, { toValue: 1, duration: 0, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [blink]);
  return <Animated.Text style={{ color: paper.pen, opacity: blink }}>{' ▍'}</Animated.Text>;
}

export const Markdown = memo(function Markdown({ text, sources = [], cursor, lead = true }: { text: string; sources?: Source[]; cursor?: boolean; lead?: boolean }) {
  const blocks = parseBlocks(text);
  const body = { ...type.body, color: paper.ink };
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, bi) => {
        const isLast = bi === blocks.length - 1;
        const tail = cursor && isLast ? <Caret /> : null;
        // The opening line of an answer is its short version, set big like the design's .ans-short.
        if (lead && bi === 0 && b.kind === 'para' && b.text.length <= 170) {
          return (
            <Text key={bi} accessibilityRole="header" style={{ fontFamily: fonts.disp800, fontSize: 21, lineHeight: 25, color: paper.ink }}>
              <Inline text={b.text} sources={sources} />
              {tail}
            </Text>
          );
        }
        switch (b.kind) {
          case 'heading':
            return (
              <Text key={bi} style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 21, color: paper.ink }}>
                <Inline text={b.text} sources={sources} />
                {tail}
              </Text>
            );
          case 'bullet':
          case 'number':
            return (
              <View key={bi} style={{ gap: 6 }}>
                {b.items.map((item, ii) => (
                  <View key={ii} style={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}>
                    <Text style={[body, { minWidth: 18, fontFamily: fonts.disp800 }]}>{b.kind === 'bullet' ? '•' : `${(item as { n: string }).n}.`}</Text>
                    <Text style={[body, { flex: 1 }]}>
                      <Inline text={typeof item === 'string' ? item : item.text} sources={sources} />
                      {isLast && ii === b.items.length - 1 ? tail : null}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={bi} style={{ borderLeftWidth: 3, borderLeftColor: paper.yellow, paddingLeft: 10 }}>
                <Text style={[body, { fontFamily: fonts.bodyItalic, color: paper.ink2 }]}>
                  <Inline text={b.text} sources={sources} />
                </Text>
              </View>
            );
          case 'code':
            return (
              <View key={bi} style={{ backgroundColor: 'rgba(20,19,16,0.06)', borderRadius: 4, padding: 10 }}>
                <Text style={{ fontFamily: fonts.type, fontSize: 14, color: paper.ink }}>{b.text}</Text>
              </View>
            );
          default:
            return (
              <Text key={bi} style={body}>
                <Inline text={b.text} sources={sources} />
                {tail}
              </Text>
            );
        }
      })}
      {!blocks.length && cursor ? <Caret /> : null}
    </View>
  );
});
