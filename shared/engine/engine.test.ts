import { describe, expect, it } from 'vitest';
import { CONSTANTS } from '../constants.js';
import { PHYSICS_QUESTIONS } from '../data/questions.js';
import { validateClientMessage } from '../protocol.js';
import { TileType, GameState } from '../types.js';
import { applyAction, computeRanking, createGame, placeBomb, placeWall, step } from './index.js';
import { generateMap, verifyMapConnectivity } from './map.js';
import { applyFriction, computeExplosionKnockback, movePlayerWithPhysics } from './physics.js';
import { createRNG } from './rng.js';

const DT = CONSTANTS.SERVER_TICK_DT;
const T = CONSTANTS.TILE_SIZE_PX;

function newGame(playerCount = 3, seed = 7) {
  const rng = createRNG(seed);
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Játékos${i + 1}`,
    color: '#ff0000',
    playerNumber: i + 1,
  }));
  const state = createGame({ seed, players }, rng);
  state.countdown = 0; // skip the pre-game countdown
  return { state, rng };
}

/** Clears the arena and puts the players on given tiles so tests are deterministic. */
function arena(state: GameState, placements: Record<string, [number, number]>) {
  state.tiles.fill(TileType.EMPTY);
  for (let x = 0; x < state.mapWidth; x++) {
    state.tiles[x] = TileType.SOLID_WALL;
    state.tiles[(state.mapHeight - 1) * state.mapWidth + x] = TileType.SOLID_WALL;
  }
  for (let y = 0; y < state.mapHeight; y++) {
    state.tiles[y * state.mapWidth] = TileType.SOLID_WALL;
    state.tiles[y * state.mapWidth + state.mapWidth - 1] = TileType.SOLID_WALL;
  }
  for (const [id, [tx, ty]] of Object.entries(placements)) {
    state.players[id].x = tx * T + T / 2;
    state.players[id].y = ty * T + T / 2;
  }
}

describe('Physics', () => {
  it('knockback: lighter players fly further (dv = J / m)', () => {
    const rng = createRNG(1);
    const light = computeExplosionKnockback(100, 100, 0.8, 6, 6, rng);
    const heavy = computeExplosionKnockback(100, 100, 1.4, 6, 6, rng);
    expect(Math.hypot(light.dvx, light.dvy) / Math.hypot(heavy.dvx, heavy.dvy)).toBeCloseTo(1.4 / 0.8, 3);
  });

  it('friction decays knockback exponentially', () => {
    const r = applyFriction(50, -40, 0.1);
    const f = Math.exp(-CONSTANTS.FRICTION_DECAY_RATE * 0.1);
    expect(r.kx).toBeCloseTo(50 * f, 4);
    expect(r.ky).toBeCloseTo(-40 * f, 4);
  });

  it('players bounce off walls with damped knockback', () => {
    const { state } = newGame(2);
    arena(state, { p1: [1, 5], p2: [10, 10] });
    const p = state.players.p1;
    p.x = T + 5.1;
    p.kx = -100;
    movePlayerWithPhysics(p, 0, 0, DT, state.tiles, [], state.mapWidth, state.mapHeight);
    expect(p.kx).toBeGreaterThan(0);
  });
});

describe('Map', () => {
  it('is 41x31 with solid border, pillars and enough spawn points for 15 players', () => {
    const map = generateMap(createRNG(3));
    expect(map.width).toBe(41);
    expect(map.height).toBe(31);
    expect(map.spawnPoints.length).toBeGreaterThanOrEqual(15);
    expect(map.tiles[0]).toBe(TileType.SOLID_WALL);
    expect(map.tiles[4 * map.width + 4]).toBe(TileType.SOLID_WALL); // pillar
    expect(map.tiles[2 * map.width + 2]).not.toBe(TileType.SOLID_WALL); // open between pillars
  });

  it('is fully connected and contains question marks for 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateMap(createRNG(seed));
      expect(verifyMapConnectivity(map)).toBe(true);
      const questions = map.tiles.filter((t) => t === TileType.QUESTION_TILE).length;
      expect(questions).toBe(CONSTANTS.INITIAL_QUESTION_TILES);
    }
  });

  it('spawns never sit inside bricks', () => {
    const map = generateMap(createRNG(11));
    for (const sp of map.spawnPoints) {
      expect(map.tiles[sp.tileY * map.width + sp.tileX]).toBe(TileType.EMPTY);
    }
  });
});

describe('Bombs and scoring', () => {
  it('nobody moves or places bombs during the start countdown', () => {
    const { state, rng } = newGame(2);
    state.countdown = 3;
    const startX = state.players.p1.x;
    step(state, { p1: { dx: 1, dy: 0, placeBomb: true } }, DT, rng);
    expect(state.players.p1.x).toBe(startX);
    expect(state.bombs.length).toBe(0);
  });

  it('an opponent bomb on the last life knocks a player out and credits the bomb owner', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [5, 5], p2: [7, 5], p3: [30, 25] });
    state.players.p2.lives = 1;
    expect(placeBomb(state, 'p1')).toBe(true);
    state.players.p1.x = 3 * T + T / 2; // owner steps away
    state.bombs[0].passers = [];
    state.bombs[0].timer = 0.01;
    step(state, {}, DT, rng);
    expect(state.players.p2.alive).toBe(false);
    expect(state.players.p1.kills).toBe(1);
    expect(state.players.p1.alive).toBe(true);
    expect(state.players.p2.killedBy?.name).toBe('Játékos1');
    expect(state.feed.at(-1)).toMatchObject({ kind: 'out', victimName: 'Játékos2', killerName: 'Játékos1' });
  });

  it('own bombs never hurt the owner', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [5, 5], p2: [30, 20], p3: [30, 25] });
    placeBomb(state, 'p1');
    state.bombs[0].timer = 0.01;
    step(state, {}, DT, rng);
    expect(state.players.p1.alive).toBe(true);
  });

  it('invulnerable players survive explosions', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [5, 5], p2: [6, 5], p3: [30, 25] });
    state.players.p2.invulnerableTimer = 30;
    placeBomb(state, 'p1');
    state.bombs[0].timer = 0.01;
    step(state, {}, DT, rng);
    expect(state.players.p2.alive).toBe(true);
  });

  it('only one bomb at a time normally, unlimited while the infinite-bombs power-up runs', () => {
    const { state } = newGame(2);
    arena(state, { p1: [5, 5], p2: [30, 25] });
    expect(placeBomb(state, 'p1')).toBe(true);
    state.players.p1.x += T;
    expect(placeBomb(state, 'p1')).toBe(false);
    state.players.p1.infiniteBombsTimer = 10;
    expect(placeBomb(state, 'p1')).toBe(true);
    state.players.p1.x += T;
    expect(placeBomb(state, 'p1')).toBe(true);
    expect(state.bombs.length).toBe(3);
  });

  it('big-blast power-up makes bombs reach much further', () => {
    const { state, rng } = newGame(2);
    arena(state, { p1: [3, 5], p2: [30, 25] });
    state.players.p1.bigBlastTimer = 30;
    placeBomb(state, 'p1');
    expect(state.bombs[0].range).toBe(CONSTANTS.BIG_BLAST_RANGE);
    state.bombs[0].timer = 0.01;
    step(state, {}, DT, rng);
    const reach = state.explosions.filter((e) => e.tileY === 5 && e.tileX > 3).length;
    expect(reach).toBe(CONSTANTS.BIG_BLAST_RANGE);
  });

  it('chain reactions detonate neighbouring bombs in the same tick', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [5, 5], p2: [30, 20], p3: [30, 25] });
    placeBomb(state, 'p1');
    state.players.p1.infiniteBombsTimer = 10;
    state.players.p1.x += T;
    placeBomb(state, 'p1');
    state.bombs[0].timer = 0.01;
    state.bombs[1].timer = 1.5;
    step(state, {}, DT, rng);
    expect(state.bombs.length).toBe(0);
  });

  it('blasts destroy bricks and sometimes reveal question marks', () => {
    const { state, rng } = newGame(2, 5);
    arena(state, { p1: [5, 5], p2: [30, 25] });
    state.tiles[5 * state.mapWidth + 6] = TileType.BREAKABLE_BRICK;
    const before = state.tilesVersion;
    placeBomb(state, 'p1');
    state.bombs[0].timer = 0.01;
    step(state, {}, DT, rng);
    expect([TileType.EMPTY, TileType.QUESTION_TILE]).toContain(state.tiles[5 * state.mapWidth + 6]);
    expect(state.tilesVersion).toBeGreaterThan(before);
  });
});

describe('Lives', () => {
  function bombOn(state: GameState, ownerId: string, tx: number, ty: number) {
    state.bombs.push({ id: `b_${tx}_${ty}_${state.tick}`, tileX: tx, tileY: ty, ownerId, timer: 0.01, range: 2, passers: [] });
  }

  it('everybody starts with 3 lives', () => {
    const { state } = newGame(3);
    expect(Object.values(state.players).every((p) => p.lives === CONSTANTS.PLAYER_LIVES && CONSTANTS.PLAYER_LIVES === 3)).toBe(true);
  });

  it('a hit costs one life, gives short protection and is reported with the attacker', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [5, 5], p2: [7, 5], p3: [30, 25] });
    bombOn(state, 'p1', 6, 5);
    step(state, {}, DT, rng);
    const p2 = state.players.p2;
    expect(p2.alive).toBe(true);
    expect(p2.lives).toBe(2);
    expect(p2.hurtTimer).toBeGreaterThan(1);
    expect(state.feed.at(-1)).toMatchObject({ kind: 'hit', victimName: 'Játékos2', killerName: 'Játékos1', livesLeft: 2 });
    expect(state.players.p1.kills).toBe(0); // only knock-outs count
  });

  it('one blast never takes two lives, but the next explosion after the protection does', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [5, 5], p2: [7, 5], p3: [30, 25] });
    bombOn(state, 'p1', 6, 5);
    for (let i = 0; i < 12; i++) step(state, {}, DT, rng); // the 0.5 s blast stays on the tile
    expect(state.players.p2.lives).toBe(2);
    for (let i = 0; i < 1.6 / DT; i++) step(state, {}, DT, rng); // protection over
    bombOn(state, 'p1', 6, 5);
    step(state, {}, DT, rng);
    expect(state.players.p2.lives).toBe(1);
  });

  it('the third hit knocks the player out', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [5, 5], p2: [7, 5], p3: [30, 25] });
    for (let hit = 0; hit < 3; hit++) {
      state.players.p2.hurtTimer = 0;
      state.explosions = [];
      bombOn(state, 'p1', 6, 5);
      step(state, {}, DT, rng);
    }
    expect(state.players.p2.alive).toBe(false);
    expect(state.players.p2.killedBy?.name).toBe('Játékos1');
    expect(state.players.p1.kills).toBe(1);
  });

  it('the storm knocks a player out immediately, whatever lives are left', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [20, 15], p2: [21, 15], p3: [2, 2] });
    state.safeZone.minX = 5;
    state.safeZone.minY = 5;
    for (let y = 0; y < state.mapHeight; y++) state.tiles[y * state.mapWidth + 3] = TileType.SOLID_WALL;
    for (let i = 0; i < 2 / DT; i++) step(state, {}, DT, rng);
    expect(state.players.p3.alive).toBe(false);
    expect(state.players.p3.diedFromStorm).toBe(true);
    expect(state.players.p3.killedBy).toBeNull();
    expect(state.feed.at(-1)).toMatchObject({ kind: 'storm', victimName: 'Játékos3' });
  });

  it('survivors are ranked by lives left when time runs out', () => {
    const { state } = newGame(3);
    state.players.p1.lives = 1;
    state.players.p2.lives = 3;
    state.players.p3.lives = 2;
    expect(computeRanking(state).map((r) => r.playerId)).toEqual(['p2', 'p3', 'p1']);
  });
});

describe('Player walls', () => {
  function wallGame() {
    const { state, rng } = newGame(3);
    arena(state, { p1: [5, 5], p2: [30, 20], p3: [30, 25] });
    state.players.p1.facing = 'right';
    return { state, rng };
  }

  it('builds a wall on the tile in front, uses stock and respects the cooldown', () => {
    const { state } = wallGame();
    expect(placeWall(state, 'p1')).toBe(true);
    expect(state.tiles[5 * state.mapWidth + 6]).toBe(TileType.PLAYER_WALL);
    expect(state.players.p1.wallStock).toBe(CONSTANTS.WALL_START_STOCK - 1);
    expect(placeWall(state, 'p1')).toBe(false); // cooldown
  });

  it('cannot build on solid tiles, bombs or other players', () => {
    const { state } = wallGame();
    state.tiles[5 * state.mapWidth + 6] = TileType.SOLID_WALL;
    expect(placeWall(state, 'p1')).toBe(false);
    state.tiles[5 * state.mapWidth + 6] = TileType.EMPTY;
    state.players.p2.x = 6 * T + T / 2;
    state.players.p2.y = 5 * T + T / 2;
    expect(placeWall(state, 'p1')).toBe(false);
  });

  it('blocks movement and survives exactly one explosion', () => {
    const { state, rng } = wallGame();
    placeWall(state, 'p1');
    const idx = 5 * state.mapWidth + 6;
    state.players.p2.x = 8 * T + T / 2;
    state.players.p2.y = 5 * T + T / 2;
    state.players.p3.x = 30 * T;
    state.players.p3.y = 25 * T;

    // bomb on the far side: the blast is stopped by the wall, the player behind it is safe
    state.bombs.push({ id: 'b1', tileX: 7, tileY: 5, ownerId: 'p3', timer: 0.01, range: 3, passers: [] });
    step(state, {}, DT, rng);
    expect(state.tiles[idx]).toBe(TileType.PLAYER_WALL_CRACKED);
    expect(state.players.p1.alive).toBe(true);

    state.bombs.push({ id: 'b2', tileX: 7, tileY: 5, ownerId: 'p3', timer: 0.01, range: 3, passers: [] });
    step(state, {}, DT, rng);
    expect(state.tiles[idx]).toBe(TileType.EMPTY);
  });

  it('refills the wall stock over time', () => {
    const { state, rng } = wallGame();
    placeWall(state, 'p1');
    for (let i = 0; i < (CONSTANTS.WALL_REGEN_SECONDS + 1) / DT; i++) step(state, {}, DT, rng);
    expect(state.players.p1.wallStock).toBe(CONSTANTS.WALL_START_STOCK);
  });
});

describe('Question marks', () => {
  function startQuiz() {
    const { state, rng } = newGame(2);
    arena(state, { p1: [5, 5], p2: [30, 25] });
    const idx = 5 * state.mapWidth + 5;
    state.tiles[idx] = TileType.QUESTION_TILE;
    step(state, {}, DT, rng);
    return { state, rng, idx };
  }

  it('stepping on a question mark opens a quiz and protects the player', () => {
    const { state, idx } = startQuiz();
    const p = state.players.p1;
    expect(p.inQuiz).toBe(true);
    expect(p.quizOptionsShuffled?.length).toBe(4);
    expect(p.quizQuestion).not.toBeNull();
    expect(state.tiles[idx]).toBe(TileType.QUESTION_TILE);
  });

  it('a correct answer consumes the tile and gives a power-up', () => {
    const { state, rng, idx } = startQuiz();
    const p = state.players.p1;
    const correct = p.quizOptionsShuffled!.indexOf(p.quizQuestion!.options[p.quizQuestion!.correctIndex]);
    applyAction(state, 'p1', { type: 'quiz_answer', answerIndex: correct }, rng);
    expect(p.inQuiz).toBe(false);
    expect(p.lastQuizResult?.correct).toBe(true);
    expect(p.lastQuizResult?.reward).not.toBeNull();
    expect(state.tiles[idx]).toBe(TileType.EMPTY);
    const active = [p.invulnerableTimer > CONSTANTS.QUIZ_GRACE_SECONDS, p.speedTimer > 0, p.bigBlastTimer > 0, p.infiniteBombsTimer > 0];
    expect(active.filter(Boolean).length).toBe(1);
  });

  it('a wrong answer gives nothing but still uses the tile up', () => {
    const { state, rng, idx } = startQuiz();
    const p = state.players.p1;
    const wrong = p.quizOptionsShuffled!.findIndex((o) => o !== p.quizQuestion!.options[p.quizQuestion!.correctIndex]);
    applyAction(state, 'p1', { type: 'quiz_answer', answerIndex: wrong }, rng);
    expect(p.lastQuizResult?.correct).toBe(false);
    expect(p.lastQuizResult?.reward).toBeNull();
    expect(p.speedTimer + p.bigBlastTimer + p.infiniteBombsTimer).toBe(0);
    expect(state.tiles[idx]).toBe(TileType.EMPTY);
  });

  it('an unanswered quiz times out as a wrong answer', () => {
    const { state, rng } = startQuiz();
    for (let i = 0; i < (CONSTANTS.QUIZ_TIME_SECONDS + 1) / DT; i++) step(state, {}, DT, rng);
    expect(state.players.p1.inQuiz).toBe(false);
    expect(state.players.p1.lastQuizResult?.timedOut).toBe(true);
  });

  it('players in a quiz are immune to explosions', () => {
    const { state, rng } = startQuiz();
    state.explosions.push({ tileX: 5, tileY: 5, timer: 0.4, ownerId: 'p2' });
    step(state, {}, DT, rng);
    expect(state.players.p1.alive).toBe(true);
  });

  it('new question marks keep appearing during the match', () => {
    const { state, rng } = newGame(2);
    arena(state, { p1: [5, 5], p2: [30, 25] });
    const count = () => state.tiles.filter((t) => t === TileType.QUESTION_TILE).length;
    expect(count()).toBe(0);
    for (let i = 0; i < (CONSTANTS.QUESTION_RESPAWN_SECONDS + 0.5) / DT; i++) step(state, {}, DT, rng);
    expect(count()).toBeGreaterThan(0);
  });
});

describe('Question bank', () => {
  it('has enough questions with 4 distinct options and an explanation', () => {
    expect(PHYSICS_QUESTIONS.length).toBeGreaterThanOrEqual(40);
    const prompts = new Set<string>();
    for (const q of PHYSICS_QUESTIONS) {
      expect(new Set(q.options).size).toBe(4);
      expect(q.explanation.length).toBeGreaterThan(5);
      expect(prompts.has(q.prompt)).toBe(false);
      prompts.add(q.prompt);
    }
  });

  it('contains no work/energy questions', () => {
    const banned = /(energia|munka|joule|teljesítmény|watt|hatásfok)/i;
    for (const q of PHYSICS_QUESTIONS) {
      expect(banned.test(q.prompt + q.options.join(' ') + q.topic)).toBe(false);
    }
  });

  it('contains no calculation tasks', () => {
    for (const q of PHYSICS_QUESTIONS) {
      expect(/(számít|számold|mennyi\b|hány (méter|km|newton|kg))/i.test(q.prompt)).toBe(false);
    }
  });
});

describe('Question topics and themes', () => {
  it('only asks questions from the chosen categories', () => {
    const { state, rng } = newGame(2);
    state.categories = ['newton'];
    arena(state, { p1: [5, 5], p2: [30, 25] });
    const asked = new Set<string>();
    for (let i = 0; i < 25; i++) {
      state.tiles[5 * state.mapWidth + 5] = TileType.QUESTION_TILE;
      state.players.p1.inQuiz = false;
      state.players.p1.x = 5 * 16 + 8 - 16;
      step(state, { p1: { dx: 1, dy: 0 } }, DT, rng);
      for (let t = 0; t < 12 && !state.players.p1.inQuiz; t++) step(state, { p1: { dx: 1, dy: 0 } }, DT, rng);
      const q = state.players.p1.quizQuestion;
      if (q) asked.add(q.category);
      applyAction(state, 'p1', { type: 'quiz_answer', answerIndex: 0 }, rng);
      state.players.p1.seenQuestionIds = [];
    }
    expect(asked.size).toBeGreaterThan(0);
    expect([...asked]).toEqual(['newton']);
  });

  it('tracks right and wrong answers per player', () => {
    const { state, rng } = newGame(2);
    arena(state, { p1: [5, 5], p2: [30, 25] });
    state.tiles[5 * state.mapWidth + 5] = TileType.QUESTION_TILE;
    step(state, {}, DT, rng);
    const p = state.players.p1;
    const correct = p.quizOptionsShuffled!.indexOf(p.quizQuestion!.options[p.quizQuestion!.correctIndex]);
    applyAction(state, 'p1', { type: 'quiz_answer', answerIndex: correct }, rng);
    expect(p.correctAnswers).toBe(1);
    expect(p.wrongAnswers).toBe(0);
    expect(state.quizLog).toEqual([{ questionId: expect.any(Number), correct: true }]);
  });
});

describe('Shrinking zone', () => {
  it('collapses edges into solid walls that match the new safe area', () => {
    const { state, rng } = newGame(2);
    arena(state, { p1: [20, 15], p2: [21, 15] });
    state.safeZone.nextShrinkCountdown = 0.01;
    step(state, {}, DT, rng);
    expect(state.safeZone.minX).toBe(2);
    expect(state.safeZone.maxX).toBe(state.mapWidth - 3);
    for (let y = 1; y < state.mapHeight - 1; y++) expect(state.tiles[y * state.mapWidth + 1]).toBe(TileType.SOLID_WALL);
  });

  it('eventually shrinks to the final zone and never further', () => {
    const { state, rng } = newGame(2);
    arena(state, { p1: [20, 15], p2: [21, 15] });
    for (let i = 0; i < 40; i++) {
      state.safeZone.nextShrinkCountdown = 0.01;
      step(state, {}, DT, rng);
    }
    const z = state.safeZone;
    expect([z.minX, z.maxX, z.minY, z.maxY]).toEqual([
      CONSTANTS.FINAL_SAFE_ZONE_MIN_X,
      CONSTANTS.FINAL_SAFE_ZONE_MAX_X,
      CONSTANTS.FINAL_SAFE_ZONE_MIN_Y,
      CONSTANTS.FINAL_SAFE_ZONE_MAX_Y,
    ]);
  });

  it('kills players that stay outside', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [20, 15], p2: [21, 15], p3: [2, 2] });
    state.safeZone.minX = 5;
    state.safeZone.minY = 5;
    // collapsed edge: a wall column keeps the player from being pushed back in
    for (let y = 0; y < state.mapHeight; y++) state.tiles[y * state.mapWidth + 3] = TileType.SOLID_WALL;
    for (let i = 0; i < 2 / DT; i++) step(state, {}, DT, rng);
    expect(state.players.p3.alive).toBe(false);
  });
});

describe('Winning and the podium', () => {
  it('last survivor wins; the one who died last is second', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [5, 5], p2: [20, 15], p3: [30, 25] });
    state.matchTime = 10;
    state.players.p3.alive = false;
    state.players.p3.deathTime = 10;
    state.matchTime = 20;
    state.players.p2.alive = false;
    state.players.p2.deathTime = 20;
    step(state, {}, DT, rng);
    expect(state.win.over).toBe(true);
    expect(state.win.ranking.map((r) => r.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(state.win.ranking.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('simultaneous last deaths are ordered by kills', () => {
    const { state } = newGame(3);
    state.players.p1.alive = false;
    state.players.p1.deathTime = 50;
    state.players.p1.kills = 0;
    state.players.p2.alive = false;
    state.players.p2.deathTime = 50;
    state.players.p2.kills = 2;
    state.players.p3.alive = false;
    state.players.p3.deathTime = 10;
    expect(computeRanking(state).map((r) => r.playerId)).toEqual(['p2', 'p1', 'p3']);
  });

  it('the match ends after 5 minutes; survivors with more kills rank higher', () => {
    const { state, rng } = newGame(3);
    arena(state, { p1: [20, 15], p2: [21, 15], p3: [19, 15] });
    state.safeZone = { minX: 1, minY: 1, maxX: 39, maxY: 29, isWarning: false, nextShrinkCountdown: 9999 };
    state.players.p2.kills = 3;
    state.matchTime = state.maxMatchTime - 0.01;
    step(state, {}, DT, rng);
    expect(state.win.over).toBe(true);
    expect(state.win.ranking[0].playerId).toBe('p2');
  });

  it('a lone player does not end the game immediately', () => {
    const { state, rng } = newGame(1);
    step(state, {}, DT, rng);
    expect(state.win.over).toBe(false);
  });

  it('the game is frozen after it ended', () => {
    const { state, rng } = newGame(2);
    state.win.over = true;
    const tick = state.tick;
    step(state, {}, DT, rng);
    expect(state.tick).toBe(tick);
  });
});

describe('Protocol validation', () => {
  it('accepts valid messages and rejects junk', () => {
    expect(validateClientMessage({ type: 'create_room', hostName: 'Anna', hostColor: '#ff0000' })).not.toBeNull();
    expect(validateClientMessage({ type: 'create_room', hostName: 'Anna', hostColor: 'red' })).toBeNull();
    expect(validateClientMessage({ type: 'input', dx: 5, dy: -9, placeBomb: true })).toMatchObject({ dx: 1, dy: -1 });
    expect(validateClientMessage({ type: 'input', dx: NaN, dy: 0 })).toBeNull();
    expect(validateClientMessage({ type: 'quiz_answer', answerIndex: 4 })).toBeNull();
    expect(validateClientMessage({ type: 'sabotage' })).toBeNull();
    expect(validateClientMessage({ type: 'ping', t: 12.5 })).toEqual({ type: 'ping', t: 12.5 });
    expect(validateClientMessage({ type: 'ping', t: 'x' })).toBeNull();
    expect(validateClientMessage('hello')).toBeNull();
  });
});

describe('question bank', () => {
  const qs = PHYSICS_QUESTIONS;

  it('has four distinct options per question and unique ids', () => {
    expect(new Set(qs.map((x) => x.id)).size).toBe(qs.length);
    for (const x of qs) {
      expect(x.options.length).toBe(4);
      expect(new Set(x.options).size).toBe(4);
      expect(x.explanation.length).toBeGreaterThan(10);
    }
  });

  it('does not give the answer away by its length', () => {
    // "pick the longest answer" must not work: the correct one is the longest in about a quarter of the questions
    const correctIsLongest = qs.filter((x) => x.options[0].length === Math.max(...x.options.map((o) => o.length))).length;
    expect(correctIsLongest / qs.length).toBeGreaterThan(0.15);
    expect(correctIsLongest / qs.length).toBeLessThan(0.4);
    for (const x of qs) {
      const lengths = x.options.map((o) => o.length);
      expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(2);
    }
  });
});
