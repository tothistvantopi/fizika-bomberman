/**
 * Projector view for the teacher's screen: it follows a room without playing.
 * Before the match: big room code, QR code, who has joined and the class leaderboard.
 * During the match: a live ranking next to the whole arena (drawn by App's canvas).
 */

import React from 'react';
import { CONSTANTS } from '@/shared/constants.js';
import { GameSnapshot, HardQuestion, LobbyPlayer, ScoreRow } from '@/shared/protocol.js';
import { HU } from '../i18n/hu.js';
import { useJoinUrl, useQr } from './Lobby.js';
import { PixelIcon } from './PixelIcon.js';
import { HardQuestions, Scoreboard } from './Scoreboard.js';

interface LobbyProps {
  roomCode: string;
  players: LobbyPlayer[];
  scores: ScoreRow[];
  hardQuestions: HardQuestion[];
}

export const ProjectorLobby: React.FC<LobbyProps> = ({ roomCode, players, scores, hardQuestions }) => {
  const joinUrl = useJoinUrl(true);
  const qr = useQr(joinUrl, 320);
  const humans = players.filter((p) => !p.isBot);

  return (
    <div className="h-full w-full overflow-y-auto bg-px-ink p-4 md:p-8">
      <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
        <div className="px-panel flex flex-col items-center gap-3 p-5 text-center">
          <h1 className="px-title px-title-bob text-xl text-px-yellow md:text-3xl">FIZIKA BOMBERMAN</h1>
          <p className="text-2xl text-px-cyan">{HU.projector.joinHere}</p>
          {qr && <img src={qr} alt="QR kód" className="h-56 w-56 border-4 border-px-white md:h-72 md:w-72" style={{ imageRendering: 'pixelated' }} />}
          {joinUrl && <p className="break-all font-pixel text-xs text-px-white md:text-base">{joinUrl}</p>}
          <p className="text-2xl text-px-silver">{HU.projector.code}</p>
          <p className="px-title text-5xl tracking-widest text-px-yellow md:text-7xl">{roomCode}</p>
          <p className="animate-pulse text-2xl text-px-silver">{HU.projector.waiting}</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="px-panel p-4">
            <h2 className="mb-2 text-2xl text-px-silver">
              {HU.lobby.connectedPlayers} {humans.length}
            </h2>
            <div className="grid grid-cols-2 gap-2 text-2xl">
              {humans.map((p) => (
                <div key={p.id} className="flex items-center gap-2 border-2 border-px-slate bg-px-dusk p-1.5">
                  <span className="h-4 w-4 shrink-0 border-2 border-px-white" style={{ backgroundColor: p.color }} />
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
          {scores.some((r) => !r.isBot) && (
            <div className="px-panel p-4">
              <h2 className="mb-2 text-2xl text-px-cyan">{HU.scores.title}</h2>
              <Scoreboard scores={scores} large />
            </div>
          )}
          {hardQuestions.length > 0 && (
            <div className="px-panel p-4">
              <h2 className="mb-2 text-2xl text-px-orange">{HU.scores.hardTitle}</h2>
              <HardQuestions questions={hardQuestions} large />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Live ranking: survivors with their lives first, then the knocked-out players. */
export const ProjectorSidebar: React.FC<{ snapshot: GameSnapshot }> = ({ snapshot }) => {
  const players = [...snapshot.players].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.lives !== b.lives) return b.lives - a.lives;
    return b.kills - a.kills;
  });
  const remaining = Math.max(0, snapshot.maxMatchTime - snapshot.matchTime);
  const clock = `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col gap-2 overflow-hidden border-l-4 border-px-dusk bg-px-ink p-3 text-xl md:w-96 md:text-2xl">
      <div className="flex items-center justify-between">
        <span className="px-title text-xs text-px-yellow md:text-sm">{HU.projector.live}</span>
        <span className="flex items-center gap-1.5 font-pixel text-sm text-px-cyan md:text-lg">
          <PixelIcon name="clock" size={16} /> {clock}
        </span>
      </div>
      <ol className="flex flex-col gap-1 overflow-y-auto">
        {players.map((p) => (
          <li key={p.id} className={`flex items-center gap-2 px-2 py-1 ${p.alive ? 'bg-px-dusk' : 'bg-px-ink opacity-50'}`}>
            <span className="h-4 w-4 shrink-0 border-2 border-px-white" style={{ backgroundColor: p.color }} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="flex gap-0.5">
              {Array.from({ length: CONSTANTS.PLAYER_LIVES }, (_, i) => (
                <PixelIcon key={i} name="heart" size={16} className={i < p.lives ? 'text-px-red' : 'text-px-dusk'} />
              ))}
            </span>
            <span className="w-8 text-right font-pixel text-[10px] text-px-yellow">{p.kills}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
};
