/**
 * Touch controls for phones and tablets: joystick (left) and a big bomb button (right).
 * Uses pointer events so joystick and bomb button work at the same time (two thumbs).
 */

import React, { useRef, useState } from 'react';
import { InputManager } from '../input/keyboard.js';
import { HU } from '../i18n/hu.js';
import { PixelIcon } from './PixelIcon.js';

interface Props {
  inputManager: InputManager;
}

const DEADZONE = 0.3;

export const VirtualControls: React.FC<Props> = ({ inputManager }) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    const radius = rect.width / 2;
    const clamped = Math.min(dist, radius * 0.6);
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    setKnob({ x: nx * clamped, y: ny * clamped });

    // 8-way digital movement with a dead zone in the middle
    if (dist < radius * 0.18) {
      inputManager.setVirtualJoystick(0, 0);
      return;
    }
    inputManager.setVirtualJoystick(Math.abs(nx) > DEADZONE ? Math.sign(nx) : 0, Math.abs(ny) > DEADZONE ? Math.sign(ny) : 0);
  };

  const release = () => {
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    inputManager.setVirtualJoystick(0, 0);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex select-none items-end justify-between p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        ref={baseRef}
        onPointerDown={(e) => {
          if (activePointer.current !== null) return;
          activePointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.pointerId === activePointer.current) update(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.pointerId === activePointer.current) release();
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === activePointer.current) release();
        }}
        className="pointer-events-auto relative flex h-[clamp(120px,24vmin,190px)] w-[clamp(120px,24vmin,190px)] touch-none items-center justify-center border-4 border-px-ink bg-px-dusk/70 shadow-[4px_4px_0_0_#000]"
      >
        <span className="pointer-events-none absolute left-1/2 top-1 h-2 w-2 -translate-x-1/2 bg-px-slate" />
        <span className="pointer-events-none absolute bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 bg-px-slate" />
        <span className="pointer-events-none absolute left-1 top-1/2 h-2 w-2 -translate-y-1/2 bg-px-slate" />
        <span className="pointer-events-none absolute right-1 top-1/2 h-2 w-2 -translate-y-1/2 bg-px-slate" />
        <div
          className="pointer-events-none h-1/3 w-1/3 border-4 border-px-ink bg-px-cyan shadow-[3px_3px_0_0_#000]"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>

      <div className="pointer-events-auto flex flex-col items-end gap-3">
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            inputManager.trigger('toggleMap');
          }}
          className="px-btn flex touch-none items-center gap-1.5 !px-2.5 !py-2 !text-[8px]"
          style={{ ['--btn' as string]: '#3b5dc9' }}
        >
          <PixelIcon name="map" size={12} /> {HU.mobile.map}
        </button>
        <div className="flex items-end gap-3">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              inputManager.trigger('placeWall');
            }}
            className="px-btn flex h-[clamp(64px,13vmin,100px)] w-[clamp(64px,13vmin,100px)] touch-none flex-col items-center justify-center gap-1 !p-1 !text-[8px]"
            style={{ ['--btn' as string]: '#41a6f6' }}
          >
            <PixelIcon name="wall" size={22} />
            {HU.mobile.wall}
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              inputManager.trigger('placeBomb');
            }}
            className="px-btn flex h-[clamp(84px,18vmin,140px)] w-[clamp(84px,18vmin,140px)] touch-none flex-col items-center justify-center gap-1.5 !p-1 !text-[9px] text-px-white"
            style={{ ['--btn' as string]: '#b13e53', color: '#f4f4f4' }}
          >
            <PixelIcon name="bomb" size={30} />
            {HU.mobile.bomb}
          </button>
        </div>
      </div>
    </div>
  );
};
