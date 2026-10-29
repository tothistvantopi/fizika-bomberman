import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PHYSICS_QUESTIONS } from '../shared/data/questions.js';
import { ServerMessage } from '../shared/protocol.js';
import { SnapshotDecoder } from '../shared/wire.js';
import { RoomManager } from './rooms.js';

/** A socket that records what the server sends. */
function fakeSocket() {
  const sent: string[] = [];
  const ws = { readyState: WebSocket.OPEN, send: (data: string) => sent.push(data) } as unknown as WebSocket;
  return { ws, sent, messages: () => sent.map((s) => JSON.parse(s) as ServerMessage) };
}

function runUntilOver(manager: RoomManager, room: ReturnType<RoomManager['createRoom']>['room'], maxCalls = 4000) {
  const advance = (manager as unknown as { advance: (r: typeof room) => void }).advance.bind(manager);
  for (let i = 0; i < maxCalls && !room.state?.win.over; i++) {
    room.lastTickAt = performance.now() - 250; // 5 simulation steps per call
    advance(room);
  }
}

describe('room manager', () => {
  it('sends compact snapshots that decode to the same game state', () => {
    const manager = new RoomManager();
    const host = fakeSocket();
    const { room, client } = manager.createDemoRoom('Tanár', '#ef4444', host.ws);
    const decoder = new SnapshotDecoder();

    const init = host.messages().find((m) => m.type === 'game_init');
    if (!init || init.type !== 'game_init') throw new Error('no game_init');
    decoder.reset(init.roster);
    expect(init.roster.length).toBe(8);

    for (let i = 0; i < 40; i++) {
      room.lastTickAt = performance.now() - 250;
      (manager as unknown as { advance: (r: typeof room) => void }).advance(room);
    }
    const snapshots = host.messages().filter((m) => m.type === 'snapshot');
    expect(snapshots.length).toBeGreaterThan(10);
    const last = snapshots[snapshots.length - 1];
    if (last.type !== 'snapshot') throw new Error();
    const decoded = decoder.decode(last.data);
    expect(decoded.players.length).toBe(8);
    const me = decoded.players.find((p) => p.id === client.playerId)!;
    const truth = room.state!.players[client.playerId];
    expect(me.name).toBe('Tanár');
    expect(Math.abs(me.x - truth.x)).toBeLessThan(0.06);
    expect(me.lives).toBe(truth.lives);
    expect(decoded.bombs.length).toBe(room.state!.bombs.length);

    // Tiles are only sent when they change
    const withTiles = snapshots.filter((m) => m.type === 'snapshot' && m.data.t);
    expect(withTiles.length).toBeLessThan(snapshots.length);

    // Size: the whole point of the compact format (a full-object snapshot of 8 players was ~2.3 kB)
    const typical = host.sent.filter((s) => s.startsWith('{"type":"snapshot"') && !s.includes('"t":['));
    const avg = typical.reduce((n, s) => n + s.length, 0) / typical.length;
    console.log('average snapshot size (8 players):', Math.round(avg), 'bytes');
    expect(avg).toBeLessThan(900);
  });

  it('adds up class points over matches and reports hard questions', () => {
    const manager = new RoomManager();
    const host = fakeSocket();
    const { room, client } = manager.createDemoRoom('Tanár', '#ef4444', host.ws);
    room.state!.maxMatchTime = 20; // short match
    // Pretend the player answered a question wrongly twice, so it shows up in the statistics
    const question = PHYSICS_QUESTIONS[0];
    room.state!.quizLog.push({ questionId: question.id, correct: false }, { questionId: question.id, correct: false });
    room.state!.players[client.playerId].wrongAnswers = 2;
    runUntilOver(manager, room);
    expect(room.state!.win.over).toBe(true);

    const report = host.messages().find((m) => m.type === 'match_report');
    if (!report || report.type !== 'match_report') throw new Error('no match report');
    const rows = report.scores;
    expect(rows.length).toBe(8);
    expect(rows[0].points).toBeGreaterThanOrEqual(rows[rows.length - 1].points);
    const winner = room.state!.win.ranking[0];
    expect(report.gained[winner.playerId]).toBeGreaterThanOrEqual(10);
    expect(report.hardQuestions.some((q) => q.prompt === question.prompt)).toBe(true);
  });

  it('lets the host pick the theme and question topics, and lets a projector watch', () => {
    const manager = new RoomManager();
    const host = fakeSocket();
    const { room, client } = manager.createRoom('Tanár', '#ef4444', host.ws);
    manager.handleClientAction(room, client, { type: 'set_options', theme: 'space', categories: ['newton', 'ismeretlen'] });
    expect(room.options).toEqual({ theme: 'space', categories: ['newton'] });

    const projector = fakeSocket();
    const res = manager.watchRoom(room.code, projector.ws);
    expect('room' in res).toBe(true);
    expect(projector.messages().some((m) => m.type === 'room_watching')).toBe(true);
    expect(manager.watchRoom('XXXX', fakeSocket().ws)).toEqual({ error: 'A megadott szobakód nem létezik!' });

    const second = fakeSocket();
    manager.joinRoom(room.code, 'Béla', '#38b764', second.ws);
    manager.handleClientAction(room, client, { type: 'add_bot' });
    manager.startGame(room, client.playerId);
    expect(room.state!.theme).toBe('space');
    // Only the chosen topic comes up
    for (let i = 0; i < 30; i++) {
      room.lastTickAt = performance.now() - 250;
      (manager as unknown as { advance: (r: typeof room) => void }).advance(room);
    }
    expect(projector.messages().some((m) => m.type === 'game_init')).toBe(true);
    expect(projector.messages().some((m) => m.type === 'snapshot')).toBe(true);
  });
});
