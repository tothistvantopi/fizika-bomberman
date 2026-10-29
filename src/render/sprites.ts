/**
 * 16-bit retro procedural sprite renderers for the Physics Laboratory.
 * Einstein characters with coloured neckties, bombs, explosions and arena tiles.
 */

import { CONSTANTS } from '@/shared/constants.js';
import type { Theme } from '@/shared/types.js';

export function drawTileFloor(ctx: CanvasRenderingContext2D, px: number, py: number, forceOdd?: boolean): void {
  // Dark checkered lab floor
  const odd = forceOdd ?? ((px + py) / 16) % 2 === 1;
  ctx.fillStyle = odd ? '#2a3049' : '#333c57';
  ctx.fillRect(px, py, 16, 16);
  ctx.fillStyle = '#262b42';
  ctx.fillRect(px, py, 16, 1);
  ctx.fillRect(px, py, 1, 16);
}
export function drawTileWall(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  // Indestructible steel block
  ctx.fillStyle = '#566c86';
  ctx.fillRect(px, py, 16, 16);
  ctx.fillStyle = '#94b0c2';
  ctx.fillRect(px, py, 16, 2);
  ctx.fillRect(px, py, 2, 16);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(px, py + 14, 16, 2);
  ctx.fillRect(px + 14, py, 2, 16);
  ctx.fillStyle = '#333c57';
  ctx.fillRect(px + 4, py + 4, 8, 8);
  ctx.fillStyle = '#94b0c2';
  ctx.fillRect(px + 3, py + 3, 1, 1);
  ctx.fillRect(px + 12, py + 3, 1, 1);
  ctx.fillRect(px + 3, py + 12, 1, 1);
  ctx.fillRect(px + 12, py + 12, 1, 1);
}
export function drawTileBrick(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  // Breakable crate: red bricks, clearly different from steel and from player walls
  ctx.fillStyle = '#b13e53';
  ctx.fillRect(px, py, 16, 16);
  ctx.fillStyle = '#ef7d57';
  ctx.fillRect(px + 1, py + 1, 14, 1);
  ctx.fillRect(px + 1, py + 9, 14, 1);
  ctx.fillStyle = '#5d275d';
  ctx.fillRect(px, py + 7, 16, 2);
  ctx.fillRect(px, py + 15, 16, 1);
  ctx.fillRect(px + 7, py, 2, 7);
  ctx.fillRect(px + 3, py + 9, 2, 6);
  ctx.fillRect(px + 11, py + 9, 2, 6);
}

/**
 * A wall built by a player: blue force-wall that survives one explosion; cracked after the first hit.
 */
export function drawTilePlayerWall(ctx: CanvasRenderingContext2D, px: number, py: number, cracked: boolean): void {
  ctx.fillStyle = '#29366f';
  ctx.fillRect(px, py, 16, 16);
  ctx.fillStyle = '#41a6f6';
  ctx.fillRect(px + 1, py + 1, 14, 14);
  ctx.fillStyle = '#3b5dc9';
  ctx.fillRect(px + 2, py + 2, 12, 12);
  ctx.fillStyle = '#73eff7';
  ctx.fillRect(px + 2, py + 2, 12, 1);
  ctx.fillRect(px + 2, py + 2, 1, 12);
  ctx.fillStyle = '#29366f';
  ctx.fillRect(px + 7, py + 3, 2, 10);
  ctx.fillRect(px + 3, py + 7, 10, 2);
  if (cracked) {
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(px + 4, py + 1, 1, 4);
    ctx.fillRect(px + 5, py + 5, 2, 1);
    ctx.fillRect(px + 7, py + 6, 1, 4);
    ctx.fillRect(px + 8, py + 10, 3, 1);
    ctx.fillRect(px + 11, py + 11, 1, 4);
    ctx.fillRect(px + 12, py + 3, 1, 3);
  }
}
const QUESTION_MARK = ['01110', '10001', '00001', '00110', '00100', '00000', '00100'];

export function drawTileQuestion(ctx: CanvasRenderingContext2D, px: number, py: number, time: number): void {
  // Glowing yellow question mark on a purple block
  const pulse = Math.sin(time * 5) * 0.25 + 0.75;
  ctx.fillStyle = '#4c1d95';
  ctx.fillRect(px, py, 16, 16);
  ctx.fillStyle = `rgba(250, 204, 21, ${pulse})`;
  ctx.fillRect(px, py, 16, 1);
  ctx.fillRect(px, py + 15, 16, 1);
  ctx.fillRect(px, py, 1, 16);
  ctx.fillRect(px + 15, py, 1, 16);
  ctx.fillStyle = '#6d28d9';
  ctx.fillRect(px + 1, py + 1, 14, 14);
  ctx.fillStyle = '#facc15';
  QUESTION_MARK.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      if (row[rx] === '1') ctx.fillRect(px + 3 + rx * 2, py + 1 + ry * 2, 2, 2);
    }
  });
}

export function drawBomb(ctx: CanvasRenderingContext2D, px: number, py: number, timer: number, time: number): void {
  const flashing = timer <= CONSTANTS.BOMB_FLASH_SECONDS && Math.floor(time * 16) % 2 === 0;
  const pulse = Math.floor(time * 4) % 2; // the bomb "breathes"

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(px + 2, py + 13, 12, 3);

  const y = py + pulse;
  ctx.fillStyle = flashing ? '#f4f4f4' : '#1a1c2c';
  ctx.fillRect(px + 4, y + 3, 8, 10);
  ctx.fillRect(px + 3, y + 4, 10, 8);
  ctx.fillRect(px + 2, y + 6, 12, 4);
  if (!flashing) {
    ctx.fillStyle = '#566c86';
    ctx.fillRect(px + 4, y + 5, 2, 2);
    ctx.fillStyle = '#333c57';
    ctx.fillRect(px + 5, y + 7, 6, 4);
  }

  ctx.fillStyle = '#94b0c2';
  ctx.fillRect(px + 7, y + 1, 2, 3);
  ctx.fillStyle = Math.floor(time * 12) % 2 ? '#ffcd75' : '#ef7d57';
  ctx.fillRect(px + 7, y - 1, 2, 2);
  ctx.fillStyle = '#b13e53';
  ctx.fillRect(px + 9, y - 2, 1, 1);
}
export function drawExplosionCell(ctx: CanvasRenderingContext2D, px: number, py: number, timer: number): void {
  const progress = Math.max(0, timer / CONSTANTS.EXPLOSION_DURATION_SECONDS);
  ctx.fillStyle = '#b13e53';
  ctx.fillRect(px, py, 16, 16);
  ctx.fillStyle = '#ef7d57';
  ctx.fillRect(px + 2, py + 2, 12, 12);
  ctx.fillStyle = '#ffcd75';
  ctx.fillRect(px + 4, py + 4, 8, 8);
  if (progress > 0.3) {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(px + 6, py + 6, 4, 4);
  }
}
const playerBodyCache = new Map<string, HTMLCanvasElement>();
const BODY_MARGIN = 3;

/** The little Einstein itself: only 3 bob phases x 4 directions per colour, so it is cached as a sprite. */
function getPlayerBody(facing: 'up' | 'down' | 'left' | 'right', tieColor: string, bob: number, step: number): HTMLCanvasElement {
  const key = `${tieColor}|${facing}|${bob}|${step}`;
  let sprite = playerBodyCache.get(key);
  if (!sprite) {
    if (playerBodyCache.size > 400) playerBodyCache.clear();
    sprite = document.createElement('canvas');
    sprite.width = 16;
    sprite.height = 18;
    const c = sprite.getContext('2d')!;
    const x = BODY_MARGIN;
    const y = BODY_MARGIN;
  // Shadow
  c.fillStyle = 'rgba(0, 0, 0, 0.4)';
  c.fillRect(x - 1, y + 10, 12, 2);

  // Wild white hair
  c.fillStyle = '#e2e8f0';
  c.fillRect(x - 1, y - 2 + bob, 12, 4);
  c.fillRect(x - 2, y - 1 + bob, 3, 5);
  c.fillRect(x + 9, y - 1 + bob, 3, 5);

  // Face
  c.fillStyle = '#fed7aa';
  c.fillRect(x + 1, y + 1 + bob, 8, 5);

  // Glasses and moustache
  c.fillStyle = '#0f172a';
  if (facing === 'down') {
    c.fillRect(x + 2, y + 2 + bob, 2, 2);
    c.fillRect(x + 6, y + 2 + bob, 2, 2);
    c.fillRect(x + 4, y + 2 + bob, 2, 1);
    c.fillStyle = '#f8fafc';
    c.fillRect(x + 3, y + 4 + bob, 4, 2);
  } else if (facing === 'right') {
    c.fillRect(x + 5, y + 2 + bob, 3, 2);
    c.fillStyle = '#f8fafc';
    c.fillRect(x + 6, y + 4 + bob, 3, 2);
  } else if (facing === 'left') {
    c.fillRect(x + 2, y + 2 + bob, 3, 2);
    c.fillStyle = '#f8fafc';
    c.fillRect(x + 1, y + 4 + bob, 3, 2);
  } else {
    c.fillStyle = '#e2e8f0';
    c.fillRect(x + 1, y + 1 + bob, 8, 3); // back of the head: more hair
  }

  // White lab coat
  c.fillStyle = '#f4f4f4';
  c.fillRect(x, y + 6 + bob, 10, 5);
  c.fillStyle = '#cbd5e1';
  c.fillRect(x + 1, y + 7 + bob, 1, 3);
  c.fillRect(x + 8, y + 7 + bob, 1, 3);

  // Necktie with dark outline so every colour is visible on the white coat
  if (facing !== 'up') {
    c.fillStyle = '#0f172a';
    c.fillRect(x + 3, y + 6 + bob, 4, 1);
    c.fillRect(x + 3, y + 7 + bob, 1, 4);
    c.fillRect(x + 6, y + 7 + bob, 1, 4);
    c.fillRect(x + 4, y + 10 + bob, 2, 1);
    c.fillStyle = tieColor;
    c.fillRect(x + 4, y + 7 + bob, 2, 3);
  }

  // Trousers and shoes
  c.fillStyle = '#1e293b';
    c.fillRect(x + 2, y + 11 + bob, 2, 1 + (step > 0 ? 1 : 0));
    c.fillRect(x + 6, y + 11 + bob, 2, 1 + (step < 0 ? 1 : 0));

    playerBodyCache.set(key, sprite);
  }
  return sprite;
}

/**
 * Draws a little Einstein: wild white hair, moustache, glasses, white lab coat
 * and a coloured necktie (the tie colour identifies the player).
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  facing: 'up' | 'down' | 'left' | 'right',
  tieColor: string,
  opts: { invulnerable: boolean; fast: boolean; inQuiz: boolean; moving: boolean },
  time: number
): void {
  const x = Math.round(px - 5);
  const y = Math.round(py - 5);
  // 4-frame walk cycle (10 steps per second): body hops on the odd frames, the feet alternate
  const frame = Math.floor(time * 10) % 4;
  const bob = opts.moving && frame % 2 === 1 ? -1 : 0;

  ctx.save();

  if (opts.inQuiz) {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('?', x + 5, y - 5 + Math.round(Math.sin(time * 6)));
  }

  if (opts.fast) {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
    const dx = facing === 'left' ? 11 : facing === 'right' ? -4 : 0;
    const dy = facing === 'up' ? 12 : facing === 'down' ? -3 : 0;
    ctx.fillRect(x + dx, y + 3 + dy, 3, 1);
    ctx.fillRect(x + dx + (dx ? (dx > 0 ? 2 : -2) : 0), y + 7 + dy, 3, 1);
  }

  if (opts.invulnerable || opts.inQuiz) {
    const pulse = Math.sin(time * 8) * 0.2 + 0.6;
    ctx.strokeStyle = opts.invulnerable ? `rgba(250, 204, 21, ${pulse})` : `rgba(52, 211, 153, ${pulse})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 2.5, y - 3.5 + bob, 15, 17);
  }

  const step = opts.moving ? [0, 1, 0, -1][frame] : 0;
  ctx.drawImage(getPlayerBody(facing, tieColor, bob, step), x - BODY_MARGIN, y - BODY_MARGIN);

  ctx.restore();
}

/**
 * Static tiles are drawn once into small offscreen canvases (per theme and look-variant) and then
 * copied with a single drawImage: much cheaper than ~10 fillRect calls per tile every frame.
 * The three themes recolour the same pixel art and add their own little decorations, so the
 * lab, space and forest arenas stay equally readable.
 */
export type TileKind = 'floorA' | 'floorB' | 'wall' | 'brick' | 'playerWall' | 'playerWallCracked' | 'question';
const tileCache = new Map<string, HTMLCanvasElement>();

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Colour swaps applied to the lab pixel art for the other themes (player walls and ? blocks keep their colours). */
const THEME_COLORS: Record<Theme, Array<[string, string]>> = {
  lab: [],
  space: [
    ['#2a3049', '#12122a'], ['#333c57', '#1a1a3c'], ['#262b42', '#0e0e20'],
    ['#566c86', '#6b5b95'], ['#94b0c2', '#b8a9e0'],
    ['#b13e53', '#7d6c5c'], ['#ef7d57', '#aa9a84'], ['#5d275d', '#3c3228'],
  ],
  forest: [
    ['#2a3049', '#2c5a33'], ['#333c57', '#37683d'], ['#262b42', '#214a28'],
    ['#566c86', '#6b5640'], ['#94b0c2', '#a18a63'], ['#333c57', '#3d3224'],
    ['#b13e53', '#9a6a38'], ['#ef7d57', '#cf9f5f'], ['#5d275d', '#4a3220'],
  ],
};

function recolor(c: CanvasRenderingContext2D, theme: Theme, kind: TileKind): void {
  if (theme === 'lab' || kind === 'playerWall' || kind === 'playerWallCracked' || kind === 'question') return;
  const map = new Map<number, RGB>();
  for (const [from, to] of THEME_COLORS[theme]) {
    const f = hex(from);
    map.set((f[0] << 16) | (f[1] << 8) | f[2], hex(to));
  }
  const img = c.getImageData(0, 0, 16, 16);
  for (let i = 0; i < img.data.length; i += 4) {
    const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    const to = map.get(key);
    if (to) {
      img.data[i] = to[0];
      img.data[i + 1] = to[1];
      img.data[i + 2] = to[2];
    }
  }
  c.putImageData(img, 0, 0);
}

function dots(c: CanvasRenderingContext2D, color: string, points: Array<[number, number]>): void {
  c.fillStyle = color;
  for (const [x, y] of points) c.fillRect(x, y, 1, 1);
}

/** Small decorations so the floor does not look like wallpaper. variant 0 stays plain. */
function decorateFloor(c: CanvasRenderingContext2D, theme: Theme, variant: number): void {
  if (variant === 0) return;
  if (theme === 'lab') {
    if (variant === 1) dots(c, '#3b4466', [[3, 4], [4, 4], [11, 11], [12, 11]]);
    else if (variant === 2) {
      dots(c, '#262b42', [[5, 9], [6, 9], [6, 10], [7, 10], [8, 11], [8, 12]]);
    } else dots(c, '#41507a', [[2, 2], [13, 2], [2, 13], [13, 13]]);
  } else if (theme === 'space') {
    if (variant === 1) dots(c, '#f4f4f4', [[4, 3], [12, 10]]);
    else if (variant === 2) dots(c, '#73eff7', [[9, 5], [3, 12]]);
    else {
      dots(c, '#5d4a8a', [[7, 7], [8, 7], [7, 8], [8, 8]]);
      dots(c, '#f4f4f4', [[13, 2]]);
    }
  } else {
    if (variant === 1) dots(c, '#4c8c4a', [[3, 5], [3, 4], [4, 5], [11, 11], [11, 10], [12, 11]]);
    else if (variant === 2) dots(c, '#ff77a8', [[5, 11], [12, 4]]), dots(c, '#ffcd75', [[5, 10], [12, 3]]);
    else dots(c, '#214a28', [[2, 13], [3, 12], [9, 3], [10, 2]]);
  }
}

function decorateWall(c: CanvasRenderingContext2D, theme: Theme, variant: number): void {
  if (variant === 0) return;
  if (theme === 'lab') {
    c.fillStyle = '#ffcd75'; // hazard stripes
    for (let i = 0; i < 4; i++) c.fillRect(2 + i * 3, 12, 2, 2);
  } else if (theme === 'space') {
    dots(c, '#73eff7', [[7, 7], [8, 7], [7, 8], [8, 8]]); // a lit core
  } else {
    dots(c, '#38b764', [[3, 1], [4, 1], [5, 2], [11, 1], [12, 2], [13, 2]]); // moss
  }
}

function decorateBrick(c: CanvasRenderingContext2D, theme: Theme, variant: number): void {
  if (variant === 0) return;
  c.fillStyle = theme === 'forest' ? '#4a3220' : theme === 'space' ? '#3c3228' : '#5d275d';
  c.fillRect(11, 2, 1, 3);
  c.fillRect(12, 4, 1, 2);
  c.fillRect(4, 10, 1, 3);
}

function buildTile(kind: TileKind, theme: Theme, variant: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const c = canvas.getContext('2d', { willReadFrequently: true })!;
  switch (kind) {
    case 'floorA':
      drawTileFloor(c, 0, 0);
      break;
    case 'floorB':
      drawTileFloor(c, 0, 0, true); // the other checker colour
      break;
    case 'wall':
      drawTileWall(c, 0, 0);
      break;
    case 'brick':
      drawTileBrick(c, 0, 0);
      break;
    case 'playerWall':
      drawTilePlayerWall(c, 0, 0, false);
      break;
    case 'playerWallCracked':
      drawTilePlayerWall(c, 0, 0, true);
      break;
    case 'question':
      drawTileQuestion(c, 0, 0, 0);
      break;
  }
  recolor(c, theme, kind);
  if (kind === 'floorA' || kind === 'floorB') decorateFloor(c, theme, variant);
  else if (kind === 'wall') decorateWall(c, theme, variant);
  else if (kind === 'brick') decorateBrick(c, theme, variant);
  return canvas;
}

/** Deterministic look variant of a tile (so the arena looks the same on every client). */
export function tileVariant(tx: number, ty: number): number {
  let h = (tx * 73856093) ^ (ty * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h >>> 0) % 100;
}

export function drawCachedTile(
  ctx: CanvasRenderingContext2D,
  kind: TileKind,
  px: number,
  py: number,
  theme: Theme = 'lab',
  variant = 0
): void {
  const key = `${theme}|${kind}|${variant}`;
  let tile = tileCache.get(key);
  if (!tile) {
    tile = buildTile(kind, theme, variant);
    tileCache.set(key, tile);
  }
  ctx.drawImage(tile, px, py);
}

/** Pixel hearts above a player: filled for the lives left (one cached sprite per lives/max pair). */
const HEART = ['.#.#.', '#####', '.###.', '..#..'];
const heartCache = new Map<string, HTMLCanvasElement>();
export function drawHearts(ctx: CanvasRenderingContext2D, cx: number, y: number, lives: number, maxLives: number): void {
  const key = `${lives}/${maxLives}`;
  let sprite = heartCache.get(key);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = maxLives * 6 - 1;
    sprite.height = HEART.length;
    const c = sprite.getContext('2d')!;
    for (let i = 0; i < maxLives; i++) {
      c.fillStyle = i < lives ? '#b13e53' : '#333c57';
      HEART.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === '#') c.fillRect(i * 6 + rx, ry, 1, 1);
        }
      });
      if (i < lives) {
        c.fillStyle = '#ef7d57'; // highlight
        c.fillRect(i * 6 + 1, 1, 1, 1);
      }
    }
    heartCache.set(key, sprite);
  }
  ctx.drawImage(sprite, Math.round(cx - sprite.width / 2), Math.round(y));
}

/**
 * Small icons above a player for the power-ups that are running: shield (invulnerable), bolt (fast),
 * starburst (big blast) and infinity (endless bombs). Drawn from cached sprites with a dark backing.
 */
const POWER_ICON_PIXELS: Record<string, { color: string; rows: string[] }> = {
  invulnerable: { color: '#ffcd75', rows: ['.#####.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'] },
  fast: { color: '#73eff7', rows: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'] },
  blast: { color: '#ef7d57', rows: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'] },
  infinite: { color: '#a7f070', rows: ['.......', '.##.##.', '#..#..#', '#..#..#', '.##.##.', '.......', '.......'] },
};
const powerIconCache = new Map<string, HTMLCanvasElement>();

function powerIcon(kind: string): HTMLCanvasElement {
  let icon = powerIconCache.get(kind);
  if (!icon) {
    const def = POWER_ICON_PIXELS[kind];
    icon = document.createElement('canvas');
    icon.width = 9;
    icon.height = 9;
    const c = icon.getContext('2d')!;
    c.fillStyle = 'rgba(26, 28, 44, 0.85)';
    c.fillRect(0, 0, 9, 9);
    c.fillStyle = def.color;
    def.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') c.fillRect(1 + x, 1 + y, 1, 1);
    });
    powerIconCache.set(kind, icon);
  }
  return icon;
}

export function drawPowerIcons(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  active: { invulnerable: boolean; fast: boolean; blast: boolean; infinite: boolean },
  time: number
): void {
  const kinds = (['invulnerable', 'fast', 'blast', 'infinite'] as const).filter((k) => active[k]);
  if (kinds.length === 0) return;
  const bob = Math.round(Math.sin(time * 5));
  const left = Math.round(cx - (kinds.length * 10 - 1) / 2);
  kinds.forEach((k, i) => ctx.drawImage(powerIcon(k), left + i * 10, y + bob));
}
