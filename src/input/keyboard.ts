/**
 * Keyboard and touch input: held directions plus one-shot actions.
 * One-shot presses stay pending until the network loop collects them,
 * so a quick key tap is never lost between two network sends.
 */

export interface InputState {
  dx: number;
  dy: number;
  placeBomb: boolean;
  placeWall: boolean;
  toggleMap: boolean;
  toggleHelp: boolean;
  toggleMute: boolean;
}

type OneShot = 'placeBomb' | 'placeWall' | 'toggleMap' | 'toggleHelp' | 'toggleMute';

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyB', 'KeyF', 'KeyQ', 'KeyP', 'KeyM',
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
]);

export class InputManager {
  private heldKeys = new Set<string>();
  private tappedKeys = new Set<string>(); // pressed and released between two polls: still counts once
  private pending: Record<OneShot, boolean> = { placeBomb: false, placeWall: false, toggleMap: false, toggleHelp: false, toggleMute: false };
  private touchDx = 0;
  private touchDy = 0;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  public destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return; // typing a name

    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (this.heldKeys.has(e.code)) return;
    this.heldKeys.add(e.code);
    this.tappedKeys.add(e.code);

    if (e.code === 'Space' || e.code === 'KeyB') this.pending.placeBomb = true;
    else if (e.code === 'KeyF') this.pending.placeWall = true;
    else if (e.code === 'KeyQ') this.pending.toggleMap = true;
    else if (e.code === 'KeyP') this.pending.toggleHelp = true;
    else if (e.code === 'KeyM') this.pending.toggleMute = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
  };

  // Releasing keys while the tab is in the background would leave the character running
  private onBlur = () => {
    this.heldKeys.clear();
  };

  public setVirtualJoystick(dx: number, dy: number) {
    this.touchDx = dx;
    this.touchDy = dy;
  }

  public trigger(action: OneShot) {
    this.pending[action] = true;
  }

  /** Current direction (keyboard or joystick). */
  public direction(): { dx: number; dy: number } {
    if (this.touchDx !== 0 || this.touchDy !== 0) return { dx: this.touchDx, dy: this.touchDy };
    const down = (code: string) => this.heldKeys.has(code) || this.tappedKeys.has(code);
    let dx = 0;
    let dy = 0;
    if (down('ArrowLeft') || down('KeyA')) dx -= 1;
    if (down('ArrowRight') || down('KeyD')) dx += 1;
    if (down('ArrowUp') || down('KeyW')) dy -= 1;
    if (down('ArrowDown') || down('KeyS')) dy += 1;
    return { dx, dy };
  }

  /** Returns and clears the pending one-shot actions. */
  public consume(): InputState {
    const { dx, dy } = this.direction();
    const state: InputState = { dx, dy, ...this.pending };
    this.tappedKeys.clear();
    this.pending = { placeBomb: false, placeWall: false, toggleMap: false, toggleHelp: false, toggleMute: false };
    return state;
  }
}
