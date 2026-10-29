/**
 * Short rules, shown in the lobby, in the pre-game countdown and in the help overlay.
 */

import React from 'react';
import { HU } from '../i18n/hu.js';
import { PixelIcon } from './PixelIcon.js';
import { useIsTouch } from './useIsTouch.js';

export const HowToPlay: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const isTouch = useIsTouch();
  return (
    <div className="flex flex-col gap-2 text-left">
      <h2 className="px-title text-xs text-px-yellow">{HU.howToTitle}</h2>
      <ul className="flex flex-col gap-1.5">
        {HU.howTo.map((item) => (
          <li key={item.icon + item.text.slice(0, 6)} className={`flex gap-2 text-px-white ${compact ? 'text-lg' : 'text-xl'}`}>
            <PixelIcon name={item.icon} size={compact ? 18 : 20} className="mt-0.5 text-px-cyan" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      <p className="px-inset mt-1 px-2 py-1.5 font-pixel text-[8px] leading-relaxed text-px-cyan">
        {isTouch ? HU.controlsTouch : HU.controlsDesktop}
      </p>
    </div>
  );
};
