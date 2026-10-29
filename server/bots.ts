/**
 * Computer opponents.
 *
 * Every tick a bot builds a "danger map" (which tiles will be hit by which bomb, and when),
 * then picks the most important thing to do:
 *   1. get out of danger (never walks into a blast that would reach it in time),
 *   2. stay inside the shrinking safe zone,
 *   3. answer quizzes (more or less correctly, depending on the level),
 *   4. hunt the nearest opponent: bomb it when it is safe to do so, break bricks that are in the way,
 *   5. collect question marks / wander.
 * Bombs are only placed when the bot has a proven escape route.
 */

import { CONSTANTS } from '../shared/constants.js';
import type { BotLevel } from '../shared/protocol.js';
import { GameState, Player, TileType } from '../shared/types.js';

export type { BotLevel };

interface Profile {
  horizon: number; // seconds before a blast the bot starts running away
  quizAccuracy: number; // chance to answer correctly
  quizDelay: [number, number]; // seconds of "thinking"
  mistakeChance: number; // chance per second to stumble in a random direction
  aggression: number; // 0..1: how eagerly it hunts players
  questLove: number; // 0..1: how eagerly it goes for question marks
  bombCooldown: number; // seconds between own bomb placements
}

const PROFILES: Record<BotLevel, Profile> = {
  easy: { horizon: 1.3, quizAccuracy: 0.3, quizDelay: [4, 9], mistakeChance: 0.25, aggression: 0.35, questLove: 0.5, bombCooldown: 2.5 },
  normal: { horizon: 2.0, quizAccuracy: 0.55, quizDelay: [3, 7], mistakeChance: 0.08, aggression: 0.7, questLove: 0.7, bombCooldown: 1.4 },
  hard: { horizon: 2.6, quizAccuracy: 0.8, quizDelay: [2, 5], mistakeChance: 0, aggression: 1, questLove: 0.65, bombCooldown: 0.8 },
};

export const BOT_NAMES = ['Newton', 'Galilei', 'Curie', 'Tesla', 'Faraday', 'Kepler', 'Bohr', 'Planck', 'Eötvös', 'Hawking', 'Maxwell', 'Pascal', 'Watt', 'Joule'];
export const BOT_COLORS = ['#41a6f6', '#38b764', '#ef7d57', '#ff77a8', '#5d275d', '#ffcd75', '#73eff7', '#a7f070', '#3b5dc9', '#b13e53', '#257179', '#a05b2d', '#94b0c2', '#566c86'];

export interface BotBrain {
  level: BotLevel;
  quizAnswerAt: number | null; // matchTime at which the bot gives its answer
  quizAnswerIndex: number;
  lastBombAt: number;
  stumbleUntil: number;
  stumbleDx: number;
  stumbleDy: number;
  lastX: number;
  lastY: number;
  stuckSince: number;
  mode: 'quest' | 'hunt' | 'wander';
  modeUntil: number; // matchTime until which the bot keeps its current plan (avoids dithering)
  wanderGoal: number;
}

export interface BotAction {
  dx: number;
  dy: number;
  placeBomb: boolean;
  placeWall: boolean;
  answer: number | null; // quiz answer index to submit now
}

export function createBotBrain(level: BotLevel): BotBrain {
  return { level, quizAnswerAt: null, quizAnswerIndex: 0, lastBombAt: -99, stumbleUntil: 0, stumbleDx: 0, stumbleDy: 0, lastX: 0, lastY: 0, stuckSince: 0, mode: 'wander', modeUntil: 0, wanderGoal: -1 };
}

const TILE = CONSTANTS.TILE_SIZE_PX;
const EDGE_WARNING_SECONDS = 9; // bots leave a collapsing edge this long before it falls
const STEP_SECONDS = TILE / CONSTANTS.BASE_WALK_SPEED; // time to cross one tile (~0.33 s)
const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function isSolid(tile: number): boolean {
  return tile === TileType.SOLID_WALL || tile === TileType.PLAYER_WALL || tile === TileType.PLAYER_WALL_CRACKED;
}

function stopsBlast(tile: number): boolean {
  return tile === TileType.SOLID_WALL || tile === TileType.BREAKABLE_BRICK || tile === TileType.PLAYER_WALL || tile === TileType.PLAYER_WALL_CRACKED;
}

/** Everything the planner needs, computed once per tick and shared by all bots. */
export interface World {
  state: GameState;
  width: number;
  height: number;
  danger: Float32Array; // seconds until a blast hits the tile (Infinity = safe, 0 = burning now)
  bombTiles: Set<number>;
  outside: Uint8Array; // 1 = outside the safe zone
  tick: number;
}

/** Tiles a bomb at (x, y) with the given range would burn. */
function blastTiles(state: GameState, x: number, y: number, range: number): number[] {
  const w = state.mapWidth;
  const cells = [y * w + x];
  for (const [dx, dy] of DIRS) {
    for (let i = 1; i <= range; i++) {
      const nx = x + dx * i;
      const ny = y + dy * i;
      if (nx < 0 || ny < 0 || nx >= w || ny >= state.mapHeight) break;
      const tile = state.tiles[ny * w + nx];
      if (tile === TileType.SOLID_WALL) break;
      cells.push(ny * w + nx);
      if (stopsBlast(tile)) break;
    }
  }
  return cells;
}

function computeDanger(state: GameState, extra?: { x: number; y: number; range: number; timer: number }): Float32Array {
  const w = state.mapWidth;
  const danger = new Float32Array(w * state.mapHeight).fill(Infinity);
  for (const e of state.explosions) danger[e.tileY * w + e.tileX] = 0;

  const bombs = state.bombs.map((b) => ({ x: b.tileX, y: b.tileY, range: b.range, time: b.timer }));
  if (extra) bombs.push({ x: extra.x, y: extra.y, range: extra.range, time: extra.timer });

  // Chain reactions: a bomb inside another bomb's blast explodes with it
  for (let pass = 0; pass < bombs.length; pass++) {
    let changed = false;
    for (const b of bombs) {
      for (const cell of blastTiles(state, b.x, b.y, b.range)) {
        if (danger[cell] > b.time) danger[cell] = b.time;
        const other = bombs.find((o) => o !== b && o.y * w + o.x === cell);
        if (other && other.time > b.time) {
          other.time = b.time;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return danger;
}

export function buildWorld(state: GameState): World {
  const w = state.mapWidth;
  const outside = new Uint8Array(w * state.mapHeight);
  const z = state.safeZone;
  for (let y = 0; y < state.mapHeight; y++) {
    for (let x = 0; x < w; x++) {
      if (x < z.minX || x > z.maxX || y < z.minY || y > z.maxY) outside[y * w + x] = 1;
    }
  }
  // The edge rows/columns that are about to collapse count as outside shortly before it happens
  if (z.nextShrinkCountdown > 0 && z.nextShrinkCountdown <= EDGE_WARNING_SECONDS) {
    for (let y = z.minY; y <= z.maxY; y++) {
      for (let x = z.minX; x <= z.maxX; x++) {
        const edge =
          (x === z.minX && z.minX < CONSTANTS.FINAL_SAFE_ZONE_MIN_X) ||
          (x === z.maxX && z.maxX > CONSTANTS.FINAL_SAFE_ZONE_MAX_X) ||
          (y === z.minY && z.minY < CONSTANTS.FINAL_SAFE_ZONE_MIN_Y) ||
          (y === z.maxY && z.maxY > CONSTANTS.FINAL_SAFE_ZONE_MAX_Y);
        if (edge) outside[y * w + x] = 1;
      }
    }
  }
  return {
    state,
    width: w,
    height: state.mapHeight,
    danger: computeDanger(state),
    bombTiles: new Set(state.bombs.map((b) => b.tileY * w + b.tileX)),
    outside,
    tick: state.tick,
  };
}

interface Search {
  order: number[]; // visited tiles, nearest first
  dist: Int16Array;
  parent: Int32Array;
}

/**
 * Breadth-first search over walkable tiles.
 * danger: tiles whose blast would hit us on arrival are not entered.
 * passBricks: bricks count as passable (used to plan a route that bombs may open).
 */
function search(world: World, start: number, opts: { danger?: Float32Array; passBricks?: boolean; maxDist: number; allowOutside: boolean }): Search {
  const { state, width, height, bombTiles, outside } = world;
  const dist = new Int16Array(width * height).fill(-1);
  const parent = new Int32Array(width * height).fill(-1);
  const order = [start];
  dist[start] = 0;

  for (let head = 0; head < order.length; head++) {
    const cur = order[head];
    if (dist[cur] >= opts.maxDist) continue;
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (dist[n] >= 0) continue;
      const tile = state.tiles[n];
      if (isSolid(tile)) continue;
      if (tile === TileType.BREAKABLE_BRICK && !opts.passBricks) continue;
      if (bombTiles.has(n)) continue;
      if (!opts.allowOutside && outside[n]) continue;
      if (opts.danger) {
        const arrival = (dist[cur] + 1) * STEP_SECONDS;
        const d = opts.danger[n];
        if (arrival > d - 0.25 && arrival < d + 0.75) continue; // the blast would catch us there
      }
      dist[n] = dist[cur] + 1;
      parent[n] = cur;
      order.push(n);
    }
  }
  return { order, dist, parent };
}

/** The first tile to step onto when walking from `start` to `goal`. */
function firstStep(s: Search, start: number, goal: number): number {
  let cur = goal;
  while (s.parent[cur] !== start && s.parent[cur] !== -1) cur = s.parent[cur];
  return cur;
}

function firstMatch(s: Search, predicate: (tile: number) => boolean): number {
  for (const t of s.order) if (predicate(t)) return t;
  return -1;
}

/** True if a bomb of this bot at its tile can be escaped in time. */
function canEscapeOwnBomb(world: World, bot: Player, range: number): boolean {
  const w = world.width;
  const tx = Math.floor(bot.x / TILE);
  const ty = Math.floor(bot.y / TILE);
  const danger = computeDanger(world.state, { x: tx, y: ty, range, timer: CONSTANTS.BOMB_FUSE_SECONDS });
  const s = search(world, ty * w + tx, { danger, maxDist: 6, allowOutside: false });
  return s.order.some((t) => t !== ty * w + tx && danger[t] === Infinity);
}

function rayClear(state: GameState, ax: number, ay: number, bx: number, by: number): boolean {
  const w = state.mapWidth;
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  let x = ax + sx;
  let y = ay + sy;
  while (x !== bx || y !== by) {
    const tile = state.tiles[y * w + x];
    if (stopsBlast(tile)) return false;
    x += sx;
    y += sy;
  }
  return true;
}

/** Moves toward the middle of the next tile; first lines up with the corridor so the body fits through. */
function steer(bot: Player, nextTile: number, width: number): { dx: number; dy: number } {
  const curX = Math.floor(bot.x / TILE);
  const curY = Math.floor(bot.y / TILE);
  const stepX = (nextTile % width) - curX;
  const stepY = Math.floor(nextTile / width) - curY;
  const offX = curX * TILE + TILE / 2 - bot.x;
  const offY = curY * TILE + TILE / 2 - bot.y;
  const ALIGN = 2.5;
  if (stepX !== 0) {
    if (Math.abs(offY) > ALIGN) return { dx: 0, dy: Math.sign(offY) };
    return { dx: stepX, dy: Math.abs(offY) > 0.8 ? Math.sign(offY) : 0 };
  }
  if (stepY !== 0) {
    if (Math.abs(offX) > ALIGN) return { dx: Math.sign(offX), dy: 0 };
    return { dx: Math.abs(offX) > 0.8 ? Math.sign(offX) : 0, dy: stepY };
  }
  return { dx: 0, dy: 0 };
}

const NONE: BotAction = { dx: 0, dy: 0, placeBomb: false, placeWall: false, answer: null };

/** Decides what one bot does in this tick. */
export function thinkBot(world: World, bot: Player, brain: BotBrain): BotAction {
  const { state, width, danger } = world;
  const profile = PROFILES[brain.level];
  const now = state.matchTime;
  const action: BotAction = { ...NONE };

  // 1. Quiz: "think" for a while, then answer (right or wrong depending on the level)
  if (bot.inQuiz && bot.quizQuestion && bot.quizOptionsShuffled) {
    if (brain.quizAnswerAt === null) {
      const [lo, hi] = profile.quizDelay;
      brain.quizAnswerAt = now + lo + Math.random() * (hi - lo);
      const correct = bot.quizOptionsShuffled.indexOf(bot.quizQuestion.options[bot.quizQuestion.correctIndex]);
      const wrong = [0, 1, 2, 3].filter((i) => i !== correct);
      brain.quizAnswerIndex = Math.random() < profile.quizAccuracy ? correct : wrong[Math.floor(Math.random() * wrong.length)];
    }
    if (now >= brain.quizAnswerAt) {
      action.answer = brain.quizAnswerIndex;
      brain.quizAnswerAt = null;
    }
    return action;
  }
  brain.quizAnswerAt = null;
  if (state.countdown > 0) return action;

  const tx = Math.floor(bot.x / TILE);
  const ty = Math.floor(bot.y / TILE);
  const here = ty * width + tx;
  const insideZone = !world.outside[here];

  // Occasional stumble (weaker levels): a random step instead of the plan
  if (now < brain.stumbleUntil) {
    action.dx = brain.stumbleDx;
    action.dy = brain.stumbleDy;
    return action;
  }
  if (profile.mistakeChance > 0 && Math.random() < profile.mistakeChance * (1 / CONSTANTS.SERVER_TICK_RATE)) {
    const [dx, dy] = DIRS[Math.floor(Math.random() * DIRS.length)];
    brain.stumbleUntil = now + 0.4;
    brain.stumbleDx = dx;
    brain.stumbleDy = dy;
  }

  // Stuck detection: standing still while wanting to go somewhere
  if (Math.hypot(bot.x - brain.lastX, bot.y - brain.lastY) > 1) {
    brain.lastX = bot.x;
    brain.lastY = bot.y;
    brain.stuckSince = now;
  }

  const move = (nextTile: number) => {
    const m = steer(bot, nextTile, width);
    action.dx = m.dx;
    action.dy = m.dy;
  };

  // 2. Danger: run to the nearest tile no known bomb will reach
  const threatened = danger[here] < profile.horizon;
  if (threatened || !insideZone) {
    const s = search(world, here, { danger, maxDist: 14, allowOutside: !insideZone || threatened });
    const goal = firstMatch(s, (t) => t !== here && danger[t] === Infinity && !world.outside[t]);
    if (goal >= 0) {
      move(firstStep(s, here, goal));
      return action;
    }
    // no safe tile reachable: at least go where the blast comes latest
    let best = -1;
    let bestTime = danger[here];
    for (const t of s.order) {
      if (danger[t] > bestTime && !world.outside[t]) {
        bestTime = danger[t];
        best = t;
      }
    }
    if (best >= 0 && best !== here) {
      move(firstStep(s, here, best));
      return action;
    }
    if (!insideZone) {
      // The storm kills for sure, a blast only costs a life: cross the danger if that is the only way in
      const rush = search(world, here, { maxDist: 14, allowOutside: true });
      const inside = firstMatch(rush, (t) => !world.outside[t]);
      if (inside >= 0) {
        move(firstStep(rush, here, inside));
        return action;
      }
      // trapped behind bricks outside the zone: blast a way out
      const nearBrick = DIRS.some(([dx, dy]) => state.tiles[(ty + dy) * width + tx + dx] === TileType.BREAKABLE_BRICK);
      const free = bot.infiniteBombsTimer > 0 || state.bombs.filter((b) => b.ownerId === bot.id).length < bot.maxBombs;
      if (nearBrick && free && !world.bombTiles.has(here) && now - brain.lastBombAt >= 0.6) {
        brain.lastBombAt = now;
        action.placeBomb = true;
      }
      return action;
    }
  }

  // Everything below plans with the danger map so we never walk into a blast
  const safe = search(world, here, { danger, maxDist: 30, allowOutside: false });
  const reach = (t: number) => safe.dist[t] >= 0;

  // 3. Opponents
  const enemies = Object.values(state.players).filter((p) => p.alive && p.id !== bot.id);
  let target: Player | null = null;
  let targetDist = Infinity;
  const open = search(world, here, { passBricks: true, maxDist: 40, allowOutside: false });
  for (const e of enemies) {
    const et = Math.floor(e.y / TILE) * width + Math.floor(e.x / TILE);
    const d = open.dist[et];
    if (d >= 0 && d < targetDist) {
      targetDist = d;
      target = e;
    }
  }

  const range = bot.bigBlastTimer > 0 ? CONSTANTS.BIG_BLAST_RANGE : bot.range;
  const ownBombs = state.bombs.filter((b) => b.ownerId === bot.id).length;
  const canBomb = (bot.infiniteBombsTimer > 0 || ownBombs < bot.maxBombs) && now - brain.lastBombAt >= profile.bombCooldown && !world.bombTiles.has(here);

  if (target && Math.random() < 0.5 + profile.aggression / 2) {
    const ex = Math.floor(target.x / TILE);
    const ey = Math.floor(target.y / TILE);
    const aligned = (ex === tx || ey === ty) && Math.abs(ex - tx) + Math.abs(ey - ty) <= range && rayClear(state, tx, ty, ex, ey);
    const close = targetDist <= 2;
    if (canBomb && (aligned || close) && canEscapeOwnBomb(world, bot, range)) {
      brain.lastBombAt = now;
      action.placeBomb = true;
    }
  }

  // 4. Brick in the way / nothing else to do: blow up bricks when it is safe
  const neighbours = DIRS.map(([dx, dy]) => state.tiles[(ty + dy) * width + tx + dx]);
  const nextToBrick = neighbours.includes(TileType.BREAKABLE_BRICK);
  if (!action.placeBomb && canBomb && nextToBrick && Math.random() < 0.15 + 0.2 * profile.aggression && canEscapeOwnBomb(world, bot, range)) {
    brain.lastBombAt = now;
    action.placeBomb = true;
  }

  // 5. Defensive wall: an enemy is chasing us and we face it
  if (target && targetDist <= 3 && bot.wallStock > 0 && Math.random() < 0.04 * profile.aggression) {
    action.placeWall = true;
  }

  // 6. Where to walk: decide a plan and keep it for a moment, so the bot does not dither
  const questTile = firstMatch(safe, (t) => state.tiles[t] === TileType.QUESTION_TILE);
  const questClose = questTile >= 0 && safe.dist[questTile] <= 14;
  if (now >= brain.modeUntil) {
    brain.modeUntil = now + 1 + Math.random() * 1.5;
    if (questClose && Math.random() < profile.questLove && (!target || targetDist > 5 || bot.lives <= 1)) brain.mode = 'quest';
    else if (target && Math.random() < profile.aggression) brain.mode = 'hunt';
    else brain.mode = 'wander';
  }

  let walkTo = -1;
  if (brain.mode === 'quest' && questClose) {
    walkTo = firstStep(safe, here, questTile);
  } else if (brain.mode === 'hunt' && target) {
    const et = Math.floor(target.y / TILE) * width + Math.floor(target.x / TILE);
    if (reach(et)) {
      if (targetDist > 1) walkTo = firstStep(safe, here, et);
    } else {
      // a brick blocks the way: walk along the open path up to it
      const step = firstStep(open, here, et);
      if (step >= 0 && state.tiles[step] !== TileType.BREAKABLE_BRICK && !world.bombTiles.has(step)) walkTo = step;
    }
  }
  if (walkTo < 0 && brain.mode !== 'hunt') {
    // wander: pick a reachable tile near the middle of the arena (the zone shrinks there) and stay with it
    if (brain.wanderGoal < 0 || brain.wanderGoal === here || !reach(brain.wanderGoal) || now - brain.stuckSince > 1.5) {
      const cx = Math.floor((state.safeZone.minX + state.safeZone.maxX) / 2);
      const cy = Math.floor((state.safeZone.minY + state.safeZone.maxY) / 2);
      const candidates = safe.order.filter(
        (t) => safe.dist[t] >= 3 && safe.dist[t] <= 14 && Math.hypot((t % width) - cx, Math.floor(t / width) - cy) < 14
      );
      brain.wanderGoal = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : -1;
      brain.stuckSince = now;
    }
    if (brain.wanderGoal >= 0 && reach(brain.wanderGoal)) walkTo = firstStep(safe, here, brain.wanderGoal);
  }
  if (walkTo >= 0) move(walkTo);

  return action;
}
