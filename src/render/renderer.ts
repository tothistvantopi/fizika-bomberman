/**
 * Canvas renderer for the 16-bit pixel-art arena.
 * Draws only what is read from the latest snapshot, tiles and interpolated players.
 */

import { CONSTANTS } from '@/shared/constants.js';
import { GameSnapshot } from '@/shared/protocol.js';
import { TileType } from '@/shared/types.js';
import { Camera } from '../game/camera.js';
import { InterpolatedPlayer } from '../game/interpolation.js';
import { drawBomb, drawCachedTile, drawExplosionCell, drawHearts, drawPlayer } from './sprites.js';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  pixelScale: number; // device pixels per game pixel
  camera: Camera;
  snapshot: GameSnapshot;
  interpolatedPlayers: InterpolatedPlayer[];
  selfPlayerId: string;
  tiles: number[];
  mapWidth: number;
  mapHeight: number;
  time: number;
}

const TILE = CONSTANTS.TILE_SIZE_PX;

export function renderScene(rc: RenderContext): void {
  const { ctx, pixelScale, camera, snapshot, interpolatedPlayers, selfPlayerId, tiles, mapWidth, mapHeight, time } = rc;
  const zone = snapshot.safeZone;

  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(0, 0, camera.width, camera.height);

  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  const startX = Math.max(0, Math.floor(camera.x / TILE));
  const endX = Math.min(mapWidth - 1, Math.ceil((camera.x + camera.width) / TILE));
  const startY = Math.max(0, Math.floor(camera.y / TILE));
  const endY = Math.min(mapHeight - 1, Math.ceil((camera.y + camera.height) / TILE));

  // The edges that are about to collapse flash
  const flashOn = Math.sin(time * 14) > 0;
  const collapsingMinX = zone.minX < CONSTANTS.FINAL_SAFE_ZONE_MIN_X;
  const collapsingMaxX = zone.maxX > CONSTANTS.FINAL_SAFE_ZONE_MAX_X;
  const collapsingMinY = zone.minY < CONSTANTS.FINAL_SAFE_ZONE_MIN_Y;
  const collapsingMaxY = zone.maxY > CONSTANTS.FINAL_SAFE_ZONE_MAX_Y;

  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const tile = tiles[ty * mapWidth + tx] ?? TileType.SOLID_WALL;
      const px = tx * TILE;
      const py = ty * TILE;

      if (tile === TileType.SOLID_WALL) {
        drawCachedTile(ctx, 'wall', px, py);
        continue;
      }

      drawCachedTile(ctx, (tx + ty) % 2 === 0 ? 'floorA' : 'floorB', px, py);
      if (tile === TileType.BREAKABLE_BRICK) drawCachedTile(ctx, 'brick', px, py);
      else if (tile === TileType.QUESTION_TILE) {
        drawCachedTile(ctx, 'question', px, py);
        // animated glow border on top of the cached block
        ctx.fillStyle = `rgba(255, 205, 117, ${Math.sin(time * 5) * 0.25 + 0.5})`;
        ctx.fillRect(px, py, 16, 1);
        ctx.fillRect(px, py + 15, 16, 1);
        ctx.fillRect(px, py, 1, 16);
        ctx.fillRect(px + 15, py, 1, 16);
      } else if (tile === TileType.PLAYER_WALL) drawCachedTile(ctx, 'playerWall', px, py);
      else if (tile === TileType.PLAYER_WALL_CRACKED) drawCachedTile(ctx, 'playerWallCracked', px, py);

      const outside = tx < zone.minX || tx > zone.maxX || ty < zone.minY || ty > zone.maxY;
      if (outside) {
        ctx.fillStyle = 'rgba(177, 62, 83, 0.55)';
        ctx.fillRect(px, py, TILE, TILE);
      } else if (
        zone.isWarning &&
        flashOn &&
        ((collapsingMinX && tx === zone.minX) ||
          (collapsingMaxX && tx === zone.maxX) ||
          (collapsingMinY && ty === zone.minY) ||
          (collapsingMaxY && ty === zone.maxY))
      ) {
        ctx.fillStyle = 'rgba(255, 205, 117, 0.6)';
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }

  for (const bomb of snapshot.bombs) {
    drawBomb(ctx, bomb.tileX * TILE, bomb.tileY * TILE, bomb.timer, time);
  }
  for (const exp of snapshot.explosions) {
    drawExplosionCell(ctx, exp.tileX * TILE, exp.tileY * TILE, exp.timer);
  }

  // Players, back to front
  const living = interpolatedPlayers.filter((p) => p.alive).sort((a, b) => a.y - b.y);
  for (const p of living) {
    const moving = Math.hypot(p.targetX - p.x, p.targetY - p.y) > 0.6;
    // Just lost a life: blink
    if (!p.hurt || Math.floor(time * 12) % 2 === 0) {
      drawPlayer(ctx, p.x, p.y, p.facing, p.color, { invulnerable: p.invulnerable, fast: p.fast, inQuiz: p.inQuiz, moving }, time);
    }
    drawHearts(ctx, p.x, p.y - 13, p.lives, CONSTANTS.PLAYER_LIVES);
  }

  ctx.restore();

  // Names are drawn at full device resolution (not scaled up from game pixels), so they stay sharp
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const fontPx = Math.max(8, Math.round((5.5 * pixelScale) / 8) * 8);
  ctx.font = `${fontPx}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  const toScreenX = (x: number) => (Math.round(x) - Math.round(camera.x)) * pixelScale;
  const toScreenY = (y: number) => (Math.round(y) - Math.round(camera.y)) * pixelScale;
  for (const p of living) {
    const isSelf = p.id === selfPlayerId;
    const sx = toScreenX(p.x);
    const sy = toScreenY(p.y - 15);
    ctx.strokeStyle = '#1a1c2c';
    ctx.lineWidth = Math.max(2, fontPx / 4);
    ctx.strokeText(p.name, sx, sy);
    ctx.fillStyle = isSelf ? '#ffcd75' : '#f4f4f4';
    ctx.fillText(p.name, sx, sy);
    if (!p.connected) {
      ctx.fillStyle = '#b13e53';
      ctx.fillText('(offline)', sx, sy - fontPx * 1.3);
    }
  }
  ctx.restore();

  // Storm warning on the screen of a player outside the safe zone
  const me = interpolatedPlayers.find((p) => p.id === selfPlayerId);
  if (me?.alive) {
    const tx = Math.floor(me.x / TILE);
    const ty = Math.floor(me.y / TILE);
    if (tx < zone.minX || tx > zone.maxX || ty < zone.minY || ty > zone.maxY) {
      ctx.fillStyle = `rgba(177, 62, 83, ${0.2 + 0.12 * Math.sin(time * 10)})`;
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const warnPx = Math.max(8, Math.round((6 * pixelScale) / 8) * 8);
      ctx.font = `${warnPx}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#1a1c2c';
      ctx.lineWidth = Math.max(3, warnPx / 3);
      const cx = (camera.width / 2) * pixelScale;
      ctx.strokeText('VESZÉLYZÓNA! FUSS BEFELÉ!', cx, warnPx * 2);
      ctx.fillStyle = '#ffcd75';
      ctx.fillText('VESZÉLYZÓNA! FUSS BEFELÉ!', cx, warnPx * 2);
      ctx.restore();
    }
  }
}
