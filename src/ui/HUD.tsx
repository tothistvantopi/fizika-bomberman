/**
 * Compact top bar: match clock, living players, bombs, walls, zone status and active power-ups.
 */

import React from 'react';
import { CONSTANTS } from '@/shared/constants.js';
import { GameSnapshot } from '@/shared/protocol.js';
import { HU } from '../i18n/hu.js';
import { PixelIcon, IconName } from './PixelIcon.js';

interface HUDProps {
  snapshot: GameSnapshot;
  selfPlayerId: string;
  pingMs: number | null;
  onOpenMap: () => void;
  onOpenHelp: () => void;
}

const Chip: React.FC<{ icon: IconName; color: string; children: React.ReactNode; blink?: boolean }> = ({ icon, color, children, blink }) => (
  <span className={`flex shrink-0 items-center gap-1.5 border-2 border-px-ink bg-px-ink px-2 py-1 font-pixel text-[9px] ${blink ? 'animate-pulse' : ''} ${color}`}>
    <PixelIcon name={icon} size={12} />
    {children}
  </span>
);

export const HUD: React.FC<HUDProps> = ({ snapshot, pingMs, selfPlayerId, onOpenMap, onOpenHelp }) => {
  const { self, safeZone: sz } = snapshot;
  const lives = snapshot.players.find((p) => p.id === selfPlayerId)?.lives ?? 0;
  const remaining = Math.max(0, snapshot.maxMatchTime - snapshot.matchTime);
  const clock = `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
  const aliveCount = snapshot.players.filter((p) => p.alive).length;

  const finalZone =
    sz.minX >= CONSTANTS.FINAL_SAFE_ZONE_MIN_X && sz.maxX <= CONSTANTS.FINAL_SAFE_ZONE_MAX_X &&
    sz.minY >= CONSTANTS.FINAL_SAFE_ZONE_MIN_Y && sz.maxY <= CONSTANTS.FINAL_SAFE_ZONE_MAX_Y;

  const powerUps = (
    [
      ['INVULNERABLE', self.invulnerableTimer],
      ['SPEED', self.speedTimer],
      ['BIG_BLAST', self.bigBlastTimer],
      ['INFINITE_BOMBS', self.infiniteBombsTimer],
    ] as const
  ).filter(([, seconds]) => seconds > 0);

  return (
    <div className="z-30 w-full select-none border-b-4 border-black bg-px-dusk px-2 py-1.5">
      {sz.isWarning && (
        <div className="mb-1.5 flex animate-pulse items-center justify-center gap-2 bg-px-orange px-2 py-1 text-center font-pixel text-[8px] leading-relaxed text-px-ink">
          <PixelIcon name="warning" size={12} /> {HU.hud.zoneWarning(Math.ceil(sz.nextShrinkCountdown))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip icon="clock" color={remaining < 60 ? 'text-px-red' : 'text-px-cyan'} blink={remaining < 30}>{clock}</Chip>
        <span className="flex shrink-0 items-center gap-1 border-2 border-px-ink bg-px-ink px-2 py-1" aria-label={`${lives} élet`}>
          {[0, 1, 2].map((i) => (
            <PixelIcon key={i} name="heart" size={14} className={i < lives ? 'text-px-red' : 'text-px-dusk'} />
          ))}
        </span>
        <Chip icon="person" color="text-px-lime">{aliveCount}/{snapshot.players.length}</Chip>
        <Chip icon="bomb" color="text-px-orange">{self.infiniteBombsTimer > 0 ? '∞' : `${Math.max(0, self.maxBombs - self.bombsOut)}/${self.maxBombs}`}</Chip>
        <Chip icon="wall" color="text-px-sky">{self.wallStock}/{self.maxWalls}</Chip>
        <Chip icon="storm" color="text-px-silver">{finalZone ? HU.hud.finalZone : HU.hud.shrinkIn(Math.ceil(sz.nextShrinkCountdown))}</Chip>
        {pingMs !== null && (
          <Chip icon="bolt" color={pingMs < 80 ? 'text-px-lime' : pingMs < 200 ? 'text-px-yellow' : 'text-px-red'}>{pingMs}ms</Chip>
        )}
        {powerUps.map(([key, seconds]) => (
          <Chip key={key} icon={HU.powerUps[key].icon} color="text-px-yellow" blink>{Math.ceil(seconds)}s</Chip>
        ))}

        <span className="ml-auto flex shrink-0 gap-1.5">
          <button onClick={onOpenMap} className="px-btn !p-1.5" style={{ ['--btn' as string]: '#3b5dc9' }} aria-label="Térkép">
            <PixelIcon name="map" size={14} className="text-px-white" />
          </button>
          <button onClick={onOpenHelp} className="px-btn !p-1.5" style={{ ['--btn' as string]: '#566c86' }} aria-label="Súgó">
            <PixelIcon name="question" size={14} className="text-px-white" />
          </button>
        </span>
      </div>
    </div>
  );
};
