import React, { useState } from 'react';
import SongSelectScreen from './screens/SongSelectScreen';
import GameScreen from './screens/GameScreen';

type Phase = 'SELECT' | 'PLAYING';

export default function App(): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('SELECT');
  const [beatmapUrl, setBeatmapUrl] = useState<string>('/songs/demo.beatmap.json');

  if (phase === 'PLAYING') {
    return <GameScreen beatmapUrl={beatmapUrl} onExit={() => setPhase('SELECT')} />;
  }

  return (
    <SongSelectScreen
      onSelect={(url) => {
        setBeatmapUrl(url);
        setPhase('PLAYING');
      }}
    />
  );
}
