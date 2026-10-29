/**
 * Client-side prediction for the local player.
 * The local character moves immediately with the same physics as the server, so
 * keyboard/touch input has no network delay. The server stays the authority: if the
 * predicted position drifts far away (knockback, respawn, reconnect), it snaps back.
 */

import { CONSTANTS } from '@/shared/constants.js';
import { GameSnapshot } from '@/shared/protocol.js';
import { getPlayerBox, isBoxOverlappingTile, movePlayerWithPhysics } from '@/shared/engine/physics.js';
import { Bomb, FacingDirection, Player } from '@/shared/types.js';

const MIN_TOLERANCE_PX = 18; // ignore differences up to this (network delay while moving)
const CORRECTION = 0.15; // share of a larger difference removed per snapshot
const HARD_SNAP_PX = 96; // beyond this something really went wrong: jump to the server position

interface Local {
  id: string;
  x: number;
  y: number;
  kx: number;
  ky: number;
  facing: FacingDirection;
  walkSpeed: number;
  speedTimer: number;
  mass: number;
}

export class Prediction {
  private local: Local | null = null;
  private roundTripMs = 80;
  private knownBombs = new Set<string>();
  private passingBombs = new Set<string>(); // bombs we stand on: walkable until we leave them

  /** The measured ping: with a slower connection the server position naturally trails further behind. */
  public setRoundTrip(ms: number): void {
    this.roundTripMs = ms;
  }

  public reset(): void {
    this.local = null;
    this.knownBombs.clear();
    this.passingBombs.clear();
  }

  /** Called for every server snapshot. */
  public onSnapshot(snap: GameSnapshot, selfId: string): void {
    const server = snap.players.find((p) => p.id === selfId);
    if (!server) return;

    if (!this.local) {
      this.local = { id: selfId, x: server.x, y: server.y, kx: 0, ky: 0, facing: server.facing, walkSpeed: CONSTANTS.BASE_WALK_SPEED, speedTimer: 0, mass: 1 };
    }
    const local = this.local;
    local.speedTimer = snap.self.speedTimer;

    // Explosions and the storm push the player on the server: take over that velocity,
    // so the pushed movement is predicted too instead of arriving later as a jump
    if (Math.abs(snap.self.kx - local.kx) > 15 || Math.abs(snap.self.ky - local.ky) > 15) {
      local.kx = snap.self.kx;
      local.ky = snap.self.ky;
    }

    // While moving, we are ahead of the server by about speed x (round trip + a snapshot interval)
    const speed = local.walkSpeed * (snap.self.speedTimer > 0 ? CONSTANTS.SPEED_MULTIPLIER : 1);
    const tolerance = Math.max(MIN_TOLERANCE_PX, Math.min(70, speed * (this.roundTripMs / 1000 + 0.12) + 6));
    const error = Math.hypot(server.x - local.x, server.y - local.y);
    if (!server.alive || error > HARD_SNAP_PX) {
      local.x = server.x;
      local.y = server.y;
      local.kx = 0;
      local.ky = 0;
    } else if (error > tolerance) {
      // Small differences are normal (network delay); larger ones are eased out, never jumped
      local.x += (server.x - local.x) * CORRECTION;
      local.y += (server.y - local.y) * CORRECTION;
    }

    // Forget bombs that exploded
    const ids = new Set(snap.bombs.map((b) => b.id));
    for (const id of this.knownBombs) if (!ids.has(id)) this.knownBombs.delete(id);
    for (const id of this.passingBombs) if (!ids.has(id)) this.passingBombs.delete(id);
  }

  /** Moves the local character by one frame. */
  public step(dt: number, dx: number, dy: number, snap: GameSnapshot, tiles: number[], mapWidth: number, mapHeight: number): void {
    const local = this.local;
    if (!local) return;
    const me = snap.players.find((p) => p.id === local.id);
    const canMove = !!me?.alive && !snap.self.inQuiz && snap.countdown <= 0 && snap.status === 'playing';
    if (!canMove) return;

    const box = getPlayerBox(local.x, local.y);
    const bombs: Bomb[] = snap.bombs.map((b) => {
      // A bomb placed while we stand on it lets us walk off it, exactly like on the server
      if (!this.knownBombs.has(b.id)) {
        this.knownBombs.add(b.id);
        if (isBoxOverlappingTile(box, b.tileX, b.tileY)) this.passingBombs.add(b.id);
      }
      return {
        id: b.id,
        tileX: b.tileX,
        tileY: b.tileY,
        ownerId: b.ownerId,
        timer: b.timer,
        range: b.range,
        passers: this.passingBombs.has(b.id) ? [local.id] : [],
      };
    });

    const player = { ...local, playerNumber: 0 } as unknown as Player;
    movePlayerWithPhysics(player, dx, dy, dt, tiles, bombs, mapWidth, mapHeight);
    local.x = player.x;
    local.y = player.y;
    local.kx = player.kx;
    local.ky = player.ky;
    local.facing = player.facing;
  }

  public get(): Local | null {
    return this.local;
  }
}
