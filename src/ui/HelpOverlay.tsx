/**
 * Help overlay (P / ?): rules, controls and sound switch.
 */

import React, { useEffect } from 'react';
import { HU } from '../i18n/hu.js';
import { HowToPlay } from './HowToPlay.js';
import { PixelIcon } from './PixelIcon.js';

interface Props {
  isMuted: boolean;
  onToggleMute: () => void;
  musicOn: boolean;
  onToggleMusic: () => void;
  onClose: () => void;
}

export const HelpOverlay: React.FC<Props> = ({ isMuted, onToggleMute, musicOn, onToggleMusic, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyP' || e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="px-backdrop fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="px-panel flex max-h-[96dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="px-title text-sm text-px-yellow">{HU.help.title}</h2>
          <button onClick={onClose} className="px-btn !px-3 !py-1.5 !text-[9px]" style={{ ['--btn' as string]: '#b13e53' }}>{HU.help.close}</button>
        </div>
        <HowToPlay compact />
        <button onClick={onToggleMute} className="px-btn flex items-center justify-center gap-2 !text-[9px]" style={{ ['--btn' as string]: isMuted ? '#b13e53' : '#38b764' }}>
          <PixelIcon name={isMuted ? 'mute' : 'sound'} size={14} /> {isMuted ? HU.help.unmute : HU.help.mute}
        </button>
        <button onClick={onToggleMusic} className="px-btn flex items-center justify-center gap-2 !text-[9px]" style={{ ['--btn' as string]: musicOn ? '#38b764' : '#566c86' }}>
          <PixelIcon name="sound" size={14} /> {musicOn ? HU.help.musicOn : HU.help.musicOff}
        </button>
      </div>
    </div>
  );
};
