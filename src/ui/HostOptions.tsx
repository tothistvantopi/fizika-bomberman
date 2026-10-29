/**
 * What the teacher can set before a match: the arena theme and which question topics may appear.
 */

import React from 'react';
import { RoomOptions, ThemeChoice } from '@/shared/protocol.js';
import { QUESTION_CATEGORIES } from '@/shared/data/questions.js';
import { HU } from '../i18n/hu.js';

interface Props {
  options: RoomOptions;
  onChange: (change: { theme?: ThemeChoice; categories?: string[] }) => void;
}

const THEMES: ThemeChoice[] = ['random', 'lab', 'space', 'forest'];

export const HostOptions: React.FC<Props> = ({ options, onChange }) => {
  const all = options.categories.length === 0;
  const toggle = (id: string) => {
    const current = all ? QUESTION_CATEGORIES.map((c) => c.id) : options.categories;
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    // Never leave zero topics: "none" means "all"
    onChange({ categories: next.length === QUESTION_CATEGORIES.length ? [] : next });
  };
  const selected = (id: string) => all || options.categories.includes(id);

  return (
    <div className="px-inset flex flex-col gap-2 p-2.5">
      <span className="text-xl text-px-silver">{HU.lobby.optionsTitle}</span>
      <div className="flex flex-col gap-1.5">
        <span className="text-lg text-px-silver">{HU.lobby.themeLabel}</span>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => onChange({ theme: t })}
              className="px-btn flex-1 !px-1 !py-2 !text-[8px]"
              style={{ ['--btn' as string]: options.theme === t ? '#ffcd75' : '#566c86' }}
            >
              {HU.lobby.themes[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-lg text-px-silver">{HU.lobby.topicsLabel}</span>
        <div className="flex flex-wrap gap-1.5">
          {QUESTION_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className="px-btn !px-2 !py-1.5 !text-[8px] normal-case"
              style={{ ['--btn' as string]: selected(c.id) ? '#38b764' : '#566c86' }}
              aria-pressed={selected(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
