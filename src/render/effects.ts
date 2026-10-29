/**
 * Visual effects that are not part of the game state: sparks and dust when bombs explode, debris
 * from broken bricks, a little ghost when a player is knocked out and the screen shake.
 * They are created by comparing consecutive snapshots, so the server needs to know nothing about them.
 */

import { CONSTANTS } from '@/shared/constants.js';
import { GameSnapshot } from '@/shared/protocol.js';
import { TileType } from '@/shared/types.js';
import { drawPlayer } from './sprites.js';

const TILE = CONSTANTS.TILE_SIZE_PX;
const MAX_PARTICLES = 320;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity: number;
  grow: number; // size change per second (dust puffs expand)
  alpha: boolean;
}

interface Ghost {
  x: number;
  y: number;
  age: number;
  color: string;
}

const SPARK_COLORS = ['#ffcd75', '#ef7d57', '#f4f4f4', '#b13e53'];
const DUST_COLORS = ['#94b0c2', '#566c86', '#c8b9a6'];
const DEBRIS_COLORS = ['#b13e53', '#ef7d57', '#5d275d'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Effects {
  private particles: Particle[] = [];
  private ghosts: Ghost[] = [];
  private seenExplosions = new Set<string>();
  private lastTiles: number[] | null = null;
  private lastAlive = new Map<string, boolean>();
  private lastSelfHurt = false;
  private shakeAmount = 0;
  shakeX = 0;
  shakeY = 0;

  reset(): void {
    this.particles = [];
    this.ghosts = [];
    this.seenExplosions.clear();
    this.lastTiles = null;
    this.lastAlive.clear();
    this.lastSelfHurt = false;
    this.shakeAmount = 0;
  }

  private add(p: Partial<Particle> & Pick<Particle, 'x' | 'y' | 'color' | 'life'>): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ vx: 0, vy: 0, size: 1, gravity: 0, grow: 0, alpha: false, max: p.life, ...p });
  }

  /** Looks at a new snapshot and starts the matching effects. */
  onSnapshot(snapshot: GameSnapshot, tiles: number[], selfId: string | null): void {
    const me = selfId ? snapshot.players.find((p) => p.id === selfId) : undefined;

    // New explosion cells: sparks, dust and (near the player) a screen shake
    const current = new Set<string>();
    for (const e of snapshot.explosions) {
      const key = `${e.tileX},${e.tileY}`;
      current.add(key);
      if (this.seenExplosions.has(key)) continue;
      const cx = e.tileX * TILE + TILE / 2;
      const cy = e.tileY * TILE + TILE / 2;
      for (let i = 0; i < 3; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(25, 70);
        this.add({
          x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 15,
          life: rand(0.25, 0.55), size: Math.random() < 0.3 ? 2 : 1,
          color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)], gravity: 90,
        });
      }
      this.add({
        x: cx + rand(-4, 4), y: cy + rand(-4, 4), vx: rand(-8, 8), vy: rand(-14, -4),
        life: rand(0.5, 0.8), size: 3, grow: 5, alpha: true,
        color: DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)],
      });
      if (me) {
        const dist = Math.hypot(me.x - cx, me.y - cy) / TILE;
        if (dist < 7) this.shakeAmount = Math.max(this.shakeAmount, 1.2 + (7 - dist) * 0.15);
      }
    }
    this.seenExplosions = current;

    // Bricks that disappeared: little red chunks
    if (this.lastTiles && this.lastTiles !== tiles && this.lastTiles.length === tiles.length) {
      const width = CONSTANTS.MAP_WIDTH_TILES;
      for (let i = 0; i < tiles.length; i++) {
        const before = this.lastTiles[i];
        if (before === tiles[i]) continue;
        if (before === TileType.BREAKABLE_BRICK && tiles[i] === TileType.EMPTY) this.debris(i, width, 6);
        else if ((before === TileType.PLAYER_WALL || before === TileType.PLAYER_WALL_CRACKED) && tiles[i] === TileType.EMPTY) this.debris(i, width, 6, '#41a6f6');
      }
    }
    this.lastTiles = tiles;

    // A player who was alive and no longer is: ghost and stars
    for (const p of snapshot.players) {
      const was = this.lastAlive.get(p.id);
      if (was === true && !p.alive) {
        this.ghosts.push({ x: p.x, y: p.y, age: 0, color: p.color });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this.add({ x: p.x, y: p.y - 2, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 10, life: 0.7, size: 2, color: '#ffcd75', gravity: 20 });
        }
        if (me && Math.hypot(me.x - p.x, me.y - p.y) / TILE < 8) this.shakeAmount = Math.max(this.shakeAmount, 2.2);
      }
      this.lastAlive.set(p.id, p.alive);
    }

    // We just lost a life
    if (me) {
      if (me.hurt && !this.lastSelfHurt) this.shakeAmount = Math.max(this.shakeAmount, 3);
      this.lastSelfHurt = me.hurt;
    }
  }

  private debris(tileIndex: number, width: number, count: number, color?: string): void {
    const cx = (tileIndex % width) * TILE + TILE / 2;
    const cy = Math.floor(tileIndex / width) * TILE + TILE / 2;
    for (let i = 0; i < count; i++) {
      this.add({
        x: cx + rand(-5, 5), y: cy + rand(-5, 5), vx: rand(-40, 40), vy: rand(-55, -10),
        life: rand(0.4, 0.8), size: Math.random() < 0.5 ? 2 : 1, gravity: 160,
        color: color ?? DEBRIS_COLORS[Math.floor(Math.random() * DEBRIS_COLORS.length)],
      });
    }
  }

  /** A small burst on the player who just picked up a power-up. */
  burst(x: number, y: number, color: string): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.add({ x, y: y - 2, vx: Math.cos(a) * 28, vy: Math.sin(a) * 28 - 12, life: 0.6, size: 1, color, gravity: 25 });
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const g of this.ghosts) g.age += dt;
    this.ghosts = this.ghosts.filter((g) => g.age < 1.1);

    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 7);
    if (this.shakeAmount > 0.2) {
      this.shakeX = Math.round(rand(-1, 1) * this.shakeAmount);
      this.shakeY = Math.round(rand(-1, 1) * this.shakeAmount);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  /** Drawn in world coordinates, above the players. */
  draw(ctx: CanvasRenderingContext2D, time: number): void {
    for (const g of this.ghosts) {
      const t = g.age / 1.1;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.7;
      drawPlayer(ctx, g.x, g.y - t * 22, 'down', g.color, { invulnerable: false, fast: false, inQuiz: false, moving: false }, time);
      ctx.restore();
    }
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = p.alpha ? a * 0.6 : 1;
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size));
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
  }
}
