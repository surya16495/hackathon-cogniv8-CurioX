// A small Markdown renderer for model answers: headings, lists, quotes, code, bold, italic,
// links and [n] citation chips. Model output only uses this subset, so no heavy dependency.
import { memo, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { Source } from '@curiox/shared';
import { useColors, type Colors } from '../theme';

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

function Inline({ text, sources, c }: { text: string; sources: Source[]; c: Colors }): ReactNode {
  const parts = text.split(INLINE).filter(Boolean);
  return parts.map((p, i) => {
    if (/^(\*\*|__)/.test(p)) return <Text key={i} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text>;
    if (/^`/.test(p)) return <Text key={i} style={[styles.code, { backgroundColor: c.codeBg }]}>{p.slice(1, -1)}</Text>;
    if (/^[*_]/.test(p) && p.length > 2) return <Text key={i} style={{ fontStyle: 'italic' }}>{p.slice(1, -1)}</Text>;
    const cite = p.match(/^\[(\d{1,2})\]$/);
    if (cite) {
      const source = sources.find((s) => s.id === Number(cite[1]));
      if (!source) return p;
      return (
        <Text
          key={i}
          accessibilityRole="link"
          accessibilityLabel={`Source ${source.id}: ${source.title}`}
          onPress={() => Linking.openURL(source.url)}
          style={[styles.cite, { backgroundColor: c.citeBg, color: c.citeText }]}
        >
          {` ${source.id} `}
        </Text>
      );
    }
    const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link && /^https?:\/\//.test(link[2]!)) {
      return (
        <Text key={i} accessibilityRole="link" onPress={() => Linking.openURL(link[2]!)} style={{ color: c.accentText, textDecorationLine: 'underline' }}>
          {link[1]}
        </Text>
      );
    }
    return p;
  });
}

export const Markdown = memo(function Markdown({ text, sources = [], cursor }: { text: string; sources?: Source[]; cursor?: boolean }) {
  const c = useColors();
  const blocks = parseBlocks(text);
  const body = { color: c.text, fontSize: 16, lineHeight: 24 };
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, bi) => {
        const isLast = bi === blocks.length - 1;
        const tail = cursor && isLast ? <Text style={{ color: c.primary }}>▍</Text> : null;
        switch (b.kind) {
          case 'heading':
            return (
              <Text key={bi} style={[body, { fontWeight: '700', fontSize: 17 }]}>
                <Inline text={b.text} sources={sources} c={c} />
                {tail}
              </Text>
            );
          case 'bullet':
          case 'number':
            return (
              <View key={bi} style={{ gap: 6 }}>
                {b.items.map((item, ii) => (
                  <View key={ii} style={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}>
                    <Text style={[body, { minWidth: 18, color: c.muted }]}>{b.kind === 'bullet' ? '•' : `${(item as { n: string }).n}.`}</Text>
                    <Text style={[body, { flex: 1 }]}>
                      <Inline text={typeof item === 'string' ? item : item.text} sources={sources} c={c} />
                      {isLast && ii === b.items.length - 1 ? tail : null}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={bi} style={{ borderLeftWidth: 3, borderLeftColor: c.citeBg, paddingLeft: 10 }}>
                <Text style={[body, { color: c.muted, fontStyle: 'italic' }]}>
                  <Inline text={b.text} sources={sources} c={c} />
                </Text>
              </View>
            );
          case 'code':
            return (
              <View key={bi} style={{ backgroundColor: c.codeBg, borderRadius: 8, padding: 10 }}>
                <Text style={[styles.code, { color: c.text }]}>{b.text}</Text>
              </View>
            );
          default:
            return (
              <Text key={bi} style={body}>
                <Inline text={b.text} sources={sources} c={c} />
                {tail}
              </Text>
            );
        }
      })}
      {!blocks.length && cursor ? <Text style={{ color: c.primary }}>▍</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  code: { fontFamily: 'monospace', fontSize: 14 },
  cite: { fontSize: 12, fontWeight: '700', borderRadius: 8, overflow: 'hidden' },
});
