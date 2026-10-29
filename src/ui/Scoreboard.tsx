/**
 * Class leaderboard (points add up over the matches of a room) and the questions many players
 * got wrong. Shared by the end screen, the lobby and the projector view.
 */

import React from 'react';
import { HardQuestion, ScoreRow } from '@/shared/protocol.js';
import { HU } from '../i18n/hu.js';

interface ScoreboardProps {
  scores: ScoreRow[];
  gained?: Record<string, number>;
  highlightId?: string | null;
  limit?: number;
  large?: boolean; // projector sizes
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ scores, gained, highlightId, limit = 10, large }) => {
  const rows = scores.filter((r) => !r.isBot).slice(0, limit);
  if (rows.length === 0) return <p className="text-lg text-px-silver">{HU.scores.empty}</p>;
  return (
    <div className="w-full">
      <ol className={`px-inset flex flex-col gap-1 p-1.5 text-left ${large ? 'text-3xl' : 'text-xl'}`}>
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={`flex items-center gap-2 px-2 py-0.5 ${r.id === highlightId ? 'bg-px-navy' : 'bg-px-dusk'}`}
          >
            <span className="w-8 shrink-0 text-px-silver">{i + 1}.</span>
            <span className="h-3 w-3 shrink-0 border-2 border-px-white" style={{ backgroundColor: r.color }} />
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            {gained && gained[r.id] !== undefined && <span className="text-px-lime">{HU.scores.gained(gained[r.id])}</span>}
            <span className="w-14 shrink-0 text-right font-pixel text-[10px] text-px-yellow">{r.points}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-center text-base text-px-silver">{HU.scores.howPoints}</p>
    </div>
  );
};

export const HardQuestions: React.FC<{ questions: HardQuestion[]; large?: boolean }> = ({ questions, large }) => {
  if (questions.length === 0) return <p className="text-lg text-px-silver">{HU.scores.hardEmpty}</p>;
  return (
    <ul className={`flex flex-col gap-2 text-left ${large ? 'text-2xl' : 'text-lg'}`}>
      {questions.map((q) => (
        <li key={q.prompt} className="px-inset p-2">
          <p className="text-px-yellow">{q.prompt}</p>
          <p className="text-px-lime">
            {HU.scores.answerWas} {q.correctAnswer}
          </p>
          <p className="text-px-orange">{HU.scores.hardStat(q.correct, q.asked)}</p>
        </li>
      ))}
    </ul>
  );
};
