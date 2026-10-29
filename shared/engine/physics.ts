/**
 * Pure physics functions: knockback impulse, friction decay, wall bounce,
 * collision detection, and substep movement.
 */

import { CONSTANTS } from '../constants.js';
import { Bomb, Player, TileType } from '../types.js';
import { RNG } from './rng.js';

export interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function getPlayerBox(x: number, y: number, boxSize = CONSTANTS.PLAYER_BOX_SIZE_PX): Box {
  const half = boxSize / 2;
  return {
    minX: x - half,
    maxX: x + half,
    minY: y - half,
    maxY: y + half,
  };
}

export function isBoxOverlappingTile(box: Box, tileX: number, tileY: number, tileSize = CONSTANTS.TILE_SIZE_PX): boolean {
  const tileMinX = tileX * tileSize;
  const tileMaxX = tileMinX + tileSize;
  const tileMinY = tileY * tileSize;
  const tileMaxY = tileMinY + tileSize;

  return box.minX < tileMaxX && box.maxX > tileMinX && box.minY < tileMaxY && box.maxY > tileMinY;
}

export function isTileSolid(tile: number): boolean {
  return (
    tile === TileType.SOLID_WALL ||
    tile === TileType.BREAKABLE_BRICK ||
    tile === TileType.PLAYER_WALL ||
    tile === TileType.PLAYER_WALL_CRACKED
  );
}

/**
 * Checks if a bounding box collides with the map boundaries or any solid tile.
 */
export function isBoxCollidingWithMap(
  box: Box,
  tiles: number[],
  mapWidth: number = CONSTANTS.MAP_WIDTH_TILES,
  mapHeight: number = CONSTANTS.MAP_HEIGHT_TILES,
  tileSize: number = CONSTANTS.TILE_SIZE_PX
): boolean {
  if (box.minX < 0 || box.maxX > mapWidth * tileSize || box.minY < 0 || box.maxY > mapHeight * tileSize) {
    return true;
  }

  const startTileX = Math.max(0, Math.floor(box.minX / tileSize));
  const endTileX = Math.min(mapWidth - 1, Math.floor((box.maxX - 0.001) / tileSize));
  const startTileY = Math.max(0, Math.floor(box.minY / tileSize));
  const endTileY = Math.min(mapHeight - 1, Math.floor((box.maxY - 0.001) / tileSize));

  for (let ty = startTileY; ty <= endTileY; ty++) {
    for (let tx = startTileX; tx <= endTileX; tx++) {
      const tile = tiles[ty * mapWidth + tx];
      if (isTileSolid(tile)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a player box collides with any bomb that is solid to this player.
 */
export function isBoxCollidingWithBombs(box: Box, playerId: string, bombs: Bomb[], tileSize = CONSTANTS.TILE_SIZE_PX): boolean {
  for (const bomb of bombs) {
    if (bomb.passers.includes(playerId)) {
      continue; // Player is still allowed to walk out of this bomb
    }
    if (isBoxOverlappingTile(box, bomb.tileX, bomb.tileY, tileSize)) {
      return true;
    }
  }
  return false;
}

/**
 * Applies friction to knockback: knockback *= exp(-3 * dt).
 */
export function applyFriction(kx: number, ky: number, dt: number, decayRate = CONSTANTS.FRICTION_DECAY_RATE): { kx: number; ky: number } {
  const factor = Math.exp(-decayRate * dt);
  const nextKx = Math.abs(kx * factor) < 0.1 ? 0 : kx * factor;
  const nextKy = Math.abs(ky * factor) < 0.1 ? 0 : ky * factor;
  return { kx: nextKx, ky: nextKy };
}

/**
 * Calculates knockback impulse from bomb center to player.
 * Impulse formula: J = 100 * (1 - d / R) + 40
 * dv = J / mass
 */
export function computeExplosionKnockback(
  playerX: number,
  playerY: number,
  playerMass: number,
  bombTileX: number,
  bombTileY: number,
  rng: RNG,
  radiusPx = CONSTANTS.KNOCKBACK_RADIUS_PX
): { dvx: number; dvy: number; applied: boolean } {
  const bombCenterX = bombTileX * CONSTANTS.TILE_SIZE_PX + CONSTANTS.TILE_SIZE_PX / 2;
  const bombCenterY = bombTileY * CONSTANTS.TILE_SIZE_PX + CONSTANTS.TILE_SIZE_PX / 2;

  const dx = playerX - bombCenterX;
  const dy = playerY - bombCenterY;
  const d = Math.hypot(dx, dy);

  if (d > radiusPx) {
    return { dvx: 0, dvy: 0, applied: false };
  }

  let dirX: number;
  let dirY: number;

  if (d < 0.0001) {
    const angle = rng.next() * Math.PI * 2;
    dirX = Math.cos(angle);
    dirY = Math.sin(angle);
  } else {
    dirX = dx / d;
    dirY = dy / d;
  }

  const impulse = CONSTANTS.KNOCKBACK_MAX_EXTRA_IMPULSE * (1 - d / radiusPx) + CONSTANTS.KNOCKBACK_BASE_IMPULSE;
  const dv = impulse / Math.max(CONSTANTS.MASS_MIN, playerMass);

  return {
    dvx: dv * dirX,
    dvy: dv * dirY,
    applied: true,
  };
}

/**
 * Executes sub-stepped player movement with collision checking and wall bounce damping.
 * Maximum substep is 1 px to strictly avoid tunneling through walls.
 */
export function movePlayerWithPhysics(
  player: Player,
  inputDx: number,
  inputDy: number,
  dt: number,
  tiles: number[],
  bombs: Bomb[],
  mapWidth: number = CONSTANTS.MAP_WIDTH_TILES,
  mapHeight: number = CONSTANTS.MAP_HEIGHT_TILES
): void {
  // Apply friction decay to knockback first
  const decayed = applyFriction(player.kx, player.ky, dt);
  player.kx = decayed.kx;
  player.ky = decayed.ky;

  // Normalized walking direction
  let walkDirX = 0;
  let walkDirY = 0;
  if (inputDx !== 0 || inputDy !== 0) {
    const len = Math.hypot(inputDx, inputDy);
    walkDirX = inputDx / len;
    walkDirY = inputDy / len;

    if (Math.abs(walkDirX) > Math.abs(walkDirY)) {
      player.facing = walkDirX > 0 ? 'right' : 'left';
    } else if (walkDirY !== 0) {
      player.facing = walkDirY > 0 ? 'down' : 'up';
    }
  }

  const speed = player.speedTimer > 0 ? player.walkSpeed * CONSTANTS.SPEED_MULTIPLIER : player.walkSpeed;
  const walkVx = walkDirX * speed;
  const walkVy = walkDirY * speed;

  let totalVx = walkVx + player.kx;
  let totalVy = walkVy + player.ky;

  const totalDist = Math.hypot(totalVx, totalVy) * dt;
  const steps = Math.max(1, Math.ceil(totalDist / CONSTANTS.SUBSTEP_MAX_PX));
  const stepDt = dt / steps;

  for (let s = 0; s < steps; s++) {
    // 1. Move on X axis
    const stepX = (walkVx + player.kx) * stepDt;
    if (stepX !== 0) {
      const nextX = player.x + stepX;
      const testBoxX = getPlayerBox(nextX, player.y);

      const collidesMap = isBoxCollidingWithMap(testBoxX, tiles, mapWidth, mapHeight);
      const collidesBomb = isBoxCollidingWithBombs(testBoxX, player.id, bombs);

      if (collidesMap || collidesBomb) {
        // Wall bounce: flip and damp knockback on X axis
        player.kx *= CONSTANTS.WALL_BOUNCE_DAMPING;
      } else {
        player.x = nextX;
      }
    }

    // 2. Move on Y axis
    const stepY = (walkVy + player.ky) * stepDt;
    if (stepY !== 0) {
      const nextY = player.y + stepY;
      const testBoxY = getPlayerBox(player.x, nextY);

      const collidesMap = isBoxCollidingWithMap(testBoxY, tiles, mapWidth, mapHeight);
      const collidesBomb = isBoxCollidingWithBombs(testBoxY, player.id, bombs);

      if (collidesMap || collidesBomb) {
        // Wall bounce: flip and damp knockback on Y axis
        player.ky *= CONSTANTS.WALL_BOUNCE_DAMPING;
      } else {
        player.y = nextY;
      }
    }
  }
}

/**
 * Recomputes the passers list for every bomb based on current player bounding box overlap.
 * Once a player leaves the bomb tile, they can never re-enter it (it becomes solid).
 */
export function updateBombPassers(bombs: Bomb[], players: Record<string, Player>): void {
  for (const bomb of bombs) {
    if (bomb.passers.length === 0) continue;

    bomb.passers = bomb.passers.filter((playerId) => {
      const player = players[playerId];
      if (!player || !player.alive) return false;
      const box = getPlayerBox(player.x, player.y);
      return isBoxOverlappingTile(box, bomb.tileX, bomb.tileY);
    });
  }
}
