/**
 * Physics question shown while the player stands on a question mark.
 * After answering, the modal stays open and shows the feedback:
 *   - the chosen answer is green if right, red if wrong,
 *   - only after a wrong answer is the correct option highlighted in green.
 * If the time runs out, nothing is revealed.
 */

import React, { useEffect, useRef, useState } from 'react';
import { SnapshotSelfData } from '@/shared/protocol.js';
import { HU } from '../i18n/hu.js';
import { PixelIcon } from './PixelIcon.js';

interface QuizModalProps {
  self: SnapshotSelfData;
  onAnswer: (answerIndex: number) => void;
}

interface Question {
  prompt: string;
  topic: string;
  options: [string, string, string];
}

interface Feedback {
  chosen: number | null; // null = time ran out
  question: Question;
  seqAtClick: number;
}

const ANSWER_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'];

export const QuizModal: React.FC<QuizModalProps> = ({ self, onAnswer }) => {
  const inQuiz = self.inQuiz && self.quizPrompt !== null && self.quizOptions !== null;
  const current = useRef<Question | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const wasInQuiz = useRef(false);

  // Remember the question while it is open, so the feedback can still show it afterwards
  if (inQuiz) {
    current.current = { prompt: self.quizPrompt!, topic: self.quizTopic ?? '', options: self.quizOptions! };
  }

  // A new question clears the old feedback; a question that ended without an answer shows the timeout
  useEffect(() => {
    if (inQuiz && !wasInQuiz.current) setFeedback(null);
    if (!inQuiz && wasInQuiz.current && current.current) {
      setFeedback((f) => f ?? { chosen: null, question: current.current!, seqAtClick: -1 });
    }
    wasInQuiz.current = inQuiz;
  }, [inQuiz]);

  const submit = (index: number) => {
    if (!inQuiz || feedback) return;
    setFeedback({ chosen: index, question: current.current!, seqAtClick: self.quizResult?.seq ?? 0 });
    onAnswer(index);
  };

  useEffect(() => {
    if (!inQuiz) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ANSWER_KEYS.indexOf(e.code);
      if (!e.repeat && i >= 0) submit(i % 3);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const result = self.quizResult;
  const resultReady =
    feedback !== null && (feedback.chosen === null || (result !== null && result.seq > feedback.seqAtClick));

  if (inQuiz && !feedback) {
    const seconds = Math.max(0, Math.ceil(self.quizTimer));
    return (
      <div className="px-backdrop fixed inset-0 z-50 flex items-center justify-center p-3">
        <div className="px-panel flex max-h-[96dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto p-4">
          <div className="flex items-center justify-between gap-2 border-b-4 border-px-ink pb-2">
            <div className="min-w-0">
              <h2 className="px-title flex items-center gap-2 text-xs text-px-yellow">
                <PixelIcon name="question" size={16} /> {HU.quiz.title}
              </h2>
              <p className="mt-1 truncate text-lg text-px-silver">{self.quizTopic}</p>
            </div>
            <span className={`flex shrink-0 items-center gap-1.5 border-4 border-px-ink px-2 py-1 font-pixel text-[10px] ${seconds <= 5 ? 'animate-pulse bg-px-red text-px-white' : 'bg-px-navy text-px-cyan'}`}>
              <PixelIcon name="clock" size={12} /> {HU.quiz.timeLeft(seconds)}
            </span>
          </div>

          <p className="px-inset p-3 text-2xl leading-tight text-px-yellow">{self.quizPrompt}</p>

          <div className="flex flex-col gap-2.5">
            <p className="text-lg text-px-silver">{HU.quiz.instruction}</p>
            {self.quizOptions!.map((option, i) => (
              <OptionButton key={i} index={i} text={option} onClick={() => submit(i)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!feedback) return null;

  // Feedback view: waiting for the server's answer result
  if (!resultReady) {
    return (
      <div className="px-backdrop fixed inset-0 z-50 flex items-center justify-center p-3">
        <div className="px-panel p-4 text-xl text-px-silver">{HU.quiz.title}...</div>
      </div>
    );
  }

  const q = feedback.question;
  const timedOut = feedback.chosen === null;
  const correct = !timedOut && result !== null && result.correct;
  const correctText = result?.correctAnswer ?? '';
  const correctIndex = q.options.indexOf(correctText);
  const reward = result?.reward ? HU.powerUps[result.reward] : null;

  const title = correct ? HU.quiz.correct : timedOut ? HU.quiz.timedOut : HU.quiz.wrong;
  const titleColor = correct ? 'text-px-lime' : 'text-px-orange';

  return (
    <div className="px-backdrop fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="px-panel flex max-h-[96dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto p-4">
        <h2 className={`px-title flex items-center gap-2 text-sm ${titleColor}`}>
          <PixelIcon name={correct ? 'check' : 'cross'} size={16} /> {title}
        </h2>

        <p className="px-inset p-3 text-2xl leading-tight text-px-yellow">{q.prompt}</p>

        <div className="flex flex-col gap-2.5">
          {q.options.map((option, i) => {
            const isChosen = feedback.chosen === i;
            const isCorrect = !timedOut && i === correctIndex;
            let tone: 'green' | 'red' | 'plain' = 'plain';
            if (isCorrect) tone = 'green';
            else if (isChosen && !correct) tone = 'red';
            return <OptionButton key={i} index={i} text={option} tone={tone} disabled />;
          })}
        </div>

        {reward ? (
          <p className="flex flex-wrap items-center gap-2 text-2xl text-px-yellow">
            {HU.quiz.reward} <PixelIcon name={reward.icon} size={20} /> {reward.name}!
          </p>
        ) : (
          !timedOut && <p className="text-xl text-px-silver">{HU.quiz.noReward}</p>
        )}

        {!timedOut && result && (
          <p className="flex gap-2 text-xl leading-tight text-px-white">
            <PixelIcon name="bulb" size={16} className="mt-0.5 text-px-yellow" /> <span>{result.explanation}</span>
          </p>
        )}

        <button
          onClick={() => setFeedback(null)}
          className="px-btn flex items-center justify-center gap-2 !py-3 !text-[10px]"
          style={{ ['--btn' as string]: '#38b764' }}
        >
          {HU.quiz.continueBtn}
        </button>
      </div>
    </div>
  );
};

const TONE_CLASS = {
  plain: 'bg-px-slate text-px-white',
  green: 'bg-px-green text-px-ink',
  red: 'bg-px-red text-px-white',
} as const;

const OptionButton: React.FC<{
  index: number;
  text: string;
  tone?: keyof typeof TONE_CLASS;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ index, text, tone = 'plain', disabled = false, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-start gap-3 border-4 border-px-ink p-2.5 text-left shadow-[4px_4px_0_0_#000] ${TONE_CLASS[tone]} ${
      disabled ? '' : 'active:translate-x-[3px] active:translate-y-[3px] active:bg-px-blue active:shadow-none md:hover:bg-px-blue'
    }`}
  >
    <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-px-yellow font-pixel text-xs text-px-ink">{index + 1}</span>
    <span className="pt-0.5 font-body text-2xl leading-tight">{text}</span>
  </button>
);
