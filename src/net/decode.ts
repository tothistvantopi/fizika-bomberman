/**
 * Turns server messages into the messages the app works with: compact wire snapshots become
 * full GameSnapshots (see shared/wire.ts). Used by the WebSocket client and the offline demo.
 */

import type { AppMessage, ServerMessage } from '@/shared/protocol.js';
import { SnapshotDecoder } from '@/shared/wire.js';

export class MessageDecoder {
  private snapshots = new SnapshotDecoder();

  decode(msg: ServerMessage): AppMessage {
    if (msg.type === 'game_init') this.snapshots.reset(msg.roster);
    if (msg.type === 'snapshot') return { type: 'snapshot', data: this.snapshots.decode(msg.data) };
    return msg;
  }
}
