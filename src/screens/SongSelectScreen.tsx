import React from 'react';

interface Song {
  id: string;
  title: string;
  artist: string;
  beatmapUrl: string;
  description: string;
}

const SONGS: Song[] = [
  {
    id: 'groove',
    title: 'Gesture Groove',
    artist: 'Built-in Rhythm Track',
    beatmapUrl: '/songs/demo-groove.beatmap.json',
    description: 'Recommended: includes TAP + SWIPE + domain gesture triggers.',
  },
  {
    id: 'classic-demo',
    title: 'Classic Demo',
    artist: 'WebAudio Synth',
    beatmapUrl: '/songs/demo.beatmap.json',
    description: 'Short stage with mixed tap/swipe notes.',
  },
];

interface Props {
  onSelect: (beatmapUrl: string) => void;
}

export default function SongSelectScreen({ onSelect }: Props): React.ReactElement {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 20% 20%, #0e2533 0%, #091118 42%, #05070b 100%)',
        color: '#ffffff',
        fontFamily: 'monospace',
        padding: 20,
      }}
    >
      <h1 style={{ fontSize: 44, marginBottom: 10, letterSpacing: 2 }}>RHYTHM GESTURE</h1>
      <p style={{ color: '#a8d6e8', marginBottom: 42, fontSize: 16 }}>
        Match ROCK / SCISSORS / PAPER on beat. Swipe notes require directional drag.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 520, maxWidth: '95vw' }}>
        {SONGS.map((song) => (
          <button
            key={song.id}
            onClick={() => onSelect(song.beatmapUrl)}
            style={{
              background: 'rgba(17, 32, 42, 0.82)',
              border: '1px solid #2a6a8a',
              borderRadius: 10,
              color: '#ffffff',
              padding: '18px 20px',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'monospace',
            }}
          >
            <div style={{ fontSize: 21, fontWeight: 700 }}>{song.title}</div>
            <div style={{ color: '#8ad7ff', fontSize: 14, marginTop: 4 }}>{song.artist}</div>
            <div style={{ color: '#b6c7d0', fontSize: 13, marginTop: 8 }}>{song.description}</div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 34, color: '#7fa2b3', fontSize: 13, textAlign: 'center', lineHeight: 1.8 }}>
        <div>1. Select song</div>
        <div>2. Allow camera</div>
        <div>3. Press START and play at least one run</div>
      </div>
    </div>
  );
}
