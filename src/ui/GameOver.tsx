/**
 * End screen: the podium with the first three places, then the full ranking.
 */

import React from 'react';
import { GameSnapshot } from '@/shared/protocol.js';
import { HU } from '../i18n/hu.js';
import { PixelIcon } from './PixelIcon.js';

interface GameOverProps {
  snapshot: GameSnapshot;
  isHost: boolean;
  onBackToLobby: () => void;
}

const MEDAL_COLORS = ['text-px-yellow', 'text-px-silver', 'text-px-orange'];
const PODIUM = [
  { height: 'h-28', bg: 'bg-px-yellow' },
  { height: 'h-20', bg: 'bg-px-silver' },
  { height: 'h-14', bg: 'bg-px-orange' },
];

export const GameOver: React.FC<GameOverProps> = ({ snapshot, isHost, onBackToLobby }) => {
  const { ranking, reason } = snapshot.win;
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);
  // Classic podium order: 2nd, 1st, 3rd
  const podiumOrder = [1, 0, 2].filter((i) => top3[i]);

  return (
    <div className="px-backdrop fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="px-panel flex max-h-[96dvh] w-full max-w-xl flex-col items-center gap-4 overflow-y-auto p-4 text-center">
        <h1 className="px-title text-base text-px-yellow md:text-xl">{HU.gameOver.title}</h1>
        <p className="text-xl text-px-white">{reason}</p>

        <div className="flex w-full items-end justify-center gap-2">
          {podiumOrder.map((i) => {
            const entry = top3[i];
            return (
              <div key={entry.playerId} className="flex w-1/3 max-w-[10rem] flex-col items-center">
                <PixelIcon name="trophy" size={32} className={MEDAL_COLORS[i]} />
                <span className="mt-1 h-3 w-8 border-2 border-px-ink" style={{ backgroundColor: entry.color }} title="nyakkendő" />
                <span className="w-full truncate text-2xl text-px-white">{entry.name}</span>
                <span className="text-lg text-px-silver">{HU.gameOver.kills(entry.kills)}</span>
                <div className={`mt-1 flex w-full items-start justify-center border-4 border-px-ink pt-2 font-pixel text-lg text-px-ink ${PODIUM[i].bg} ${PODIUM[i].height}`}>
                  {i + 1}
                </div>
              </div>
            );
          })}
        </div>

        {rest.length > 0 && (
          <div className="w-full">
            <h3 className="mb-1 text-xl text-px-silver">{HU.gameOver.others}</h3>
            <ol className="px-inset flex max-h-40 flex-col gap-1 overflow-y-auto p-1.5 text-left text-xl">
              {rest.map((r) => (
                <li key={r.playerId} className="flex items-center gap-2 bg-px-dusk px-2 py-0.5">
                  <span className="w-8 text-px-silver">{r.rank}.</span>
                  <span className="h-3 w-3 shrink-0 border-2 border-px-white" style={{ backgroundColor: r.color }} />
                  <span className="truncate">{r.name}</span>
                  <span className="ml-auto text-lg text-px-silver">{HU.gameOver.kills(r.kills)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {isHost ? (
          <button onClick={onBackToLobby} className="px-btn flex w-full items-center justify-center gap-2 !py-3.5" style={{ ['--btn' as string]: '#38b764' }}>
            <PixelIcon name="play" size={14} /> {HU.gameOver.newGame}
          </button>
        ) : (
          <p className="animate-pulse text-xl text-px-silver">{HU.gameOver.waitHost}</p>
        )}
      </div>
    </div>
  );
};
