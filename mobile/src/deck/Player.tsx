// The YouTube player on the phone. A bare WebView embed fails with YouTube's error 153 (no page
// origin behind the request); the IFrame-API player sets one up properly. Player.web.tsx is the
// web version, so this module (and its dependency) never reaches the web bundle.
import YoutubePlayer from 'react-native-youtube-iframe';

export function Player({ videoId, width }: { videoId: string; title: string; width: number }) {
  return <YoutubePlayer height={Math.round((width * 9) / 16)} width={width} videoId={videoId} play initialPlayerParams={{ modestbranding: true, rel: false }} webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }} />;
}
