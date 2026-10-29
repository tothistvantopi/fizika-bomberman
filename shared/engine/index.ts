/**
 * Authoritative, framework-free game engine for the free-for-all bomb battle.
 * Exposes createGame, step, and applyAction.
 */

import { CONSTANTS } from '../constants.js';
import { PHYSICS_QUESTIONS } from '../data/questions.js';
import {
  Bomb,
  ExplosionCell,
  FeedEntry,
  GameState,
  Player,
  PlayerInput,
  PowerUpType,
  RankEntry,
  TileType,
} from '../types.js';
import { generateMap } from './map.js';
import {
  computeExplosionKnockback,
  getPlayerBox,
  isBoxOverlappingTile,
  movePlayerWithPhysics,
  updateBombPassers,
} from './physics.js';
import { RNG } from './rng.js';

export interface CreateGameOptions {
  seed: number;
  players: Array<{ id: string; name: string; color: string; playerNumber: number }>;
}

export interface SoundEvent {
  sound: 'bomb_place' | 'explosion' | 'quiz_correct' | 'quiz_wrong' | 'powerup';
  playerId?: string; // set when only this player should hear it
}

export interface EngineEvents {
  sounds: SoundEvent[];
}

export const POWER_UPS: PowerUpType[] = ['INVULNERABLE', 'SPEED', 'BIG_BLAST', 'INFINITE_BOMBS'];

export function createGame(options: CreateGameOptions, rng: RNG): GameState {
  const mapData = generateMap(rng);
  const spawns = rng.shuffle([...mapData.spawnPoints]);

  const players: Record<string, Player> = {};
  options.players.forEach((raw, i) => {
    const spawn = spawns[i % spawns.length];
    const mass = Number(
      (CONSTANTS.MASS_MIN_VARIATION + rng.next() * (CONSTANTS.MASS_MAX_VARIATION - CONSTANTS.MASS_MIN_VARIATION)).toFixed(2)
    );
    players[raw.id] = {
      id: raw.id,
      playerNumber: raw.playerNumber,
      name: raw.name,
      color: raw.color,
      x: spawn.tileX * CONSTANTS.TILE_SIZE_PX + CONSTANTS.TILE_SIZE_PX / 2,
      y: spawn.tileY * CONSTANTS.TILE_SIZE_PX + CONSTANTS.TILE_SIZE_PX / 2,
      facing: 'down',
      alive: true,
      connected: true,
      walkSpeed: CONSTANTS.BASE_WALK_SPEED,
      kx: 0,
      ky: 0,
      mass,
      maxBombs: CONSTANTS.BASE_MAX_BOMBS,
      range: CONSTANTS.BASE_BOMB_RANGE,
      wallStock: CONSTANTS.WALL_START_STOCK,
      wallRegenTimer: 0,
      wallCooldown: 0,
      inQuiz: false,
      quizTileIndex: null,
      quizQuestion: null,
      quizOptionsShuffled: null,
      quizTimer: 0,
      lastQuizResult: null,
      seenQuestionIds: [],
      invulnerableTimer: 0,
      speedTimer: 0,
      bigBlastTimer: 0,
      infiniteBombsTimer: 0,
      lives: CONSTANTS.PLAYER_LIVES,
      hurtTimer: 0,
      kills: 0,
      deathTime: null,
      killedBy: null,
      diedFromStorm: false,
    };
  });

  return {
    tick: 0,
    seed: options.seed,
    status: 'playing',
    countdown: CONSTANTS.START_COUNTDOWN_SECONDS,
    matchTime: 0,
    maxMatchTime: CONSTANTS.MAX_MATCH_DURATION_SECONDS,
    safeZone: {
      minX: 1,
      minY: 1,
      maxX: mapData.width - 2,
      maxY: mapData.height - 2,
      isWarning: false,
      nextShrinkCountdown: CONSTANTS.SHRINK_INITIAL_DELAY_SECONDS,
    },
    mapWidth: mapData.width,
    mapHeight: mapData.height,
    tiles: mapData.tiles,
    tilesVersion: 0,
    players,
    bombs: [],
    explosions: [],
    questionSpawnTimer: CONSTANTS.QUESTION_RESPAWN_SECONDS,
    feed: [],
    feedCounter: 0,
    win: { over: false, reason: '', ranking: [] },
  };
}

function setTile(state: GameState, index: number, tile: TileType): void {
  if (state.tiles[index] !== tile) {
    state.tiles[index] = tile;
    state.tilesVersion++;
  }
}

function isSolidTile(tile: number): boolean {
  return (
    tile === TileType.SOLID_WALL ||
    tile === TileType.BREAKABLE_BRICK ||
    tile === TileType.PLAYER_WALL ||
    tile === TileType.PLAYER_WALL_CRACKED
  );
}

const MAX_FEED = 8;

function pushFeed(state: GameState, entry: Omit<FeedEntry, 'id' | 'time'>): void {
  state.feed.push({ ...entry, id: ++state.feedCounter, time: state.matchTime });
  if (state.feed.length > MAX_FEED) state.feed.shift();
}

/**
 * Knocks a player out for good. killerId is the owner of the bomb; the storm has no killer.
 */
function killPlayer(state: GameState, player: Player, killerId?: string): void {
  player.alive = false;
  player.lives = 0;
  player.inQuiz = false;
  player.quizQuestion = null;
  player.quizOptionsShuffled = null;
  player.deathTime = state.matchTime;

  const killer = killerId && killerId !== player.id ? state.players[killerId] : undefined;
  if (killer) {
    killer.kills++;
    player.killedBy = { name: killer.name, color: killer.color };
    pushFeed(state, { kind: 'out', victimName: player.name, victimColor: player.color, killerName: killer.name, killerColor: killer.color });
  } else {
    player.diedFromStorm = true;
    pushFeed(state, { kind: 'storm', victimName: player.name, victimColor: player.color });
  }
}

/**
 * An explosion hit: costs one life; the last life means knock-out.
 */
function hitPlayer(state: GameState, player: Player, killerId?: string): void {
  if (player.lives <= 1) {
    killPlayer(state, player, killerId);
    return;
  }
  player.lives--;
  player.hurtTimer = CONSTANTS.HIT_PROTECTION_SECONDS;
  const killer = killerId && killerId !== player.id ? state.players[killerId] : undefined;
  pushFeed(state, {
    kind: 'hit',
    victimName: player.name,
    victimColor: player.color,
    killerName: killer?.name,
    killerColor: killer?.color,
    livesLeft: player.lives,
  });
}

/**
 * Places a bomb on the tile under the player.
 */
export function placeBomb(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player || !player.alive || player.inQuiz) return false;

  const owned = state.bombs.filter((b) => b.ownerId === playerId).length;
  if (player.infiniteBombsTimer <= 0 && owned >= player.maxBombs) return false;

  const tileX = Math.floor(player.x / CONSTANTS.TILE_SIZE_PX);
  const tileY = Math.floor(player.y / CONSTANTS.TILE_SIZE_PX);
  if (tileX < 0 || tileX >= state.mapWidth || tileY < 0 || tileY >= state.mapHeight) return false;
  if (state.bombs.some((b) => b.tileX === tileX && b.tileY === tileY)) return false;

  const tile = state.tiles[tileY * state.mapWidth + tileX];
  if (isSolidTile(tile)) return false;

  // Everybody standing on the tile may walk off it
  const passers = Object.values(state.players)
    .filter((p) => p.alive && isBoxOverlappingTile(getPlayerBox(p.x, p.y), tileX, tileY))
    .map((p) => p.id);

  state.bombs.push({
    id: `bomb_${playerId}_${state.tick}_${tileX}_${tileY}`,
    tileX,
    tileY,
    ownerId: playerId,
    timer: CONSTANTS.BOMB_FUSE_SECONDS,
    range: player.bigBlastTimer > 0 ? CONSTANTS.BIG_BLAST_RANGE : player.range,
    passers,
  });
  return true;
}

/**
 * Explodes a bomb: cross-shaped blast stopped by walls, destroying bricks, chaining other bombs.
 */
function explodeBomb(state: GameState, bomb: Bomb, cells: ExplosionCell[], rng: RNG): void {
  const { tileX, tileY, range, ownerId } = bomb;
  const duration = CONSTANTS.EXPLOSION_DURATION_SECONDS;
  cells.push({ tileX, tileY, timer: duration, ownerId });

  for (const dir of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
    for (let step = 1; step <= range; step++) {
      const bx = tileX + dir.dx * step;
      const by = tileY + dir.dy * step;
      if (bx < 0 || bx >= state.mapWidth || by < 0 || by >= state.mapHeight) break;

      const index = by * state.mapWidth + bx;
      const tile = state.tiles[index];
      if (tile === TileType.SOLID_WALL) break;

      if (tile === TileType.BREAKABLE_BRICK) {
        const dropsQuestion = rng.next() < CONSTANTS.BRICK_DROP_QUESTION_CHANCE;
        setTile(state, index, dropsQuestion ? TileType.QUESTION_TILE : TileType.EMPTY);
        cells.push({ tileX: bx, tileY: by, timer: duration, ownerId });
        break;
      }

      if (tile === TileType.PLAYER_WALL || tile === TileType.PLAYER_WALL_CRACKED) {
        // Built walls stop the blast; the first hit only cracks them
        setTile(state, index, tile === TileType.PLAYER_WALL ? TileType.PLAYER_WALL_CRACKED : TileType.EMPTY);
        cells.push({ tileX: bx, tileY: by, timer: duration, ownerId });
        break;
      }

      const other = state.bombs.find((b) => b.tileX === bx && b.tileY === by && b.timer > 0);
      if (other) other.timer = 0; // chain reaction

      cells.push({ tileX: bx, tileY: by, timer: duration, ownerId });
    }
  }

  // Physics fun: explosions push nearby players, lighter players fly further (dv = J / m)
  for (const p of Object.values(state.players)) {
    if (!p.alive || p.inQuiz) continue;
    const kb = computeExplosionKnockback(p.x, p.y, p.mass, tileX, tileY, rng);
    if (kb.applied) {
      p.kx += kb.dvx;
      p.ky += kb.dvy;
    }
  }
}

/**
 * Builds a sturdy wall on the free tile the player is facing.
 */
export function placeWall(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player || !player.alive || player.inQuiz || player.wallStock <= 0 || player.wallCooldown > 0) return false;

  const tx = Math.floor(player.x / CONSTANTS.TILE_SIZE_PX) + (player.facing === 'right' ? 1 : player.facing === 'left' ? -1 : 0);
  const ty = Math.floor(player.y / CONSTANTS.TILE_SIZE_PX) + (player.facing === 'down' ? 1 : player.facing === 'up' ? -1 : 0);
  if (tx < 1 || ty < 1 || tx >= state.mapWidth - 1 || ty >= state.mapHeight - 1) return false;
  if (state.tiles[ty * state.mapWidth + tx] !== TileType.EMPTY) return false;
  if (state.bombs.some((b) => b.tileX === tx && b.tileY === ty)) return false;
  // never wall somebody in
  if (Object.values(state.players).some((p) => p.alive && isBoxOverlappingTile(getPlayerBox(p.x, p.y), tx, ty))) return false;

  setTile(state, ty * state.mapWidth + tx, TileType.PLAYER_WALL);
  player.wallStock--;
  player.wallCooldown = CONSTANTS.WALL_COOLDOWN_SECONDS;
  return true;
}

function startQuiz(state: GameState, player: Player, tileIndex: number, rng: RNG): void {
  const seen = new Set(player.seenQuestionIds);
  let available = PHYSICS_QUESTIONS.filter((q) => !seen.has(q.id));
  if (available.length === 0) {
    seen.clear();
    available = PHYSICS_QUESTIONS;
  }
  const question = rng.choice(available);
  seen.add(question.id);
  player.seenQuestionIds = [...seen];

  const shuffled = rng.shuffle([...question.options]);
  player.inQuiz = true;
  player.quizTileIndex = tileIndex;
  player.quizQuestion = question;
  player.quizOptionsShuffled = [shuffled[0], shuffled[1], shuffled[2]];
  player.quizTimer = CONSTANTS.QUIZ_TIME_SECONDS;
  player.kx = 0;
  player.ky = 0;
}

export function applyPowerUp(player: Player, type: PowerUpType): void {
  switch (type) {
    case 'INVULNERABLE':
      player.invulnerableTimer = CONSTANTS.INVULNERABLE_SECONDS;
      break;
    case 'SPEED':
      player.speedTimer = CONSTANTS.SPEED_SECONDS;
      break;
    case 'BIG_BLAST':
      player.bigBlastTimer = CONSTANTS.BIG_BLAST_SECONDS;
      break;
    case 'INFINITE_BOMBS':
      player.infiniteBombsTimer = CONSTANTS.INFINITE_BOMBS_SECONDS;
      break;
  }
}

/**
 * Ends the player's quiz. answerIndex -1 means the time ran out.
 * The question mark is used up either way; only a correct answer gives a power-up.
 */
function finishQuiz(state: GameState, player: Player, answerIndex: number, rng: RNG, events: EngineEvents): void {
  const question = player.quizQuestion;
  if (!player.inQuiz || !question || !player.quizOptionsShuffled) return;

  const correctAnswer = question.options[question.correctIndex];
  const correct = answerIndex >= 0 && player.quizOptionsShuffled[answerIndex] === correctAnswer;
  const reward = correct ? rng.choice(POWER_UPS) : null;
  if (reward) applyPowerUp(player, reward);

  player.lastQuizResult = {
    seq: (player.lastQuizResult?.seq ?? 0) + 1,
    correct,
    timedOut: answerIndex < 0,
    explanation: question.explanation,
    correctAnswer,
    reward,
  };
  events.sounds.push({ sound: correct ? 'quiz_correct' : 'quiz_wrong', playerId: player.id });
  if (reward) events.sounds.push({ sound: 'powerup', playerId: player.id });

  if (player.quizTileIndex !== null && state.tiles[player.quizTileIndex] === TileType.QUESTION_TILE) {
    setTile(state, player.quizTileIndex, TileType.EMPTY);
  }

  player.inQuiz = false;
  player.quizTileIndex = null;
  player.quizQuestion = null;
  player.quizOptionsShuffled = null;
  player.quizTimer = 0;
  player.invulnerableTimer = Math.max(player.invulnerableTimer, CONSTANTS.QUIZ_GRACE_SECONDS);
}

function updateSafeZone(state: GameState, dt: number): void {
  const z = state.safeZone;
  const canShrink =
    z.minX < CONSTANTS.FINAL_SAFE_ZONE_MIN_X ||
    z.minY < CONSTANTS.FINAL_SAFE_ZONE_MIN_Y ||
    z.maxX > CONSTANTS.FINAL_SAFE_ZONE_MAX_X ||
    z.maxY > CONSTANTS.FINAL_SAFE_ZONE_MAX_Y;

  if (!canShrink) {
    z.isWarning = false;
    z.nextShrinkCountdown = 0;
    return;
  }

  z.nextShrinkCountdown -= dt;
  if (z.nextShrinkCountdown > CONSTANTS.SHRINK_WARNING_SECONDS) {
    z.isWarning = false;
    return;
  }
  if (z.nextShrinkCountdown > 0) {
    z.isWarning = true;
    return;
  }

  // Collapse the edges that are still above their final position into solid walls
  z.isWarning = false;
  z.nextShrinkCountdown = CONSTANTS.SHRINK_INTERVAL_SECONDS;
  const { minX, minY, maxX, maxY } = z;
  const wall = (x: number, y: number) => setTile(state, y * state.mapWidth + x, TileType.SOLID_WALL);

  if (minX < CONSTANTS.FINAL_SAFE_ZONE_MIN_X) {
    for (let y = minY; y <= maxY; y++) wall(minX, y);
    z.minX++;
  }
  if (maxX > CONSTANTS.FINAL_SAFE_ZONE_MAX_X) {
    for (let y = minY; y <= maxY; y++) wall(maxX, y);
    z.maxX--;
  }
  if (minY < CONSTANTS.FINAL_SAFE_ZONE_MIN_Y) {
    for (let x = minX; x <= maxX; x++) wall(x, minY);
    z.minY++;
  }
  if (maxY > CONSTANTS.FINAL_SAFE_ZONE_MAX_Y) {
    for (let x = minX; x <= maxX; x++) wall(x, maxY);
    z.maxY--;
  }
}

function spawnQuestionTile(state: GameState, rng: RNG): void {
  let count = 0;
  for (const t of state.tiles) if (t === TileType.QUESTION_TILE) count++;
  if (count >= CONSTANTS.MAX_QUESTION_TILES) return;

  const z = state.safeZone;
  const blocked = new Set<number>();
  for (const b of state.bombs) blocked.add(b.tileY * state.mapWidth + b.tileX);
  for (const p of Object.values(state.players)) {
    if (p.alive) {
      blocked.add(Math.floor(p.y / CONSTANTS.TILE_SIZE_PX) * state.mapWidth + Math.floor(p.x / CONSTANTS.TILE_SIZE_PX));
    }
  }

  const free: number[] = [];
  for (let y = z.minY; y <= z.maxY; y++) {
    for (let x = z.minX; x <= z.maxX; x++) {
      const i = y * state.mapWidth + x;
      if (state.tiles[i] === TileType.EMPTY && !blocked.has(i)) free.push(i);
    }
  }
  if (free.length > 0) setTile(state, rng.choice(free), TileType.QUESTION_TILE);
}

/**
 * Final standings: survivors first (more lives, then more knock-outs), then whoever died last.
 */
export function computeRanking(state: GameState): RankEntry[] {
  const list = Object.values(state.players).sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (!a.alive && !b.alive && a.deathTime !== b.deathTime) return (b.deathTime ?? 0) - (a.deathTime ?? 0);
    if (a.alive && b.alive && a.lives !== b.lives) return b.lives - a.lives;
    if (a.kills !== b.kills) return b.kills - a.kills;
    return a.playerNumber - b.playerNumber;
  });
  return list.map((p, i) => ({ playerId: p.id, name: p.name, color: p.color, kills: p.kills, rank: i + 1 }));
}

function checkGameOver(state: GameState): void {
  const players = Object.values(state.players);
  const alive = players.filter((p) => p.alive);
  let reason = '';

  if (players.length >= 2 && alive.length <= 1) {
    reason = alive.length === 1 ? `${alive[0].name} maradt utolsónak a pályán!` : 'Az utolsó játékosok egyszerre estek ki!';
  } else if (state.matchTime >= state.maxMatchTime) {
    reason = 'Lejárt az idő! A túlélők között a több élet, majd a több kiütés dönt.';
  }

  if (reason) {
    state.status = 'game_over';
    state.win = { over: true, reason, ranking: computeRanking(state) };
  }
}

/**
 * Steps the engine by dt seconds with the given player inputs.
 */
export function step(state: GameState, inputs: Record<string, PlayerInput>, dt: number, rng: RNG): EngineEvents {
  const events: EngineEvents = { sounds: [] };
  if (state.win.over) return events;

  state.tick++;

  if (state.countdown > 0) {
    state.countdown = Math.max(0, state.countdown - dt);
    return events;
  }

  state.matchTime += dt;
  updateSafeZone(state, dt);

  state.questionSpawnTimer -= dt;
  if (state.questionSpawnTimer <= 0) {
    state.questionSpawnTimer = CONSTANTS.QUESTION_RESPAWN_SECONDS;
    spawnQuestionTile(state, rng);
  }

  // Players outside the safe zone are pushed inward and die (power-ups do not help against the storm)
  const z = state.safeZone;
  const tile = CONSTANTS.TILE_SIZE_PX;
  const damageTick = state.tick % Math.round(CONSTANTS.SERVER_TICK_RATE * CONSTANTS.ZONE_DAMAGE_INTERVAL_SECONDS) === 0;
  for (const p of Object.values(state.players)) {
    if (!p.alive) continue;
    const outside = p.x < z.minX * tile || p.x > (z.maxX + 1) * tile || p.y < z.minY * tile || p.y > (z.maxY + 1) * tile;
    if (!outside) continue;
    const angle = Math.atan2((state.mapHeight * tile) / 2 - p.y, (state.mapWidth * tile) / 2 - p.x);
    p.kx += Math.cos(angle) * 35;
    p.ky += Math.sin(angle) * 35;
    if (damageTick) killPlayer(state, p);
  }

  // Player inputs, timers, movement and question tiles
  for (const player of Object.values(state.players)) {
    if (!player.alive) continue;

    player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dt);
    player.speedTimer = Math.max(0, player.speedTimer - dt);
    player.bigBlastTimer = Math.max(0, player.bigBlastTimer - dt);
    player.infiniteBombsTimer = Math.max(0, player.infiniteBombsTimer - dt);
    player.wallCooldown = Math.max(0, player.wallCooldown - dt);
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    if (player.wallStock < CONSTANTS.WALL_MAX_STOCK) {
      player.wallRegenTimer += dt;
      if (player.wallRegenTimer >= CONSTANTS.WALL_REGEN_SECONDS) {
        player.wallRegenTimer = 0;
        player.wallStock++;
      }
    } else {
      player.wallRegenTimer = 0;
    }

    if (player.inQuiz) {
      player.quizTimer -= dt;
      if (player.quizTimer <= 0) finishQuiz(state, player, -1, rng, events);
      continue;
    }

    const input = inputs[player.id];
    if (input?.placeBomb && placeBomb(state, player.id)) {
      events.sounds.push({ sound: 'bomb_place' });
    }

    if (input?.placeWall && placeWall(state, player.id)) {
      events.sounds.push({ sound: 'bomb_place' });
    }

    movePlayerWithPhysics(player, input?.dx ?? 0, input?.dy ?? 0, dt, state.tiles, state.bombs, state.mapWidth, state.mapHeight);

    const tileX = Math.floor(player.x / tile);
    const tileY = Math.floor(player.y / tile);
    const tileIndex = tileY * state.mapWidth + tileX;
    if (state.tiles[tileIndex] === TileType.QUESTION_TILE) {
      startQuiz(state, player, tileIndex, rng);
    }
  }

  updateBombPassers(state.bombs, state.players);

  // Bombs
  const newCells: ExplosionCell[] = [];
  const remaining: Bomb[] = [];
  // Bombs triggered by a chain reaction in this loop get timer 0 and explode in the same pass
  for (const bomb of state.bombs) {
    bomb.timer -= dt;
    if (bomb.timer <= 0) {
      explodeBomb(state, bomb, newCells, rng);
      events.sounds.push({ sound: 'explosion' });
    } else {
      remaining.push(bomb);
    }
  }
  state.bombs = remaining;
  // Second pass for bombs set to 0 by an explosion processed after them in the list
  let chained = true;
  while (chained) {
    chained = false;
    const next: Bomb[] = [];
    for (const bomb of state.bombs) {
      if (bomb.timer <= 0) {
        explodeBomb(state, bomb, newCells, rng);
        events.sounds.push({ sound: 'explosion' });
        chained = true;
      } else {
        next.push(bomb);
      }
    }
    state.bombs = next;
  }

  state.explosions = state.explosions
    .map((c) => ({ ...c, timer: c.timer - dt }))
    .filter((c) => c.timer > 0)
    .concat(newCells);

  // Explosion hits
  for (const player of Object.values(state.players)) {
    if (!player.alive) continue;
    const box = getPlayerBox(player.x, player.y);
    for (const exp of state.explosions) {
      if (!isBoxOverlappingTile(box, exp.tileX, exp.tileY)) continue;
      if (exp.ownerId === player.id && CONSTANTS.SELF_BOMB_IMMUNITY) continue;
      if (player.inQuiz || player.invulnerableTimer > 0 || player.hurtTimer > 0) continue;
      hitPlayer(state, player, exp.ownerId);
      break;
    }
  }

  checkGameOver(state);
  return events;
}

/**
 * Discrete player actions (currently only quiz answers).
 */
export function applyAction(
  state: GameState,
  playerId: string,
  action: { type: 'quiz_answer'; answerIndex: number },
  rng: RNG
): EngineEvents {
  const events: EngineEvents = { sounds: [] };
  const player = state.players[playerId];
  if (!player || !player.alive || state.win.over) return events;

  if (action.type === 'quiz_answer' && player.inQuiz && action.answerIndex >= 0 && action.answerIndex <= 2) {
    finishQuiz(state, player, action.answerIndex, rng, events);
  }
  return events;
}
