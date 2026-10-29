/**
 * Big, open arena: a few steel pillars, scattered breakable bricks and
 * question-mark tiles. Pillars never block a path completely, so every free
 * cell stays reachable.
 */

import { CONSTANTS } from '../constants.js';
import { TileType } from '../types.js';
import { RNG } from './rng.js';

export interface SpawnPoint {
  tileX: number;
  tileY: number;
}

export interface GeneratedMap {
  width: number;
  height: number;
  tiles: number[];
  spawnPoints: SpawnPoint[];
}

// 5 x 3 grid of spawn cells (all odd/odd), enough for 15 players
const SPAWN_XS = [3, 11, 21, 29, 37];
const SPAWN_YS = [3, 15, 27];

export function generateMap(rng: RNG): GeneratedMap {
  const width = CONSTANTS.MAP_WIDTH_TILES;
  const height = CONSTANTS.MAP_HEIGHT_TILES;
  const tiles: number[] = new Array(width * height).fill(TileType.EMPTY);
  const idx = (x: number, y: number) => y * width + x;

  const spawnPoints: SpawnPoint[] = [];
  for (const y of SPAWN_YS) for (const x of SPAWN_XS) spawnPoints.push({ tileX: x, tileY: y });

  // Cells that must stay free: each spawn and its four neighbours
  const reserved = new Set<number>();
  for (const sp of spawnPoints) {
    reserved.add(idx(sp.tileX, sp.tileY));
    reserved.add(idx(sp.tileX + 1, sp.tileY));
    reserved.add(idx(sp.tileX - 1, sp.tileY));
    reserved.add(idx(sp.tileX, sp.tileY + 1));
    reserved.add(idx(sp.tileX, sp.tileY - 1));
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const pillar = x % CONSTANTS.PILLAR_SPACING === 0 && y % CONSTANTS.PILLAR_SPACING === 0;
      if (border || pillar) {
        tiles[idx(x, y)] = TileType.SOLID_WALL;
      } else if (!reserved.has(idx(x, y)) && rng.next() < CONSTANTS.BRICK_DENSITY) {
        tiles[idx(x, y)] = TileType.BREAKABLE_BRICK;
      }
    }
  }

  // Visible question marks on free floor cells away from the spawns
  const candidates: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[idx(x, y)] === TileType.SOLID_WALL || reserved.has(idx(x, y))) continue;
      const nearSpawn = spawnPoints.some((sp) => Math.abs(sp.tileX - x) + Math.abs(sp.tileY - y) <= 3);
      if (!nearSpawn) candidates.push(idx(x, y));
    }
  }
  for (const i of rng.shuffle(candidates).slice(0, CONSTANTS.INITIAL_QUESTION_TILES)) {
    tiles[i] = TileType.QUESTION_TILE;
  }

  return { width, height, tiles, spawnPoints };
}

/**
 * Verifies that every spawn can reach every other spawn through non-solid tiles
 * (bricks count as passable because they can be blown up).
 */
export function verifyMapConnectivity(map: GeneratedMap): boolean {
  const { width, height, tiles, spawnPoints } = map;
  const start = spawnPoints[0];
  const visited = new Uint8Array(width * height);
  const queue = [start.tileY * width + start.tileX];
  visited[queue[0]] = 1;

  for (let head = 0; head < queue.length; head++) {
    const cx = queue[head] % width;
    const cy = Math.floor(queue[head] / width);
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (!visited[n] && tiles[n] !== TileType.SOLID_WALL) {
        visited[n] = 1;
        queue.push(n);
      }
    }
  }
  return spawnPoints.every((sp) => visited[sp.tileY * width + sp.tileX]);
}
