/**
 * WebSocket game server: connects sockets to the RoomManager.
 */

import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { validateClientMessage } from '../shared/protocol.js';
import { ConnectedClient, Room, RoomManager } from './rooms.js';

const HEARTBEAT_MS = 15_000;

export function setupGameServer(httpServer: HttpServer): { roomManager: RoomManager } {
  // Compression costs CPU on every message and the snapshots are small, so it is turned off
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', perMessageDeflate: false });
  // Server-level errors (e.g. port already in use) are reported by server.ts
  wss.on('error', () => {});
  const roomManager = new RoomManager();
  const sessions = new WeakMap<WebSocket, { room: Room; client: ConnectedClient }>();
  const alive = new WeakMap<WebSocket, boolean>();

  const reply = (ws: WebSocket, msg: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  wss.on('connection', (ws: WebSocket, req) => {
    // Send small frequent messages immediately instead of waiting to batch them (lower latency)
    req.socket.setNoDelay(true);
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));

    ws.on('message', (raw) => {
      try {
        const msg = validateClientMessage(JSON.parse(raw.toString()));
        if (!msg) return; // drop malformed messages

        if (msg.type === 'ping') {
          reply(ws, { type: 'pong', t: msg.t });
          return;
        }

        if (msg.type === 'create_room' || msg.type === 'start_demo') {
          const created =
            msg.type === 'create_room'
              ? roomManager.createRoom(msg.hostName, msg.hostColor, ws)
              : roomManager.createDemoRoom(msg.hostName, msg.hostColor, ws);
          sessions.set(ws, created);
          reply(ws, {
            type: 'room_created',
            roomCode: created.room.code,
            playerId: created.client.playerId,
            reconnectToken: created.client.reconnectToken,
          });
          if (msg.type === 'create_room') roomManager.broadcastLobby(created.room);
          else roomManager.sendGameInit(created.room, created.client);
          return;
        }

        if (msg.type === 'watch') {
          const res = roomManager.watchRoom(msg.roomCode, ws);
          if ('error' in res) reply(ws, { type: 'error', message: res.error });
          return;
        }

        if (msg.type === 'join') {
          const res = roomManager.joinRoom(msg.roomCode, msg.name, msg.color, ws, msg.reconnectToken);
          if ('error' in res) {
            reply(ws, { type: 'error', message: res.error });
            return;
          }
          sessions.set(ws, res);
          reply(ws, {
            type: 'room_joined',
            roomCode: res.room.code,
            playerId: res.client.playerId,
            reconnectToken: res.client.reconnectToken,
            isHost: res.client.playerId === res.room.hostId,
          });
          if (res.room.state) {
            roomManager.sendGameInit(res.room, res.client);
            roomManager.pushSnapshot(res.room);
          } else {
            roomManager.broadcastLobby(res.room);
          }
          return;
        }

        const session = sessions.get(ws);
        if (session) roomManager.handleClientAction(session.room, session.client, msg);
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      const left = roomManager.handleDisconnect(ws);
      if (left && !left.room.state) roomManager.broadcastLobby(left.room);
      sessions.delete(ws);
    });

    ws.on('error', (err) => console.warn('WebSocket error:', err.message));
  });

  // Drop sockets of phones that went to sleep so their players show as disconnected
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  return { roomManager };
}
