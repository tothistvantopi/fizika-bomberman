/**
 * 2D Camera logic centered on the local player and clamped to map boundaries.
 */

import { CONSTANTS } from '@/shared/constants.js';

export interface Camera {
  x: number; // top-left world x in px
  y: number; // top-left world y in px
  width: number;
  height: number;
}

export function createCamera(): Camera {
  return {
    x: 0,
    y: 0,
    width: CONSTANTS.LOGICAL_WIDTH_PX,
    height: CONSTANTS.LOGICAL_HEIGHT_PX,
  };
}

export function updateCamera(camera: Camera, targetX: number, targetY: number): void {
  const halfW = camera.width / 2;
  const halfH = camera.height / 2;

  const desiredX = targetX - halfW;
  const desiredY = targetY - halfH;

  const maxX = CONSTANTS.WORLD_WIDTH_PX - camera.width;
  const maxY = CONSTANTS.WORLD_HEIGHT_PX - camera.height;

  camera.x = Math.max(0, Math.min(maxX, desiredX));
  camera.y = Math.max(0, Math.min(maxY, desiredY));
}
