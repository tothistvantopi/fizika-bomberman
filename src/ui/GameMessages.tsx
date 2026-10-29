/**
 * Messages over the game view: the recent hit / knock-out feed and, once you are out,
 * a banner that says who knocked you out.
 */

import React from 'react';
import { GameSnapshot } from '@/shared/protocol.js';
import { HU } from '../i18n/hu.js';
import { PixelIcon } from './PixelIcon.js';

/** Who a knocked-out player watches: the one who knocked them out, otherwise the first living player. */
export function spectateTarget(snapshot: GameSnapshot, selfPlayerId: string) {
  const killerName = snapshot.self.killedBy?.name;
  const living = snapshot.players.filter((p) => p.alive && p.id !== selfPlayerId);
  return living.find((p) => p.name === killerName) ?? living[0];
}

interface Props {
  snapshot: GameSnapshot;
  selfPlayerId: string;
}

export const GameMessages: React.FC<Props> = ({ snapshot, selfPlayerId }) => {
  const spectatingName = spectateTarget(snapshot, selfPlayerId)?.name ?? null;
  const me = snapshot.players.find((p) => p.id === selfPlayerId);
  const feed = snapshot.feed.slice(-4);

  return (
    <>
      <ul className="pointer-events-none absolute left-2 top-2 z-30 flex max-w-[80%] flex-col gap-1">
        {feed.map((f) => (
          <li key={f.id} className="flex items-center gap-1.5 border-2 border-px-ink bg-px-ink/85 px-1.5 py-0.5 font-pixel text-[8px] leading-snug text-px-white">
            <PixelIcon name={f.kind === 'hit' ? 'heart' : 'skull'} size={10} className={f.kind === 'hit' ? 'text-px-red' : 'text-px-orange'} />
            <span style={{ color: f.victimColor }} className="shrink-0">■</span>
            <span>
              {f.kind === 'hit' && HU.feed.hit(f.victimName, f.killerName, f.livesLeft ?? 0)}
              {f.kind === 'out' && HU.feed.out(f.victimName, f.killerName ?? '?')}
              {f.kind === 'storm' && HU.feed.storm(f.victimName)}
            </span>
          </li>
        ))}
      </ul>

      {me && !me.alive && snapshot.status === 'playing' && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-30 mx-auto max-w-md border-4 border-px-ink bg-px-red p-3 text-center shadow-[6px_6px_0_0_#000] md:bottom-4">
          <p className="px-title flex items-center justify-center gap-2 text-sm text-px-white">
            <PixelIcon name="skull" size={16} /> {HU.dead.title}
          </p>
          <p className="mt-1 text-2xl text-px-yellow">
            {snapshot.self.killedBy ? HU.dead.byPlayer(snapshot.self.killedBy.name) : HU.dead.byStorm}
          </p>
          {spectatingName && <p className="text-lg text-px-white">{HU.dead.spectating(spectatingName)}</p>}
        </div>
      )}
    </>
  );
};
