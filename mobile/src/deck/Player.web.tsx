// The YouTube player on the web: a plain iframe.
import { createElement } from 'react';

export function Player({ videoId, title }: { videoId: string; title: string; width: number }) {
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
  return createElement('iframe', { src, title, allow: 'autoplay; encrypted-media; picture-in-picture', allowFullScreen: true, style: { width: '100%', height: '100%', border: 0 } });
}
