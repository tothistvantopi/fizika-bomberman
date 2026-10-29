/**
 * WebSocket client with automatic reconnect (the server keeps a player's seat for a minute),
 * and typed message dispatching.
 */

import { AppMessage, ClientMessage, ServerMessage } from '@/shared/protocol.js';
import { MessageDecoder } from './decode.js';
import { sfx } from '../audio/sfx.js';

export type MessageHandler = (msg: AppMessage) => void;
export type ConnectionHandler = (connected: boolean) => void;
export type PingHandler = (ms: number) => void;

interface Session {
  roomCode: string;
  name: string;
  color: string;
  token: string | null;
}

const RECONNECT_DELAY_MS = 1500;

export class NetworkClient {
  private ws: WebSocket | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private pingHandlers = new Set<PingHandler>();
  private pingTimer: number | null = null;
  private reconnectTimeout: number | null = null;
  private isManuallyClosed = false;
  private decoder = new MessageDecoder();
  private session: Session | null = null;
  public playerId: string | null = null;

  public connect(): void {
    this.isManuallyClosed = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.connectionHandlers.forEach((h) => h(true));
      this.startPinging();
      // After a dropped connection (phone sleep, Wi-Fi hiccup) take the old seat back
      if (this.session?.token && this.session.roomCode) {
        this.send({
          type: 'join',
          roomCode: this.session.roomCode,
          name: this.session.name,
          color: this.session.color,
          reconnectToken: this.session.token,
        });
      }
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }

      if (msg.type === 'room_created' || msg.type === 'room_joined') {
        this.playerId = msg.playerId;
        this.session = {
          roomCode: msg.roomCode,
          name: this.session?.name ?? '',
          color: this.session?.color ?? '#ef4444',
          token: msg.reconnectToken,
        };
      }
      if (msg.type === 'pong') {
        const ms = Math.max(0, Math.round(performance.now() - msg.t));
        this.pingHandlers.forEach((h) => h(ms));
        return;
      }
      if (msg.type === 'sfx') sfx.play(msg.sound);

      const decoded = this.decoder.decode(msg);
      this.messageHandlers.forEach((h) => h(decoded));
    };

    ws.onclose = () => {
      this.stopPinging();
      this.connectionHandlers.forEach((h) => h(false));
      if (!this.isManuallyClosed) {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = window.setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      }
    };
  }

  /** Round-trip time to the server, measured every 2 seconds (shown in the HUD). */
  private startPinging(): void {
    this.stopPinging();
    const ping = () => this.send({ type: 'ping', t: performance.now() });
    ping();
    this.pingTimer = window.setInterval(ping, 2000);
  }

  private stopPinging(): void {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  public onPing(handler: PingHandler): () => void {
    this.pingHandlers.add(handler);
    return () => this.pingHandlers.delete(handler);
  }

  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  public send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Remember who we are, so a reconnect can restore the seat. */
  public rememberPlayer(name: string, color: string): void {
    this.session = { roomCode: '', name, color, token: null };
  }

  /** Forget the room (e.g. when the server says it no longer exists). */
  public forgetRoom(): void {
    this.session = null;
    this.playerId = null;
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public disconnect(): void {
    this.isManuallyClosed = true;
    this.stopPinging();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.ws = null;
  }
}

export const net = new NetworkClient();
