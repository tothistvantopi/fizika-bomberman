/**
 * Smooth rendering of other players from 20 Hz server snapshots.
 *
 * Every snapshot is stored with its server tick. Players are drawn slightly in the past
 * (INTERPOLATION_DELAY_TICKS) and positions are interpolated between two stored snapshots,
 * so irregular packet arrival on a busy Wi-Fi does not show up as stuttering.
 */

import { CONSTANTS } from '@/shared/constants.js';
import { SnapshotPlayer } from '@/shared/protocol.js';

const INTERPOLATION_DELAY_TICKS = 3; // 150 ms behind the newest snapshot
const GLIDE_RATE = 25; // per second: how fast the drawn position follows the interpolated one
const MAX_SAMPLES = 30;

interface Sample {
  tick: number;
  x: number;
  y: number;
}

export interface InterpolatedPlayer extends SnapshotPlayer {
  targetX: number; // newest known position
  targetY: number;
}

interface Entry {
  player: InterpolatedPlayer;
  samples: Sample[];
}

export class InterpolationManager {
  private entries = new Map<string, Entry>();
  private latestTick = 0;
  private renderTick = 0;
  private started = false;

  public updateFromSnapshot(snapshotPlayers: SnapshotPlayer[], tick: number): void {
    if (tick < this.latestTick) this.clear(); // a new game started
    this.latestTick = tick;

    const seen = new Set<string>();
    for (const sp of snapshotPlayers) {
      seen.add(sp.id);
      let entry = this.entries.get(sp.id);
      if (!entry) {
        entry = { player: { ...sp, targetX: sp.x, targetY: sp.y }, samples: [] };
        this.entries.set(sp.id, entry);
      }
      const { x, y } = entry.player; // keep the rendered position, take everything else from the snapshot
      Object.assign(entry.player, sp);
      entry.player.x = entry.samples.length > 0 ? x : sp.x;
      entry.player.y = entry.samples.length > 0 ? y : sp.y;
      entry.player.targetX = sp.x;
      entry.player.targetY = sp.y;

      entry.samples.push({ tick, x: sp.x, y: sp.y });
      if (entry.samples.length > MAX_SAMPLES) entry.samples.shift();
    }
    for (const id of this.entries.keys()) {
      if (!seen.has(id)) this.entries.delete(id);
    }
  }

  /** Advances the render clock and places every player. */
  public step(dt: number): void {
    const target = this.latestTick - INTERPOLATION_DELAY_TICKS;
    if (!this.started) {
      this.renderTick = target;
      this.started = true;
    }
    // Run at the server tick rate, gently speeding up or slowing down to stay near the target delay
    const correction = Math.max(-0.4, Math.min(0.4, (target - this.renderTick) * 0.15));
    this.renderTick += dt * CONSTANTS.SERVER_TICK_RATE * (1 + correction);
    if (Math.abs(target - this.renderTick) > 6) this.renderTick = target; // after a stall: resync

    const glide = Math.min(1, dt * GLIDE_RATE);
    for (const { player, samples } of this.entries.values()) {
      if (samples.length === 0) continue;
      const first = samples[0];
      const last = samples[samples.length - 1];
      let x: number;
      let y: number;
      if (this.renderTick <= first.tick) {
        x = first.x;
        y = first.y;
      } else if (this.renderTick >= last.tick) {
        x = last.x;
        y = last.y;
      } else {
        let i = samples.length - 2;
        while (i > 0 && samples[i].tick > this.renderTick) i--;
        const a = samples[i];
        const b = samples[i + 1];
        const f = (this.renderTick - a.tick) / (b.tick - a.tick || 1);
        x = a.x + (b.x - a.x) * f;
        y = a.y + (b.y - a.y) * f;
      }
      // A late packet would make the player jump; gliding to the new spot hides that
      player.x += (x - player.x) * glide;
      player.y += (y - player.y) * glide;
    }
  }

  public get(id: string): InterpolatedPlayer | undefined {
    return this.entries.get(id)?.player;
  }

  public getAll(): InterpolatedPlayer[] {
    return Array.from(this.entries.values(), (e) => e.player);
  }

  public clear(): void {
    this.entries.clear();
    this.started = false;
    this.latestTick = 0;
  }
}
