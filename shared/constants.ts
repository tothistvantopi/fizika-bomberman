/**
 * Tunable constants for "Fizika Bomberman" (free-for-all physics battle).
 * Big 41x31 arena, shrinking safe zone, max 5-minute matches.
 */

export const CONSTANTS = {
  // Arena (odd sizes so the classic pillar grid fits)
  MAP_WIDTH_TILES: 41,
  MAP_HEIGHT_TILES: 31,
  TILE_SIZE_PX: 16,
  WORLD_WIDTH_PX: 41 * 16,
  WORLD_HEIGHT_PX: 31 * 16,

  // Camera viewport
  VIEWPORT_TILES_X: 19,
  VIEWPORT_TILES_Y: 15,
  LOGICAL_WIDTH_PX: 304, // 19 * 16
  LOGICAL_HEIGHT_PX: 240, // 15 * 16

  // Players
  PLAYER_BOX_SIZE_PX: 10,
  BASE_WALK_SPEED: 48, // px/s
  MASS_MIN: 0.5,
  MASS_MIN_VARIATION: 0.8,
  MASS_MAX_VARIATION: 1.4,
  PLAYER_LIVES: 3,
  HIT_PROTECTION_SECONDS: 2.0, // protection (blinking) after losing a life
  FEED_VISIBLE_SECONDS: 8, // how long a hit/knock-out message stays on screen
  BASE_MAX_BOMBS: 1,
  BASE_BOMB_RANGE: 2,

  // Physics
  SUBSTEP_MAX_PX: 1.0,
  FRICTION_DECAY_RATE: 3.0, // k *= exp(-3 * dt)
  WALL_BOUNCE_DAMPING: -0.4,
  KNOCKBACK_RADIUS_PX: 32,
  KNOCKBACK_BASE_IMPULSE: 40,
  KNOCKBACK_MAX_EXTRA_IMPULSE: 100, // J = 100 * (1 - d/R) + 40

  // Bombs
  BOMB_FUSE_SECONDS: 2.0,
  BOMB_FLASH_SECONDS: 0.6,
  EXPLOSION_DURATION_SECONDS: 0.5,
  SELF_BOMB_IMMUNITY: true, // your own explosion never hurts you

  // Arena content
  BRICK_DENSITY: 0.2, // few bricks: the arena is open
  PILLAR_SPACING: 4, // fixed steel pillars only every 4th tile
  INITIAL_QUESTION_TILES: 14, // question marks are rare: a quiz is an event
  MAX_QUESTION_TILES: 9,
  QUESTION_RESPAWN_SECONDS: 12.0,
  BRICK_DROP_QUESTION_CHANCE: 0.06,

  // Walls players can build (they withstand one explosion)
  WALL_START_STOCK: 3,
  WALL_MAX_STOCK: 3,
  WALL_REGEN_SECONDS: 12,
  WALL_COOLDOWN_SECONDS: 0.4,

  // Question power-ups
  QUIZ_TIME_SECONDS: 20,
  QUIZ_GRACE_SECONDS: 1.5, // protection right after a quiz ends
  INVULNERABLE_SECONDS: 30,
  SPEED_SECONDS: 30,
  SPEED_MULTIPLIER: 1.7,
  BIG_BLAST_SECONDS: 30,
  BIG_BLAST_RANGE: 8,
  INFINITE_BOMBS_SECONDS: 10,

  // Match
  MIN_PLAYERS_TO_START: 2,
  MAX_PLAYERS: 15,
  START_COUNTDOWN_SECONDS: 10,
  MAX_MATCH_DURATION_SECONDS: 300, // 5 minutes

  // Shrinking safe zone (inclusive tile bounds of the final zone)
  SHRINK_INITIAL_DELAY_SECONDS: 25.0,
  SHRINK_INTERVAL_SECONDS: 12.0,
  SHRINK_WARNING_SECONDS: 5.0,
  FINAL_SAFE_ZONE_MIN_X: 18,
  FINAL_SAFE_ZONE_MAX_X: 22,
  FINAL_SAFE_ZONE_MIN_Y: 13,
  FINAL_SAFE_ZONE_MAX_Y: 17,
  ZONE_DAMAGE_INTERVAL_SECONDS: 1.0,

  // Tick & network
  SERVER_TICK_RATE: 20,
  SERVER_TICK_DT: 0.05,
  MAX_CLIENT_INPUT_RATE: 60, // input messages per second per client
} as const;

export type ConstantsType = typeof CONSTANTS;
