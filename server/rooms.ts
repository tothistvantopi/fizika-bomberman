/**
 * Room management for up to 15 players per room: 4-letter room codes,
 * reconnect tokens, input rate limiting, the 20 Hz simulation loop and per-player snapshots.
 */

import { WebSocket } from 'ws';
import { CONSTANTS } from '../shared/constants.js';
import { PHYSICS_QUESTIONS, QUESTION_CATEGORIES } from '../shared/data/questions.js';
import { applyAction, createGame, EngineEvents, step } from '../shared/engine/index.js';
import { createRNG, RNG } from '../shared/engine/rng.js';
import { BOT_COLORS, BOT_NAMES, BotBrain, buildWorld, createBotBrain, thinkBot } from './bots.js';
import {
  BotLevel,
  ClientMessage,
  HardQuestion,
  LobbyPlayer,
  RoomOptions,
  ScoreRow,
  ServerMessage,
} from '../shared/protocol.js';
import { GameState, PlayerInput, Theme } from '../shared/types.js';
import { emptyWireSelf, encodeShared, RosterEntry, WireSelf } from '../shared/wire.js';

export interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  name: string;
  color: string;
  playerNumber: number;
  reconnectToken: string;
  lastInputTimestamp: number;
  inputMessageCount: number;
  lastTilesVersion: number; // last tile map version sent to this client (-1 = none)
  lastFeedId: number; // newest kill-feed entry this client has already received
  lastResultSeq: number; // newest quiz result this client has already received
}

/** A projector view: sees the whole match, never plays. */
export interface Spectator {
  id: string;
  ws: WebSocket;
  lastTilesVersion: number;
  lastFeedId: number;
}

export interface BotSlot {
  id: string;
  name: string;
  color: string;
  playerNumber: number;
}

export interface Room {
  code: string;
  hostId: string;
  rng: RNG;
  clients: Map<string, ConnectedClient>; // playerId -> client
  disconnectedTokens: Map<string, { playerId: string; name: string; color: string; playerNumber: number }>;
  state: GameState | null;
  heldInputs: Record<string, { dx: number; dy: number; at: number }>; // last direction a player sent
  pendingActions: Record<string, { placeBomb: boolean; placeWall: boolean }>; // one-shot presses
  botSlots: BotSlot[]; // computer players that join the next game
  botLevel: BotLevel;
  botBrains: Record<string, BotBrain>;
  options: RoomOptions;
  scores: Map<string, ScoreRow>; // class leaderboard, adds up over the matches of this room
  questionStats: Map<number, { asked: number; correct: number }>;
  roster: RosterEntry[]; // who is in the current match (snapshots refer to players by index)
  rosterIndex: Map<string, number>;
  spectators: Map<string, Spectator>;
  reported: boolean; // the match report of the current game was already sent
  tickInterval?: NodeJS.Timeout;
  tickAccumulatorMs: number; // real time not yet simulated
  lastTickAt: number;
  emptySince: number | null; // when the last client left (for cleanup)
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous chars
const ABANDONED_ROOM_MS = 60_000;
// A held direction stays active until a new input arrives; this is only the safety stop for a lost connection
const HELD_INPUT_TIMEOUT_MS = 1500;
// The simulation runs in fixed 50 ms steps, but they are scheduled against the real clock:
// a late timer no longer makes the game run slower than real time (which made clients drift ahead).
const TIMER_RESOLUTION_MS = 10;
const MAX_STEPS_PER_TIMER = 5;

function randomId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 8);
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.removeAbandonedRooms(), 15_000);
    this.sweeper.unref?.(); // browsers (demo build) return a number instead
  }

  private generateRoomCode(): string {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  private makeClient(ws: WebSocket, name: string, color: string, playerNumber: number, token?: string, playerId?: string): ConnectedClient {
    return {
      ws,
      playerId: playerId ?? randomId('p_'),
      name,
      color,
      playerNumber,
      reconnectToken: token ?? randomId('tok_') + Date.now().toString(36),
      lastInputTimestamp: Date.now(),
      inputMessageCount: 0,
      lastTilesVersion: -1,
      lastFeedId: 0,
      lastResultSeq: 0,
    };
  }

  createRoom(hostName: string, hostColor: string, ws: WebSocket): { room: Room; client: ConnectedClient } {
    const client = this.makeClient(ws, hostName, hostColor, 1);
    const room: Room = {
      code: this.generateRoomCode(),
      hostId: client.playerId,
      rng: createRNG(Date.now() ^ Math.floor(Math.random() * 0x7fffffff)),
      clients: new Map([[client.playerId, client]]),
      disconnectedTokens: new Map(),
      state: null,
      heldInputs: {},
      pendingActions: {},
      botSlots: [],
      botLevel: 'normal',
      botBrains: {},
      options: { theme: 'random', categories: [] },
      scores: new Map(),
      questionStats: new Map(),
      roster: [],
      rosterIndex: new Map(),
      spectators: new Map(),
      reported: false,
      tickAccumulatorMs: 0,
      lastTickAt: Date.now(),
      emptySince: null,
    };
    this.rooms.set(room.code, room);
    return { room, client };
  }

  /** Teacher test mode: the host plus 7 computer players, the game starts immediately. */
  createDemoRoom(hostName: string, hostColor: string, ws: WebSocket): { room: Room; client: ConnectedClient } {
    const { room, client } = this.createRoom(hostName, hostColor, ws);
    for (let i = 0; i < 7; i++) this.addBotSlot(room);
    this.beginGame(room);
    return { room, client };
  }

  private usedNumbers(room: Room): Set<number> {
    return new Set([...Array.from(room.clients.values()).map((c) => c.playerNumber), ...room.botSlots.map((b) => b.playerNumber)]);
  }

  private playerCount(room: Room): number {
    return room.clients.size + room.botSlots.length;
  }

  private addBotSlot(room: Room): boolean {
    if (this.playerCount(room) >= CONSTANTS.MAX_PLAYERS) return false;
    const used = this.usedNumbers(room);
    let playerNumber = 1;
    while (used.has(playerNumber)) playerNumber++;
    const usedColors = new Set([...Array.from(room.clients.values()).map((c) => c.color), ...room.botSlots.map((b) => b.color)]);
    const nameIndex = room.botSlots.length % BOT_NAMES.length;
    room.botSlots.push({
      id: `bot_${playerNumber}`,
      name: `${BOT_NAMES[nameIndex]} (bot)`,
      color: BOT_COLORS.find((c) => !usedColors.has(c)) ?? BOT_COLORS[nameIndex],
      playerNumber,
    });
    return true;
  }

  joinRoom(
    roomCode: string,
    name: string,
    color: string,
    ws: WebSocket,
    reconnectToken?: string
  ): { room: Room; client: ConnectedClient; isReconnect: boolean } | { error: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { error: 'A megadott szobakód nem létezik!' };

    const info = reconnectToken ? room.disconnectedTokens.get(reconnectToken) : undefined;
    if (reconnectToken && info) {
      room.disconnectedTokens.delete(reconnectToken);
      const client = this.makeClient(ws, info.name, info.color, info.playerNumber, reconnectToken, info.playerId);
      room.clients.set(info.playerId, client);
      room.emptySince = null;
      if (room.state?.players[info.playerId]) room.state.players[info.playerId].connected = true;
      return { room, client, isReconnect: true };
    }

    if (room.state) return { error: 'A játék már elkezdődött ebben a szobában!' };
    if (this.playerCount(room) >= CONSTANTS.MAX_PLAYERS) return { error: `A szoba megtelt (maximum ${CONSTANTS.MAX_PLAYERS} játékos)!` };

    const used = this.usedNumbers(room);
    let playerNumber = 1;
    while (used.has(playerNumber)) playerNumber++;

    const client = this.makeClient(ws, name, color, playerNumber);
    room.clients.set(client.playerId, client);
    room.emptySince = null;
    return { room, client, isReconnect: false };
  }

  handleDisconnect(ws: WebSocket): { room: Room; client: ConnectedClient } | null {
    for (const room of this.rooms.values()) {
      for (const [id, spectator] of room.spectators) {
        if (spectator.ws === ws) {
          room.spectators.delete(id);
          if (!room.state) this.broadcastLobby(room);
          return null;
        }
      }
      for (const [playerId, client] of room.clients) {
        if (client.ws !== ws) continue;

        room.clients.delete(playerId);
        room.disconnectedTokens.set(client.reconnectToken, {
          playerId,
          name: client.name,
          color: client.color,
          playerNumber: client.playerNumber,
        });
        if (room.state?.players[playerId]) room.state.players[playerId].connected = false;
        delete room.heldInputs[playerId];
        delete room.pendingActions[playerId];

        if (room.hostId === playerId) {
          const next = room.clients.values().next().value;
          if (next) room.hostId = next.playerId;
        }
        if (room.clients.size === 0) room.emptySince = Date.now();
        return { room, client };
      }
    }
    return null;
  }

  private removeAbandonedRooms(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const abandoned = room.clients.size === 0 && room.emptySince !== null && now - room.emptySince > ABANDONED_ROOM_MS;
      if (abandoned) this.destroyRoom(room);
    }
  }

  private destroyRoom(room: Room): void {
    if (room.tickInterval) clearInterval(room.tickInterval);
    this.rooms.delete(room.code);
  }

  startGame(room: Room, requesterId: string): { success: boolean; error?: string } {
    if (room.hostId !== requesterId) return { success: false, error: 'Csak a szobavezető indíthatja a játékot!' };
    if (room.state) return { success: false, error: 'A játék már fut.' };
    if (this.playerCount(room) < CONSTANTS.MIN_PLAYERS_TO_START) {
      return { success: false, error: `Legalább ${CONSTANTS.MIN_PLAYERS_TO_START} játékos szükséges az indításhoz!` };
    }

    this.beginGame(room);
    return { success: true };
  }

  /** After a finished game the host sends everybody back to the lobby. */
  resetToLobby(room: Room, requesterId: string): boolean {
    if (room.hostId !== requesterId || !room.state?.win.over) return false;
    if (room.tickInterval) clearInterval(room.tickInterval);
    room.tickInterval = undefined;
    room.state = null;
    room.heldInputs = {};
    room.pendingActions = {};
    room.botBrains = {};
    room.disconnectedTokens.clear(); // players who left during the game are gone
    this.broadcastLobby(room);
    return true;
  }

  private beginGame(room: Room): void {
    const players = [
      ...Array.from(room.clients.values()).map((c) => ({ id: c.playerId, name: c.name, color: c.color, playerNumber: c.playerNumber })),
      ...room.botSlots,
    ];
    const theme: Theme = room.options.theme === 'random' ? room.rng.choice<Theme>(['lab', 'space', 'forest']) : room.options.theme;
    room.state = createGame({ seed: Date.now(), players, theme, categories: room.options.categories }, room.rng);
    room.reported = false;
    room.roster = Object.values(room.state.players).map((p) => ({ id: p.id, name: p.name, color: p.color, playerNumber: p.playerNumber }));
    room.rosterIndex = new Map(room.roster.map((r, i) => [r.id, i]));
    room.botBrains = Object.fromEntries(room.botSlots.map((b) => [b.id, createBotBrain(room.botLevel)]));
    // Optional shorter matches, e.g. MATCH_SECONDS=120 npm start (never longer than 5 minutes)
    const limit = Number(typeof process !== 'undefined' ? process.env.MATCH_SECONDS : 0);
    if (limit > 0 && limit < room.state.maxMatchTime) room.state.maxMatchTime = limit;
    room.heldInputs = {};
    room.pendingActions = {};

    for (const client of room.clients.values()) this.sendGameInit(room, client);
    for (const spectator of room.spectators.values()) this.sendSpectatorInit(room, spectator);

    if (room.tickInterval) clearInterval(room.tickInterval);
    room.tickAccumulatorMs = 0;
    room.lastTickAt = performance.now();
    room.tickInterval = setInterval(() => this.advance(room), TIMER_RESOLUTION_MS);
  }

  /** Tells one client the map; also used when a player reconnects mid-game. */
  sendGameInit(room: Room, client: ConnectedClient): void {
    const state = room.state;
    if (!state) return;
    client.lastTilesVersion = state.tilesVersion;
    client.lastFeedId = 0;
    client.lastResultSeq = 0;
    this.send(client, this.initMessage(room, state));
  }

  private initMessage(room: Room, state: GameState): ServerMessage {
    return {
      type: 'game_init',
      tiles: state.tiles,
      width: state.mapWidth,
      height: state.mapHeight,
      theme: state.theme,
      roster: room.roster,
    };
  }

  private sendSpectatorInit(room: Room, spectator: Spectator): void {
    const state = room.state;
    if (!state) return;
    spectator.lastTilesVersion = state.tilesVersion;
    spectator.lastFeedId = 0;
    this.sendTo(spectator.ws, this.initMessage(room, state));
  }

  /** Projector view: follow a room without joining the game. */
  watchRoom(roomCode: string, ws: WebSocket): { room: Room; spectator: Spectator } | { error: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { error: 'A megadott szobakód nem létezik!' };
    if (room.spectators.size >= 4) return { error: 'Egy szobához legfeljebb 4 kivetítő csatlakozhat.' };
    const spectator: Spectator = { id: randomId('w_'), ws, lastTilesVersion: -1, lastFeedId: 0 };
    room.spectators.set(spectator.id, spectator);
    this.sendTo(ws, { type: 'room_watching', roomCode: room.code });
    if (room.state) {
      this.sendSpectatorInit(room, spectator);
      this.broadcastSnapshots(room);
    } else {
      this.broadcastLobby(room);
    }
    return { room, spectator };
  }

  /** Runs as many fixed simulation steps as real time has passed, then sends one snapshot. */
  private advance(room: Room): void {
    const state = room.state;
    if (!state) return;

    const now = performance.now();
    room.tickAccumulatorMs += Math.min(now - room.lastTickAt, 500);
    room.lastTickAt = now;

    const stepMs = CONSTANTS.SERVER_TICK_DT * 1000;
    let steps = 0;
    const events: EngineEvents = { sounds: [] };
    while (room.tickAccumulatorMs >= stepMs && steps < MAX_STEPS_PER_TIMER && !state.win.over) {
      this.runBots(room, state);
      events.sounds.push(...step(state, this.collectInputs(room), CONSTANTS.SERVER_TICK_DT, room.rng).sounds);
      room.pendingActions = {};
      room.tickAccumulatorMs -= stepMs;
      steps++;
    }
    if (steps === MAX_STEPS_PER_TIMER) room.tickAccumulatorMs = 0; // way behind: skip instead of racing

    if (steps === 0) return;
    this.sendSounds(room, events);
    this.broadcastSnapshots(room);

    if (state.win.over) {
      if (room.tickInterval) clearInterval(room.tickInterval); // final snapshot was sent
      room.tickInterval = undefined;
      this.finishMatch(room, state);
    }
  }

  /** Held directions persist between ticks, so a late or lost packet no longer makes a player stutter. */
  private collectInputs(room: Room): Record<string, PlayerInput> {
    const now = Date.now();
    const inputs: Record<string, PlayerInput> = {};
    for (const [id, held] of Object.entries(room.heldInputs)) {
      const fresh = now - held.at <= HELD_INPUT_TIMEOUT_MS;
      inputs[id] = { dx: fresh ? held.dx : 0, dy: fresh ? held.dy : 0 };
    }
    for (const [id, actions] of Object.entries(room.pendingActions)) {
      inputs[id] = { ...(inputs[id] ?? { dx: 0, dy: 0 }), placeBomb: actions.placeBomb, placeWall: actions.placeWall };
    }
    return inputs;
  }

  /** Shared sounds go to everyone (once per tick), personal ones only to their player. */
  private sendSounds(room: Room, events: EngineEvents): void {
    const shared = new Set<string>();
    for (const ev of events.sounds) {
      if (ev.playerId) {
        const client = room.clients.get(ev.playerId);
        if (client) this.send(client, { type: 'sfx', sound: ev.sound });
      } else if (!shared.has(ev.sound)) {
        shared.add(ev.sound);
        this.broadcast(room, { type: 'sfx', sound: ev.sound });
      }
    }
  }

  /** Lets every living computer player decide what to do in this tick. */
  private runBots(room: Room, state: GameState): void {
    if (room.botSlots.length === 0) return;
    const world = buildWorld(state);
    for (const p of Object.values(state.players)) {
      const brain = room.botBrains[p.id];
      if (!brain || !p.alive) continue;
      brain.level = room.botLevel;

      const action = thinkBot(world, p, brain);
      if (action.answer !== null) {
        applyAction(state, p.id, { type: 'quiz_answer', answerIndex: action.answer }, room.rng);
        continue;
      }
      room.heldInputs[p.id] = { dx: action.dx, dy: action.dy, at: Date.now() };
      if (action.placeBomb || action.placeWall) {
        room.pendingActions[p.id] = { placeBomb: action.placeBomb, placeWall: action.placeWall };
      }
    }
  }

  private broadcastSnapshots(room: Room): void {
    const state = room.state;
    if (!state) return;

    // Everything that is the same for all clients is turned into JSON only once
    const sharedJson = JSON.stringify(encodeShared(state, room.roster, room.rosterIndex));
    const head = '{"type":"snapshot","data":' + sharedJson.slice(0, -1);
    const newestFeed = state.feed.length > 0 ? state.feed[state.feed.length - 1].id : 0;
    const r1 = (n: number) => Math.round(n * 10);

    for (const client of room.clients.values()) {
      const me = state.players[client.playerId];
      if (!me) continue;

      const self: WireSelf = {
        a: [
          r1(me.kx),
          r1(me.ky),
          me.maxBombs,
          state.bombs.reduce((n, b) => n + (b.ownerId === me.id ? 1 : 0), 0),
          me.wallStock,
          r1(me.invulnerableTimer),
          r1(me.speedTimer),
          r1(me.bigBlastTimer),
          r1(me.infiniteBombsTimer),
        ],
      };
      if (me.inQuiz && me.quizQuestion && me.quizOptionsShuffled) {
        self.z = [me.quizQuestion.prompt, me.quizQuestion.topic, me.quizOptionsShuffled, r1(me.quizTimer)];
      }
      if (me.lastQuizResult && me.lastQuizResult.seq !== client.lastResultSeq) {
        self.r = me.lastQuizResult;
        client.lastResultSeq = me.lastQuizResult.seq;
      }
      if (me.killedBy) self.u = me.killedBy;
      if (me.diedFromStorm) self.d = 1;

      let extras = ',"q":' + JSON.stringify(self);
      const newFeed = state.feed.filter((f) => f.id > client.lastFeedId);
      if (newFeed.length > 0) {
        extras += ',"f":' + JSON.stringify(newFeed);
        client.lastFeedId = newestFeed;
      }
      if (client.lastTilesVersion !== state.tilesVersion) {
        extras += ',"t":' + JSON.stringify(state.tiles);
        client.lastTilesVersion = state.tilesVersion;
      }
      this.sendRaw(client.ws, head + extras + '}}');
    }

    for (const spectator of room.spectators.values()) {
      let extras = ',"q":' + JSON.stringify(emptyWireSelf());
      const newFeed = state.feed.filter((f) => f.id > spectator.lastFeedId);
      if (newFeed.length > 0) {
        extras += ',"f":' + JSON.stringify(newFeed);
        spectator.lastFeedId = newestFeed;
      }
      if (spectator.lastTilesVersion !== state.tilesVersion) {
        extras += ',"t":' + JSON.stringify(state.tiles);
        spectator.lastTilesVersion = state.tilesVersion;
      }
      this.sendRaw(spectator.ws, head + extras + '}}');
    }
  }

  /** Class leaderboard and statistics once a match is over. */
  private finishMatch(room: Room, state: GameState): void {
    if (room.reported) return;
    room.reported = true;

    const gained: Record<string, number> = {};
    for (const entry of state.win.ranking) {
      const player = state.players[entry.playerId];
      if (!player) continue;
      const placement = entry.rank === 1 ? 10 : entry.rank === 2 ? 7 : entry.rank === 3 ? 5 : 3;
      const points = placement + player.kills + player.correctAnswers;
      gained[player.id] = points;

      const row =
        room.scores.get(player.id) ??
        ({ id: player.id, name: player.name, color: player.color, isBot: player.id.startsWith('bot_'), points: 0, wins: 0, games: 0, kills: 0, correct: 0, wrong: 0 } as ScoreRow);
      row.name = player.name;
      row.color = player.color;
      row.points += points;
      row.wins += entry.rank === 1 ? 1 : 0;
      row.games += 1;
      row.kills += player.kills;
      row.correct += player.correctAnswers;
      row.wrong += player.wrongAnswers;
      room.scores.set(player.id, row);
    }
    for (const log of state.quizLog) {
      const stat = room.questionStats.get(log.questionId) ?? { asked: 0, correct: 0 };
      stat.asked++;
      if (log.correct) stat.correct++;
      room.questionStats.set(log.questionId, stat);
    }
    this.broadcast(room, { type: 'match_report', scores: this.scoreList(room), gained, hardQuestions: this.hardQuestions(room) });
  }

  private scoreList(room: Room): ScoreRow[] {
    return [...room.scores.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.kills - a.kills);
  }

  /** The questions most players got wrong (asked at least twice, below ~65% correct). */
  private hardQuestions(room: Room): HardQuestion[] {
    const rows: Array<HardQuestion & { ratio: number }> = [];
    for (const [id, stat] of room.questionStats) {
      const question = PHYSICS_QUESTIONS.find((q) => q.id === id);
      if (!question || stat.asked < 2) continue;
      const ratio = stat.correct / stat.asked;
      if (ratio > 0.65) continue;
      rows.push({ prompt: question.prompt, correctAnswer: question.options[question.correctIndex], asked: stat.asked, correct: stat.correct, ratio });
    }
    return rows
      .sort((a, b) => a.ratio - b.ratio || b.asked - a.asked)
      .slice(0, 5)
      .map(({ ratio: _ratio, ...rest }) => rest);
  }

  /** Sends the current snapshot right away (e.g. to a player who just reconnected). */
  pushSnapshot(room: Room): void {
    this.broadcastSnapshots(room);
  }

  broadcastLobby(room: Room): void {
    const players: LobbyPlayer[] = [
      ...Array.from(room.clients.values()).map((c) => ({
        id: c.playerId,
        playerNumber: c.playerNumber,
        name: c.name,
        color: c.color,
        isHost: c.playerId === room.hostId,
        isBot: false,
      })),
      ...room.botSlots.map((b) => ({ id: b.id, playerNumber: b.playerNumber, name: b.name, color: b.color, isHost: false, isBot: true })),
    ];
    this.broadcast(room, {
      type: 'lobby_update',
      roomCode: room.code,
      hostId: room.hostId,
      players,
      botLevel: room.botLevel,
      options: room.options,
      scores: this.scoreList(room),
      hardQuestions: this.hardQuestions(room),
      watchers: room.spectators.size,
    });
  }

  private send(client: ConnectedClient, msg: ServerMessage): void {
    this.sendTo(client.ws, msg);
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    this.sendRaw(ws, JSON.stringify(msg));
  }

  private sendRaw(ws: WebSocket, payload: string): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }

  /** To all players and projector views of the room. */
  broadcast(room: Room, msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const client of room.clients.values()) this.sendRaw(client.ws, payload);
    for (const spectator of room.spectators.values()) this.sendRaw(spectator.ws, payload);
  }

  handleClientAction(room: Room, client: ConnectedClient, msg: ClientMessage): void {
    switch (msg.type) {
      case 'start_game': {
        const res = this.startGame(room, client.playerId);
        if (!res.success && res.error) this.send(client, { type: 'error', message: res.error });
        return;
      }
      case 'back_to_lobby':
        this.resetToLobby(room, client.playerId);
        return;
      case 'set_options': {
        if (room.state || room.hostId !== client.playerId) return;
        if (msg.theme) room.options.theme = msg.theme;
        if (msg.categories) {
          const known = new Set(QUESTION_CATEGORIES.map((c) => c.id));
          room.options.categories = msg.categories.filter((c) => known.has(c));
        }
        this.broadcastLobby(room);
        return;
      }
      case 'add_bot':
      case 'remove_bot':
      case 'bot_level': {
        // Only the host, and only while waiting in the lobby
        if (room.state || room.hostId !== client.playerId) return;
        if (msg.type === 'add_bot') this.addBotSlot(room);
        else if (msg.type === 'remove_bot') room.botSlots.pop();
        else room.botLevel = msg.level;
        this.broadcastLobby(room);
        return;
      }
      case 'input': {
        // Rate limit: only movement messages, many per second by design
        const now = Date.now();
        if (now - client.lastInputTimestamp > 1000) {
          client.lastInputTimestamp = now;
          client.inputMessageCount = 0;
        }
        if (++client.inputMessageCount > CONSTANTS.MAX_CLIENT_INPUT_RATE || !room.state) return;

        room.heldInputs[client.playerId] = { dx: msg.dx, dy: msg.dy, at: now };
        if (msg.placeBomb || msg.placeWall) {
          const previous = room.pendingActions[client.playerId];
          room.pendingActions[client.playerId] = {
            placeBomb: Boolean(msg.placeBomb || previous?.placeBomb),
            placeWall: Boolean(msg.placeWall || previous?.placeWall),
          };
        }
        return;
      }
      case 'quiz_answer': {
        if (!room.state) return;
        this.sendSounds(room, applyAction(room.state, client.playerId, { type: 'quiz_answer', answerIndex: msg.answerIndex }, room.rng));
        return;
      }
    }
  }
}
