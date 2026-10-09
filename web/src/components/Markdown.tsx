import { memo } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Source } from '@curiox/shared';

// "[1]" citations become links with a cite: URL, rendered as numbered chips that open the source.
const CITATION = /\[(\d{1,2})\](?!\()/g;

function linkCitations(text: string, sources: Source[]): string {
  if (!sources.length) return text;
  return text.replace(CITATION, (match, n) => (sources.some((s) => s.id === Number(n)) ? `[${n}](cite:${n})` : match));
}

interface Props {
  text: string;
  sources?: Source[];
}

export const Markdown = memo(function Markdown({ text, sources = [] }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) => (url.startsWith('cite:') ? url : defaultUrlTransform(url))}
      components={{
        a({ href, children }) {
          if (href?.startsWith('cite:')) {
            const source = sources.find((s) => s.id === Number(href.slice(5)));
            return (
              <a
                href={source?.url}
                target="_blank"
                rel="noopener noreferrer"
                title={source?.title}
                className="!no-underline mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-100 px-1 align-text-top text-[11px] font-semibold text-brand-700 hover:bg-brand-200 dark:bg-brand-900 dark:text-brand-200"
              >
                {children}
              </a>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        img: () => null, // never load images the model invents
      }}
    >
      {linkCitations(text, sources)}
    </ReactMarkdown>
  );
});
