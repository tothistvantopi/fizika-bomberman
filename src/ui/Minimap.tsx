/**
 * Overview of the whole arena (the real map is much bigger than the screen).
 */

import React, { useEffect, useRef } from 'react';
import { CONSTANTS } from '@/shared/constants.js';
import { GameSnapshot } from '@/shared/protocol.js';
import { TileType } from '@/shared/types.js';
import { PixelIcon } from './PixelIcon.js';

interface MinimapProps {
  snapshotRef: React.MutableRefObject<GameSnapshot | null>;
  tilesRef: React.MutableRefObject<number[]>;
  selfPlayerId: string;
  onClose: () => void;
}

const SCALE = 8;

export const Minimap: React.FC<MinimapProps> = ({ snapshotRef, tilesRef, selfPlayerId, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const w = CONSTANTS.MAP_WIDTH_TILES;
  const h = CONSTANTS.MAP_HEIGHT_TILES;

  useEffect(() => {
    const draw = () => {
      const ctx = canvasRef.current?.getContext('2d');
      const snap = snapshotRef.current;
      if (!ctx || !snap) return;
      const tiles = tilesRef.current;
      const z = snap.safeZone;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const t = tiles[y * w + x];
          const outside = x < z.minX || x > z.maxX || y < z.minY || y > z.maxY;
          ctx.fillStyle =
            t === TileType.SOLID_WALL ? '#566c86'
            : t === TileType.BREAKABLE_BRICK ? '#b13e53'
            : t === TileType.PLAYER_WALL || t === TileType.PLAYER_WALL_CRACKED ? '#41a6f6'
            : t === TileType.QUESTION_TILE ? '#ffcd75'
            : outside ? '#5d275d' : '#333c57';
          ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }

      for (const b of snap.bombs) {
        ctx.fillStyle = '#f4f4f4';
        ctx.fillRect(b.tileX * SCALE + 2, b.tileY * SCALE + 2, 4, 4);
      }
      for (const p of snap.players) {
        if (!p.alive) continue;
        const cx = (p.x / CONSTANTS.TILE_SIZE_PX) * SCALE;
        const cy = (p.y / CONSTANTS.TILE_SIZE_PX) * SCALE;
        const self = p.id === selfPlayerId;
        const size = self ? 8 : 6;
        ctx.fillStyle = self ? '#f4f4f4' : '#1a1c2c';
        ctx.fillRect(cx - size / 2 - 1, cy - size / 2 - 1, size + 2, size + 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      }
    };
    draw();
    const id = window.setInterval(draw, 250);
    return () => window.clearInterval(id);
  }, [snapshotRef, tilesRef, selfPlayerId, w, h]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ' || e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="px-backdrop fixed inset-0 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="px-panel flex max-h-[96dvh] w-full max-w-3xl flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="px-title flex items-center gap-2 text-xs text-px-cyan">
            <PixelIcon name="map" size={16} /> TÉRKÉP
          </span>
          <button onClick={onClose} className="px-btn !px-3 !py-1.5 !text-[9px]" style={{ ['--btn' as string]: '#b13e53' }}>BEZÁR (Q)</button>
        </div>
        <canvas ref={canvasRef} width={w * SCALE} height={h * SCALE} className="px-inset min-h-0 w-full object-contain" style={{ imageRendering: 'pixelated' }} />
        <p className="text-lg text-px-silver">sárga: kérdőjel · piros: tégla · kék: fal · lila: veszélyzóna · fehér keretes négyzet: te</p>
      </div>
    </div>
  );
};
