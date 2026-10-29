import { describe, expect, it } from 'vitest';
import { CONSTANTS } from '../shared/constants.js';
import { applyAction, createGame, step } from '../shared/engine/index.js';
import { createRNG } from '../shared/engine/rng.js';
import { GameState, PlayerInput } from '../shared/types.js';
import { BotLevel, buildWorld, createBotBrain, thinkBot } from './bots.js';

/** Plays a whole match with computer players only and reports what happened. */
function simulate(level: BotLevel, count: number, seed: number) {
  const rng = createRNG(seed);
  const state: GameState = createGame(
    { seed, players: Array.from({ length: count }, (_, i) => ({ id: `bot_${i + 1}`, name: `Bot${i + 1}`, color: '#ff0000', playerNumber: i + 1 })) },
    rng
  );
  const brains = Object.fromEntries(Object.keys(state.players).map((id) => [id, createBotBrain(level)]));
  const held: Record<string, PlayerInput> = {};
  let quizzes = 0;
  let correct = 0;
  let steps = 0;

  while (!state.win.over && steps < 20 * 320) {
    const world = buildWorld(state);
    const inputs: Record<string, PlayerInput> = {};
    for (const p of Object.values(state.players)) {
      if (!p.alive) continue;
      const wasInQuiz = p.inQuiz;
      const action = thinkBot(world, p, brains[p.id]);
      if (action.answer !== null) {
        applyAction(state, p.id, { type: 'quiz_answer', answerIndex: action.answer }, rng);
        quizzes++;
        if (p.lastQuizResult?.correct) correct++;
        continue;
      }
      void wasInQuiz;
      held[p.id] = { dx: action.dx, dy: action.dy };
      inputs[p.id] = { dx: action.dx, dy: action.dy, placeBomb: action.placeBomb, placeWall: action.placeWall };
    }
    step(state, inputs, CONSTANTS.SERVER_TICK_DT, rng);
    steps++;
  }

  const players = Object.values(state.players);
  return {
    state,
    seconds: state.matchTime,
    stormDeaths: players.filter((p) => p.diedFromStorm).length,
    bombDeaths: players.filter((p) => !p.alive && !p.diedFromStorm).length,
    hits: state.feedCounter,
    totalKills: players.reduce((s, p) => s + p.kills, 0),
    quizzes,
    correct,
    walls: 0,
  };
}

/** One passive player standing still against bots: how long does he survive? */
function huntIdle(level: BotLevel, bots: number, seed: number): number {
  const rng = createRNG(seed);
  const players = [{ id: 'human', name: 'Idle', color: '#ffffff', playerNumber: 1 }];
  for (let i = 0; i < bots; i++) players.push({ id: `bot_${i + 2}`, name: `Bot${i + 2}`, color: '#ff0000', playerNumber: i + 2 });
  const state = createGame({ seed, players }, rng);
  const brains = Object.fromEntries(players.filter((p) => p.id !== 'human').map((p) => [p.id, createBotBrain(level)]));

  for (let steps = 0; steps < 20 * 300 && state.players.human.alive; steps++) {
    const world = buildWorld(state);
    const inputs: Record<string, PlayerInput> = {};
    for (const p of Object.values(state.players)) {
      if (!p.alive || !brains[p.id]) continue;
      const action = thinkBot(world, p, brains[p.id]);
      if (action.answer !== null) {
        applyAction(state, p.id, { type: 'quiz_answer', answerIndex: action.answer }, rng);
        continue;
      }
      inputs[p.id] = { dx: action.dx, dy: action.dy, placeBomb: action.placeBomb, placeWall: action.placeWall };
    }
    step(state, inputs, CONSTANTS.SERVER_TICK_DT, rng);
  }
  return state.players.human.alive ? Infinity : state.players.human.deathTime ?? Infinity;
}

describe('Computer players', () => {
  it('play a full match without getting stuck or crashing, and actually fight', () => {
    const r = simulate('normal', 8, 11);
    console.log('normal x8:', { seconds: Math.round(r.seconds), storm: r.stormDeaths, bomb: r.bombDeaths, hits: r.hits, kills: r.totalKills, quizzes: r.quizzes, correct: r.correct });
    expect(r.state.win.over).toBe(true);
    expect(r.hits).toBeGreaterThan(3); // they hit each other
    expect(r.stormDeaths).toBeLessThanOrEqual(4); // and know how to stay inside the safe zone
  });

  it('hard bots answer more quizzes correctly than easy bots', { timeout: 120_000 }, () => {
    let easy = 0;
    let hard = 0;
    let easyTotal = 0;
    let hardTotal = 0;
    for (const seed of [1, 2, 3]) {
      const e = simulate('easy', 6, seed);
      const h = simulate('hard', 6, seed);
      easy += e.correct;
      easyTotal += e.quizzes;
      hard += h.correct;
      hardTotal += h.quizzes;
    }
    console.log('quiz accuracy easy', easy, '/', easyTotal, 'hard', hard, '/', hardTotal);
    expect(hardTotal).toBeGreaterThan(0);
    expect(hard / hardTotal).toBeGreaterThan(easy / Math.max(1, easyTotal));
  });

  it('a lone bot does not run into its own blasts or the storm forever', () => {
    const r = simulate('hard', 2, 5);
    expect(r.state.win.over).toBe(true);
  });

  it('hunt a player who just stands still', { timeout: 120_000 }, () => {
    const times = [1, 2, 3].map((seed) => huntIdle('hard', 4, seed));
    console.log('time until an idle player is knocked out (hard x4):', times.map((t) => Math.round(t)));
    expect(Math.min(...times)).toBeLessThan(200);
    expect(times.filter((t) => t !== Infinity).length).toBeGreaterThanOrEqual(2);
  });
});
