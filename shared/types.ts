/**
 * Shared types for client, server, and the pure engine.
 */

export type FacingDirection = 'up' | 'down' | 'left' | 'right';

export const enum TileType {
  EMPTY = 0,
  SOLID_WALL = 1,
  BREAKABLE_BRICK = 2,
  QUESTION_TILE = 3,
  PLAYER_WALL = 4, // built by a player, survives one explosion
  PLAYER_WALL_CRACKED = 5, // a damaged player wall, breaks on the next explosion
}

export type PowerUpType = 'INVULNERABLE' | 'SPEED' | 'BIG_BLAST' | 'INFINITE_BOMBS';

export interface PhysicsQuestion {
  id: number;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  topic: string;
  explanation: string;
}

export interface QuizResultInfo {
  seq: number; // increments on every answer so the client can detect a new result
  correct: boolean;
  timedOut: boolean;
  explanation: string;
  correctAnswer: string;
  reward: PowerUpType | null;
}

export interface Player {
  id: string;
  playerNumber: number; // 1 to 15
  name: string;
  color: string; // tie colour
  x: number; // center x in px
  y: number; // center y in px
  facing: FacingDirection;
  alive: boolean;
  connected: boolean;
  walkSpeed: number;
  kx: number; // knockback velocity
  ky: number;
  mass: number; // explosion knockback: dv = J / m
  maxBombs: number;
  range: number;

  // Wall building
  wallStock: number;
  wallRegenTimer: number;
  wallCooldown: number;

  // Quiz state
  inQuiz: boolean;
  quizTileIndex: number | null;
  quizQuestion: PhysicsQuestion | null;
  quizOptionsShuffled: [string, string, string, string] | null;
  quizTimer: number;
  lastQuizResult: QuizResultInfo | null;
  seenQuestionIds: number[]; // avoids repeating questions until the bank is exhausted

  // Timed power-ups (seconds remaining)
  invulnerableTimer: number;
  speedTimer: number;
  bigBlastTimer: number;
  infiniteBombsTimer: number;

  // Lives and scoring
  lives: number;
  hurtTimer: number; // brief protection after losing a life
  kills: number;
  deathTime: number | null; // matchTime when the player died
  killedBy: { name: string; color: string } | null; // who knocked this player out
  diedFromStorm: boolean;
}

export interface FeedEntry {
  id: number;
  kind: 'hit' | 'out' | 'storm';
  victimName: string;
  victimColor: string;
  killerName?: string;
  killerColor?: string;
  livesLeft?: number;
  time: number; // matchTime when it happened
}

export interface Bomb {
  id: string;
  tileX: number;
  tileY: number;
  ownerId: string;
  timer: number; // seconds
  range: number;
  passers: string[]; // players that may still walk out of this bomb tile
}

export interface ExplosionCell {
  tileX: number;
  tileY: number;
  timer: number;
  ownerId?: string;
}

export interface SafeZoneState {
  minX: number; // inclusive tile bounds of the safe area
  minY: number;
  maxX: number;
  maxY: number;
  isWarning: boolean; // an edge is about to collapse
  nextShrinkCountdown: number;
}

export interface RankEntry {
  playerId: string;
  name: string;
  color: string;
  kills: number;
  rank: number;
}

export interface WinState {
  over: boolean;
  reason: string;
  ranking: RankEntry[]; // best first
}

export interface GameState {
  tick: number;
  seed: number;
  status: 'playing' | 'game_over';
  countdown: number; // seconds until the match starts
  matchTime: number;
  maxMatchTime: number;
  safeZone: SafeZoneState;
  mapWidth: number;
  mapHeight: number;
  tiles: number[]; // flat TileType array
  tilesVersion: number; // bumped whenever tiles change (lets the server send them only when needed)
  players: Record<string, Player>;
  bombs: Bomb[];
  explosions: ExplosionCell[];
  questionSpawnTimer: number;
  feed: FeedEntry[]; // recent hits and knock-outs, newest last
  feedCounter: number;
  win: WinState;
}

export interface PlayerInput {
  dx: number; // -1, 0, 1
  dy: number;
  placeBomb?: boolean;
  placeWall?: boolean;
}
