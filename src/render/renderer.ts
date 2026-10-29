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

interface StaticLayer {
  canvas: HTMLCanvasElement;
  scale: number; // layer pixels per game pixel
  tiles: number[] | null; // the tile array this layer was drawn from
  key: string;
  questionTiles: number[];
}
let staticLayer: StaticLayer | null = null;
const MAX_LAYER_PIXELS = 6_000_000;

/**
 * The arena (everything that does not move) is drawn into one offscreen canvas and only redrawn
 * when the server sends a new tile array (a brick breaks, a wall is built). Every frame is then a
 * single drawImage of the visible part, instead of ~600 tile copies.
 */
function getStaticLayer(tiles: number[], mapWidth: number, mapHeight: number, pixelScale: number): StaticLayer {
  let scale = Math.min(4, Math.max(1, pixelScale));
  while (scale > 1 && mapWidth * mapHeight * TILE * TILE * scale * scale > MAX_LAYER_PIXELS) scale--;
  const key = `${mapWidth}x${mapHeight}@${scale}`;
  if (staticLayer && staticLayer.tiles === tiles && staticLayer.key === key) return staticLayer;

  if (!staticLayer) staticLayer = { canvas: document.createElement('canvas'), scale, tiles: null, key: '', questionTiles: [] };
  const layer = staticLayer;
  layer.canvas.width = mapWidth * TILE * scale;
  layer.canvas.height = mapHeight * TILE * scale;
  layer.scale = scale;
  layer.key = key;
  layer.tiles = tiles;
  layer.questionTiles = [];

  const c = layer.canvas.getContext('2d')!;
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.imageSmoothingEnabled = false;
  for (let ty = 0; ty < mapHeight; ty++) {
    for (let tx = 0; tx < mapWidth; tx++) {
      const idx = ty * mapWidth + tx;
      const tile = tiles[idx] ?? TileType.SOLID_WALL;
      const px = tx * TILE;
      const py = ty * TILE;
      if (tile === TileType.SOLID_WALL) {
        drawCachedTile(c, 'wall', px, py);
        continue;
      }
      drawCachedTile(c, (tx + ty) % 2 === 0 ? 'floorA' : 'floorB', px, py);
      if (tile === TileType.BREAKABLE_BRICK) drawCachedTile(c, 'brick', px, py);
      else if (tile === TileType.QUESTION_TILE) {
        drawCachedTile(c, 'question', px, py);
        layer.questionTiles.push(idx);
      } else if (tile === TileType.PLAYER_WALL) drawCachedTile(c, 'playerWall', px, py);
      else if (tile === TileType.PLAYER_WALL_CRACKED) drawCachedTile(c, 'playerWallCracked', px, py);
    }
  }
  return layer;
}

// Name labels (outlined text) are rendered once per name and size, then copied
const labelCache = new Map<string, HTMLCanvasElement>();
function getLabel(text: string, fontPx: number, color: string): HTMLCanvasElement | null {
  const font = `${fontPx}px "Press Start 2P", monospace`;
  if (!document.fonts.check(font)) return null; // web font not loaded yet: draw live this frame
  const key = `${text}|${fontPx}|${color}`;
  let canvas = labelCache.get(key);
  if (!canvas) {
    if (labelCache.size > 200) labelCache.clear();
    const lineWidth = Math.max(2, fontPx / 4);
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    const width = Math.ceil(probe.measureText(text).width + lineWidth * 2 + 2);
    const height = Math.ceil(fontPx + lineWidth * 2 + 2);
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d')!;
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    c.strokeStyle = '#1a1c2c';
    c.lineWidth = lineWidth;
    c.strokeText(text, width / 2, height - lineWidth - 1);
    c.fillStyle = color;
    c.fillText(text, width / 2, height - lineWidth - 1);
    labelCache.set(key, canvas);
  }
  return canvas;
}

export function renderScene(rc: RenderContext): void {
  const { ctx, pixelScale, camera, snapshot, interpolatedPlayers, selfPlayerId, tiles, mapWidth, mapHeight, time } = rc;
  const zone = snapshot.safeZone;

  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(0, 0, camera.width, camera.height);

  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  const layer = getStaticLayer(tiles, mapWidth, mapHeight, pixelScale);
  const worldW = mapWidth * TILE;
  const worldH = mapHeight * TILE;
  const cx = Math.round(camera.x);
  const cy = Math.round(camera.y);

  // One drawImage for the whole visible arena (floor, walls, bricks, question blocks, player walls)
  const sx = Math.max(0, cx);
  const sy = Math.max(0, cy);
  const sw = Math.min(worldW, cx + camera.width) - sx;
  const sh = Math.min(worldH, cy + camera.height) - sy;
  if (sw > 0 && sh > 0) {
    const ls = layer.scale;
    ctx.drawImage(layer.canvas, sx * ls, sy * ls, sw * ls, sh * ls, sx, sy, sw, sh);
  }

  // Animated glow only on the few question blocks that are on screen
  ctx.fillStyle = `rgba(255, 205, 117, ${Math.sin(time * 5) * 0.25 + 0.5})`;
  for (const idx of layer.questionTiles) {
    const px = (idx % mapWidth) * TILE;
    const py = Math.floor(idx / mapWidth) * TILE;
    if (px + TILE < cx || px > cx + camera.width || py + TILE < cy || py > cy + camera.height) continue;
    ctx.fillRect(px, py, 16, 1);
    ctx.fillRect(px, py + 15, 16, 1);
    ctx.fillRect(px, py, 1, 16);
    ctx.fillRect(px + 15, py, 1, 16);
  }

  // Storm: four translucent bands around the safe zone instead of a rect per tile
  const zx0 = zone.minX * TILE;
  const zx1 = (zone.maxX + 1) * TILE;
  const zy0 = zone.minY * TILE;
  const zy1 = (zone.maxY + 1) * TILE;
  ctx.fillStyle = 'rgba(177, 62, 83, 0.55)';
  if (zy0 > 0) ctx.fillRect(0, 0, worldW, zy0);
  if (zy1 < worldH) ctx.fillRect(0, zy1, worldW, worldH - zy1);
  if (zx0 > 0) ctx.fillRect(0, zy0, zx0, zy1 - zy0);
  if (zx1 < worldW) ctx.fillRect(zx1, zy0, worldW - zx1, zy1 - zy0);

  // The edges that are about to collapse flash
  if (zone.isWarning && Math.sin(time * 14) > 0) {
    ctx.fillStyle = 'rgba(255, 205, 117, 0.6)';
    if (zone.minX < CONSTANTS.FINAL_SAFE_ZONE_MIN_X) ctx.fillRect(zx0, zy0, TILE, zy1 - zy0);
    if (zone.maxX > CONSTANTS.FINAL_SAFE_ZONE_MAX_X) ctx.fillRect(zx1 - TILE, zy0, TILE, zy1 - zy0);
    if (zone.minY < CONSTANTS.FINAL_SAFE_ZONE_MIN_Y) ctx.fillRect(zx0, zy0, zx1 - zx0, TILE);
    if (zone.maxY > CONSTANTS.FINAL_SAFE_ZONE_MAX_Y) ctx.fillRect(zx0, zy1 - TILE, zx1 - zx0, TILE);
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
    const color = isSelf ? '#ffcd75' : '#f4f4f4';
    const label = getLabel(p.name, fontPx, color);
    if (label) {
      ctx.drawImage(label, Math.round(sx - label.width / 2), Math.round(sy - label.height + Math.max(2, fontPx / 4) + 1));
    } else {
      ctx.strokeStyle = '#1a1c2c';
      ctx.lineWidth = Math.max(2, fontPx / 4);
      ctx.strokeText(p.name, sx, sy);
      ctx.fillStyle = color;
      ctx.fillText(p.name, sx, sy);
    }
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
