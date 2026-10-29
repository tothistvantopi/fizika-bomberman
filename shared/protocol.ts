/**
 * Protocol messages and runtime validators between client and server.
 */

import { FacingDirection, FeedEntry, QuizResultInfo, SafeZoneState, Theme, WinState } from './types.js';
import type { WireSnapshot } from './wire.js';

export type BotLevel = 'easy' | 'normal' | 'hard';
export type ThemeChoice = Theme | 'random';

/** Match settings the host picks in the lobby. */
export interface RoomOptions {
  theme: ThemeChoice;
  categories: string[]; // empty = all question categories
}

/** One row of the class leaderboard (points add up over the matches of a room). */
export interface ScoreRow {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  points: number;
  wins: number;
  games: number;
  kills: number;
  correct: number;
  wrong: number;
}

/** A question that many players got wrong: the teacher may want to explain it again. */
export interface HardQuestion {
  prompt: string;
  correctAnswer: string;
  asked: number;
  correct: number;
}

export type ClientMessage =
  | { type: 'create_room'; hostName: string; hostColor: string }
  | { type: 'join'; roomCode: string; name: string; color: string; reconnectToken?: string }
  | { type: 'start_game' }
  | { type: 'start_demo'; hostName: string; hostColor: string }
  | { type: 'back_to_lobby' }
  | { type: 'input'; dx: number; dy: number; placeBomb?: boolean; placeWall?: boolean }
  | { type: 'quiz_answer'; answerIndex: number }
  | { type: 'add_bot' }
  | { type: 'remove_bot' }
  | { type: 'bot_level'; level: BotLevel }
  | { type: 'set_options'; theme?: ThemeChoice; categories?: string[] }
  | { type: 'watch'; roomCode: string } // projector view: follow a room without playing
  | { type: 'ping'; t: number };

export interface SnapshotPlayer {
  id: string;
  playerNumber: number;
  name: string;
  color: string;
  x: number;
  y: number;
  facing: FacingDirection;
  alive: boolean;
  connected: boolean;
  inQuiz: boolean;
  invulnerable: boolean;
  fast: boolean;
  hurt: boolean; // blinking protection right after losing a life
  blast: boolean; // big-blast power-up active
  infinite: boolean; // infinite-bombs power-up active
  lives: number;
  kills: number;
}

export interface SnapshotBomb {
  id: string;
  tileX: number;
  tileY: number;
  timer: number;
  range: number;
  ownerId: string;
}

export interface SnapshotSelfData {
  inQuiz: boolean;
  quizPrompt: string | null;
  quizTopic: string | null;
  quizOptions: [string, string, string, string] | null;
  quizTimer: number;
  quizResult: QuizResultInfo | null;
  killedBy: { name: string; color: string } | null; // set once this player is out
  diedFromStorm: boolean;
  kx: number; // own knockback velocity (explosions, storm), so the client can predict it
  ky: number;
  maxBombs: number;
  bombsOut: number;
  wallStock: number;
  maxWalls: number;
  invulnerableTimer: number;
  speedTimer: number;
  bigBlastTimer: number;
  infiniteBombsTimer: number;
}

export interface GameSnapshot {
  tick: number;
  status: 'playing' | 'game_over';
  countdown: number;
  matchTime: number;
  maxMatchTime: number;
  safeZone: SafeZoneState;
  players: SnapshotPlayer[];
  tiles?: number[]; // only when they changed since the client's last snapshot
  bombs: SnapshotBomb[];
  explosions: Array<{ tileX: number; tileY: number; timer: number }>;
  feed: FeedEntry[]; // recent hits and knock-outs (last few seconds)
  win: WinState;
  self: SnapshotSelfData;
}

export interface LobbyPlayer {
  id: string;
  playerNumber: number;
  name: string;
  color: string;
  isHost: boolean;
  isBot: boolean;
}

export type SoundName = 'bomb_place' | 'explosion' | 'quiz_correct' | 'quiz_wrong' | 'powerup';

export type ServerMessage =
  | { type: 'room_created'; roomCode: string; playerId: string; reconnectToken: string }
  | { type: 'room_joined'; roomCode: string; playerId: string; reconnectToken: string; isHost: boolean }
  | { type: 'room_watching'; roomCode: string }
  | {
      type: 'lobby_update';
      roomCode: string;
      hostId: string;
      players: LobbyPlayer[];
      botLevel: BotLevel;
      options: RoomOptions;
      scores: ScoreRow[];
      hardQuestions: HardQuestion[];
      watchers: number;
    }
  | {
      type: 'game_init';
      tiles: number[];
      width: number;
      height: number;
      theme: Theme;
      roster: Array<{ id: string; name: string; color: string; playerNumber: number }>;
    }
  | { type: 'snapshot'; data: WireSnapshot }
  | { type: 'match_report'; scores: ScoreRow[]; gained: Record<string, number>; hardQuestions: HardQuestion[] }
  | { type: 'sfx'; sound: SoundName }
  | { type: 'pong'; t: number }
  | { type: 'error'; message: string };

/** What the client code sees: wire snapshots are expanded into full GameSnapshots. */
export type AppMessage = Exclude<ServerMessage, { type: 'snapshot' }> | { type: 'snapshot'; data: GameSnapshot };

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function cleanName(value: unknown, fallback?: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return fallback ?? null;
  return value.trim().slice(0, 14);
}

function cleanColor(value: unknown, fallback?: string): string | null {
  if (typeof value === 'string' && COLOR_RE.test(value.trim())) return value.trim();
  return fallback ?? null;
}

/**
 * Validates untrusted client messages from the WebSocket.
 * Returns the parsed message or null if invalid.
 */
export function validateClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  if (typeof msg.type !== 'string') return null;

  switch (msg.type) {
    case 'create_room': {
      const hostName = cleanName(msg.hostName);
      const hostColor = cleanColor(msg.hostColor);
      return hostName && hostColor ? { type: 'create_room', hostName, hostColor } : null;
    }
    case 'join': {
      const name = cleanName(msg.name);
      const color = cleanColor(msg.color);
      if (typeof msg.roomCode !== 'string' || !msg.roomCode.trim() || !name || !color) return null;
      return {
        type: 'join',
        roomCode: msg.roomCode.trim().toUpperCase().slice(0, 6),
        name,
        color,
        reconnectToken: typeof msg.reconnectToken === 'string' ? msg.reconnectToken : undefined,
      };
    }
    case 'start_demo':
      return {
        type: 'start_demo',
        hostName: cleanName(msg.hostName, 'Tanár')!,
        hostColor: cleanColor(msg.hostColor, '#ef4444')!,
      };
    case 'start_game':
      return { type: 'start_game' };
    case 'back_to_lobby':
      return { type: 'back_to_lobby' };
    case 'input': {
      const dx = Number(msg.dx);
      const dy = Number(msg.dy);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
      return {
        type: 'input',
        dx: Math.max(-1, Math.min(1, dx)),
        dy: Math.max(-1, Math.min(1, dy)),
        placeBomb: Boolean(msg.placeBomb),
        placeWall: Boolean(msg.placeWall),
      };
    }
    case 'quiz_answer': {
      const answerIndex = Number(msg.answerIndex);
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null;
      return { type: 'quiz_answer', answerIndex };
    }
    case 'add_bot':
      return { type: 'add_bot' };
    case 'remove_bot':
      return { type: 'remove_bot' };
    case 'set_options': {
      const theme = msg.theme === 'lab' || msg.theme === 'space' || msg.theme === 'forest' || msg.theme === 'random' ? msg.theme : undefined;
      const categories = Array.isArray(msg.categories)
        ? msg.categories.filter((c): c is string => typeof c === 'string').slice(0, 12).map((c) => c.slice(0, 20))
        : undefined;
      return { type: 'set_options', theme, categories };
    }
    case 'watch': {
      if (typeof msg.roomCode !== 'string' || !msg.roomCode.trim()) return null;
      return { type: 'watch', roomCode: msg.roomCode.trim().toUpperCase().slice(0, 6) };
    }
    case 'bot_level':
      return msg.level === 'easy' || msg.level === 'normal' || msg.level === 'hard' ? { type: 'bot_level', level: msg.level } : null;
    case 'ping': {
      const t = Number(msg.t);
      return Number.isFinite(t) ? { type: 'ping', t } : null;
    }
    default:
      return null;
  }
}
