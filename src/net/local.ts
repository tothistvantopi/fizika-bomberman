/**
 * Browser-only "server": runs the very same RoomManager (engine + bots) inside the page,
 * so the demo works on static hosting (e.g. Vercel) with no WebSocket server.
 * Only the single-player mode against computer opponents is available here.
 * Same public API as NetworkClient (src/net/client.ts).
 */

import type { WebSocket as WsSocket } from 'ws';
import { AppMessage, ClientMessage, ServerMessage } from '@/shared/protocol.js';
import { MessageDecoder } from './decode.js';
import { ConnectedClient, Room, RoomManager } from '../../server/rooms.js';
import { sfx } from '../audio/sfx.js';

export type MessageHandler = (msg: AppMessage) => void;
export type ConnectionHandler = (connected: boolean) => void;
export type PingHandler = (ms: number) => void;

export class LocalClient {
  private messageHandlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private pingHandlers = new Set<PingHandler>();
  private manager = new RoomManager();
  private decoder = new MessageDecoder();
  private session: { room: Room; client: ConnectedClient } | null = null;
  public playerId: string | null = null;

  /** Fake socket: what the server "sends" is delivered to the page (JSON copy, like a real network). */
  private readonly socket = {
    readyState: 1,
    send: (data: string) => this.deliver(this.decoder.decode(JSON.parse(data) as ServerMessage)),
  } as unknown as WsSocket;

  public connect(): void {
    queueMicrotask(() => {
      this.connectionHandlers.forEach((h) => h(true));
      this.pingHandlers.forEach((h) => h(0));
    });
  }

  private deliver(msg: AppMessage): void {
    if (msg.type === 'room_created' || msg.type === 'room_joined') this.playerId = msg.playerId;
    if (msg.type === 'sfx') sfx.play(msg.sound);
    this.messageHandlers.forEach((h) => h(msg));
  }

  private reply(msg: ServerMessage): void {
    this.deliver(this.decoder.decode(JSON.parse(JSON.stringify(msg)) as ServerMessage));
  }

  public send(msg: ClientMessage): void {
    switch (msg.type) {
      case 'ping':
        return;
      case 'create_room':
      case 'start_demo': {
        const created =
          msg.type === 'create_room'
            ? this.manager.createRoom(msg.hostName, msg.hostColor, this.socket)
            : this.manager.createDemoRoom(msg.hostName, msg.hostColor, this.socket);
        this.session = created;
        this.reply({
          type: 'room_created',
          roomCode: created.room.code,
          playerId: created.client.playerId,
          reconnectToken: created.client.reconnectToken,
        });
        if (msg.type === 'create_room') this.manager.broadcastLobby(created.room);
        else this.manager.sendGameInit(created.room, created.client);
        return;
      }
      case 'join':
        this.reply({ type: 'error', message: 'A böngészős demóban nincs csatlakozás. Töltsd le a játékot a többjátékos módhoz!' });
        return;
      default:
        if (this.session) this.manager.handleClientAction(this.session.room, this.session.client, msg);
    }
  }

  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  public onPing(handler: PingHandler): () => void {
    this.pingHandlers.add(handler);
    return () => this.pingHandlers.delete(handler);
  }

  public rememberPlayer(_name: string, _color: string): void {}

  public forgetRoom(): void {
    this.session = null;
    this.playerId = null;
  }

  public isConnected(): boolean {
    return true;
  }

  public disconnect(): void {}
}

export const net = new LocalClient();
