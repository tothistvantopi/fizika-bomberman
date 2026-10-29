/**
 * Compact wire format for the 20 Hz game snapshots.
 *
 * Names, colours and other things that never change during a match are sent once (the roster in
 * `game_init`); a snapshot only carries numbers: positions as whole tenths of a pixel, flags as
 * one integer, timers as integers. New feed entries are sent once and the quiz block only while
 * somebody is answering. That is roughly 5x fewer bytes than the full objects, which matters when
 * 15 phones share one school Wi-Fi. The client expands it back into a GameSnapshot.
 */

import { CONSTANTS } from './constants.js';
import type { GameSnapshot, SnapshotBomb, SnapshotPlayer, SnapshotSelfData } from './protocol.js';
import type { FacingDirection, FeedEntry, QuizResultInfo, SafeZoneState, WinState } from './types.js';

export interface RosterEntry {
  id: string;
  name: string;
  color: string;
  playerNumber: number;
}

const FACINGS: FacingDirection[] = ['up', 'down', 'left', 'right'];

// Player flag bits
export const FLAG = {
  ALIVE: 1,
  CONNECTED: 2,
  IN_QUIZ: 4,
  INVULNERABLE: 8,
  FAST: 16,
  HURT: 32,
  BLAST: 64,
  INFINITE: 128,
  // bits 8-9: facing
} as const;

export function facingCode(f: FacingDirection): number {
  return FACINGS.indexOf(f);
}

export interface WireSelf {
  /** kx*10, ky*10, maxBombs, bombsOut, wallStock, invulnerable*10, speed*10, bigBlast*10, infiniteBombs*10 */
  a: number[];
  /** [prompt, topic, options[4], timer*10] while a quiz is open */
  z?: [string, string, [string, string, string, string], number];
  /** the latest quiz result, only sent when it changed */
  r?: QuizResultInfo;
  /** who knocked this player out, or the storm */
  u?: { name: string; color: string } | null;
  d?: 1;
}

export interface WireSnapshot {
  k: number; // tick
  s: 0 | 1; // 1 = game over
  c: number; // countdown * 10
  m: number; // match time * 10
  M: number; // max match time
  z: [number, number, number, number, number, number]; // zone minX, minY, maxX, maxY, warning, nextShrink*10
  /** [rosterIndex, x*10, y*10, flags | facing<<8, lives, kills] */
  p: number[][];
  /** [tileX, tileY, timer*100, range, ownerRosterIndex] */
  b: number[][];
  /** [tileX, tileY, timer*100] */
  e: number[][];
  f?: FeedEntry[]; // feed entries the client has not seen yet
  w?: WinState; // final result, only in the last snapshot
  t?: number[]; // tile map, only when it changed
  q: WireSelf;
}

const r1 = (n: number) => Math.round(n * 10);

/** Builds the part of a snapshot that is the same for every client (players, bombs, zone). */
export function encodeShared(
  state: {
    tick: number;
    status: 'playing' | 'game_over';
    countdown: number;
    matchTime: number;
    maxMatchTime: number;
    safeZone: SafeZoneState;
    players: Record<string, import('./types.js').Player>;
    bombs: import('./types.js').Bomb[];
    explosions: import('./types.js').ExplosionCell[];
    win: WinState;
  },
  roster: RosterEntry[],
  index: Map<string, number>
): Omit<WireSnapshot, 'q' | 'f' | 't'> {
  const p: number[][] = [];
  for (const entry of roster) {
    const pl = state.players[entry.id];
    if (!pl) continue;
    const flags =
      (pl.alive ? FLAG.ALIVE : 0) |
      (pl.connected ? FLAG.CONNECTED : 0) |
      (pl.inQuiz ? FLAG.IN_QUIZ : 0) |
      (pl.invulnerableTimer > 0 ? FLAG.INVULNERABLE : 0) |
      (pl.speedTimer > 0 ? FLAG.FAST : 0) |
      (pl.hurtTimer > 0 ? FLAG.HURT : 0) |
      (pl.bigBlastTimer > 0 ? FLAG.BLAST : 0) |
      (pl.infiniteBombsTimer > 0 ? FLAG.INFINITE : 0);
    p.push([index.get(entry.id)!, r1(pl.x), r1(pl.y), flags | (facingCode(pl.facing) << 8), pl.lives, pl.kills]);
  }
  const z = state.safeZone;
  return {
    k: state.tick,
    s: state.status === 'game_over' ? 1 : 0,
    c: r1(state.countdown),
    m: r1(state.matchTime),
    M: state.maxMatchTime,
    z: [z.minX, z.minY, z.maxX, z.maxY, z.isWarning ? 1 : 0, r1(z.nextShrinkCountdown)],
    p,
    b: state.bombs.map((b) => [b.tileX, b.tileY, Math.round(b.timer * 100), b.range, index.get(b.ownerId) ?? -1]),
    e: state.explosions.map((x) => [x.tileX, x.tileY, Math.round(x.timer * 100)]),
    ...(state.win.over ? { w: state.win } : {}),
  };
}

const EMPTY_SELF: SnapshotSelfData = {
  inQuiz: false,
  quizPrompt: null,
  quizTopic: null,
  quizOptions: null,
  quizTimer: 0,
  quizResult: null,
  killedBy: null,
  diedFromStorm: false,
  kx: 0,
  ky: 0,
  maxBombs: 0,
  bombsOut: 0,
  wallStock: 0,
  maxWalls: CONSTANTS.WALL_MAX_STOCK,
  invulnerableTimer: 0,
  speedTimer: 0,
  bigBlastTimer: 0,
  infiniteBombsTimer: 0,
};

export function emptyWireSelf(): WireSelf {
  return { a: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
}

/** Client side: turns wire snapshots back into the GameSnapshot the game code works with. */
export class SnapshotDecoder {
  private roster: RosterEntry[] = [];
  private feed: FeedEntry[] = [];
  private result: QuizResultInfo | null = null;

  reset(roster: RosterEntry[]): void {
    this.roster = roster;
    this.feed = [];
    this.result = null;
  }

  decode(w: WireSnapshot): GameSnapshot {
    const players: SnapshotPlayer[] = [];
    for (const row of w.p) {
      const entry = this.roster[row[0]];
      if (!entry) continue;
      const flags = row[3];
      players.push({
        id: entry.id,
        playerNumber: entry.playerNumber,
        name: entry.name,
        color: entry.color,
        x: row[1] / 10,
        y: row[2] / 10,
        facing: FACINGS[(flags >> 8) & 3],
        alive: (flags & FLAG.ALIVE) !== 0,
        connected: (flags & FLAG.CONNECTED) !== 0,
        inQuiz: (flags & FLAG.IN_QUIZ) !== 0,
        invulnerable: (flags & FLAG.INVULNERABLE) !== 0,
        fast: (flags & FLAG.FAST) !== 0,
        hurt: (flags & FLAG.HURT) !== 0,
        blast: (flags & FLAG.BLAST) !== 0,
        infinite: (flags & FLAG.INFINITE) !== 0,
        lives: row[4],
        kills: row[5],
      });
    }

    const bombs: SnapshotBomb[] = w.b.map((b) => ({
      id: `${b[0]},${b[1]}`,
      tileX: b[0],
      tileY: b[1],
      timer: b[2] / 100,
      range: b[3],
      ownerId: this.roster[b[4]]?.id ?? '',
    }));
    const explosions = w.e.map((e) => ({ tileX: e[0], tileY: e[1], timer: e[2] / 100 }));

    const matchTime = w.m / 10;
    if (w.f) this.feed.push(...w.f);
    this.feed = this.feed.filter((f) => matchTime - f.time <= CONSTANTS.FEED_VISIBLE_SECONDS);
    if (w.q.r) this.result = w.q.r;

    const a = w.q.a;
    const self: SnapshotSelfData = {
      ...EMPTY_SELF,
      inQuiz: w.q.z !== undefined,
      quizPrompt: w.q.z?.[0] ?? null,
      quizTopic: w.q.z?.[1] ?? null,
      quizOptions: w.q.z?.[2] ?? null,
      quizTimer: (w.q.z?.[3] ?? 0) / 10,
      quizResult: this.result,
      killedBy: w.q.u ?? null,
      diedFromStorm: w.q.d === 1,
      kx: a[0] / 10,
      ky: a[1] / 10,
      maxBombs: a[2],
      bombsOut: a[3],
      wallStock: a[4],
      invulnerableTimer: a[5] / 10,
      speedTimer: a[6] / 10,
      bigBlastTimer: a[7] / 10,
      infiniteBombsTimer: a[8] / 10,
    };

    return {
      tick: w.k,
      status: w.s === 1 ? 'game_over' : 'playing',
      countdown: w.c / 10,
      matchTime,
      maxMatchTime: w.M,
      safeZone: {
        minX: w.z[0],
        minY: w.z[1],
        maxX: w.z[2],
        maxY: w.z[3],
        isWarning: w.z[4] === 1,
        nextShrinkCountdown: w.z[5] / 10,
      },
      players,
      tiles: w.t,
      bombs,
      explosions,
      feed: [...this.feed],
      win: w.w ?? { over: false, reason: '', ranking: [] },
      self,
    };
  }
}
