/**
 * Main application: networking, the 60 fps canvas loop, input polling and screen switching
 * (lobby -> countdown/game -> podium).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CONSTANTS } from '@/shared/constants.js';
import { AppMessage, BotLevel, GameSnapshot, HardQuestion, LobbyPlayer, RoomOptions, ScoreRow, ThemeChoice } from '@/shared/protocol.js';
import type { Theme } from '@/shared/types.js';
import { sfx } from './audio/sfx.js';
import { createCamera, updateCamera } from './game/camera.js';
import { InterpolationManager } from './game/interpolation.js';
import { HU } from './i18n/hu.js';
import { InputManager } from './input/keyboard.js';
import { net } from './net/client.js';
import { Prediction } from './game/prediction.js';
import { Effects } from './render/effects.js';
import { renderScene } from './render/renderer.js';
import { GameOver } from './ui/GameOver.js';
import { HelpOverlay } from './ui/HelpOverlay.js';
import { HowToPlay } from './ui/HowToPlay.js';
import { GameMessages, spectateTarget } from './ui/GameMessages.js';
import { HUD } from './ui/HUD.js';
import { Lobby } from './ui/Lobby.js';
import { Minimap } from './ui/Minimap.js';
import { ProjectorLobby, ProjectorSidebar } from './ui/Projector.js';
import { QuizModal } from './ui/QuizModal.js';
import { useIsTouch } from './ui/useIsTouch.js';
import { VirtualControls } from './ui/VirtualControls.js';

const MIN_SEND_INTERVAL_MS = 30; // never send inputs more often than this
const KEEPALIVE_INTERVAL_MS = 250; // while a direction is held, repeat it (the server keeps it for 1.5 s)
const HIDDEN_DISCONNECT_MS = 20_000; // a tab that stays in the background this long drops its connection (saves battery)
const PREDICTED_BOMB_MAX_AGE = 0.8; // seconds a locally placed bomb waits for the server to confirm it

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestSnapshotRef = useRef<GameSnapshot | null>(null);
  const tilesRef = useRef<number[]>([]);
  const mapSizeRef = useRef<{ width: number; height: number }>({ width: CONSTANTS.MAP_WIDTH_TILES, height: CONSTANTS.MAP_HEIGHT_TILES });
  const interpolationRef = useRef(new InterpolationManager());
  const predictionRef = useRef(new Prediction());
  const cameraRef = useRef(createCamera());
  const inputRef = useRef<InputManager | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const roomCodeRef = useRef<string | null>(null); // lets the message handler see the current room
  const effectsRef = useRef(new Effects());
  const predictedBombsRef = useRef<Array<{ tileX: number; tileY: number; at: number }>>([]);
  const themeRef = useRef<Theme>('lab');
  const lastResultSeqRef = useRef(0);
  const projectorRef = useRef(false);

  const isTouch = useIsTouch();

  const [connected, setConnected] = useState(false);
  const [screen, setScreen] = useState<'lobby' | 'playing' | 'game_over'>('lobby');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [selfPlayerId, setSelfPlayerId] = useState<string | null>(null);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hud, setHud] = useState<GameSnapshot | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  // Game view: size in game pixels, the on-screen zoom (CSS px per game pixel) and the
  // canvas backing resolution (device px per game pixel), so the image is sharp on Retina screens
  const [view, setView] = useState({
    width: CONSTANTS.LOGICAL_WIDTH_PX as number,
    height: CONSTANTS.LOGICAL_HEIGHT_PX as number,
    cssScale: 2,
    pixelScale: 2,
  });
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [projector, setProjector] = useState(false);
  const [options, setOptions] = useState<RoomOptions>({ theme: 'random', categories: [] });
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [gained, setGained] = useState<Record<string, number>>({});
  const [hardQuestions, setHardQuestions] = useState<HardQuestion[]>([]);
  const [watchers, setWatchers] = useState(0);
  const [musicOn, setMusicOn] = useState(sfx.getMusicOn());
  projectorRef.current = projector;
  roomCodeRef.current = roomCode;
  const viewRef = useRef(view);
  viewRef.current = view;

  // Fit the game view to the available space: ~12-15 tiles on the short side, any screen shape
  const stageVisible = screen !== 'lobby';
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      // Projector: the whole arena at the largest whole-number zoom that fits; players: a ~12-15 tile window
      const cssScale = projectorRef.current
        ? Math.max(1, Math.floor(Math.min(w / CONSTANTS.WORLD_WIDTH_PX, h / CONSTANTS.WORLD_HEIGHT_PX)))
        : Math.max(2, Math.floor(Math.min(w, h) / 190));
      const width = Math.min(CONSTANTS.WORLD_WIDTH_PX, Math.floor(w / cssScale));
      const height = Math.min(CONSTANTS.WORLD_HEIGHT_PX, Math.floor(h / cssScale));
      // Whole device pixels per game pixel, but keep the canvas under ~6 megapixels
      let pixelScale = Math.max(1, Math.round(cssScale * dpr));
      while (pixelScale > 1 && width * height * pixelScale * pixelScale > 6_000_000) pixelScale--;
      cameraRef.current.width = width;
      cameraRef.current.height = height;
      setView((v) =>
        v.width === width && v.height === height && v.cssScale === cssScale && v.pixelScale === pixelScale
          ? v
          : { width, height, cssScale, pixelScale }
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stageVisible, projector]);

  // Input manager (keyboard + touch)
  useEffect(() => {
    const input = new InputManager();
    inputRef.current = input;
    return () => input.destroy();
  }, []);

  // Browsers only start audio after a tap or key press
  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Network
  useEffect(() => {
    const offConnection = net.onConnection(setConnected);
    const offPing = net.onPing((ms) => {
      setPingMs(ms);
      predictionRef.current.setRoundTrip(ms);
    });
    const offMessage = net.onMessage((msg: AppMessage) => {
      switch (msg.type) {
        case 'room_created':
          setRoomCode(msg.roomCode);
          setSelfPlayerId(msg.playerId);
          setHostId(msg.playerId);
          setErrorMessage(null);
          break;
        case 'room_joined':
          setRoomCode(msg.roomCode);
          setSelfPlayerId(msg.playerId);
          if (msg.isHost) setHostId(msg.playerId);
          setErrorMessage(null);
          break;
        case 'room_watching':
          setProjector(true);
          setRoomCode(msg.roomCode);
          setErrorMessage(null);
          break;
        case 'lobby_update':
          setRoomCode(msg.roomCode);
          setHostId(msg.hostId);
          setLobbyPlayers(msg.players);
          setBotLevel(msg.botLevel);
          setOptions(msg.options);
          setScores(msg.scores);
          setHardQuestions(msg.hardQuestions);
          setWatchers(msg.watchers);
          latestSnapshotRef.current = null;
          interpolationRef.current.clear();
          predictionRef.current.reset();
          effectsRef.current.reset();
          predictedBombsRef.current = [];
          setHud(null);
          setScreen('lobby');
          break;
        case 'game_init':
          tilesRef.current = msg.tiles;
          mapSizeRef.current = { width: msg.width, height: msg.height };
          themeRef.current = msg.theme;
          interpolationRef.current.clear();
          predictionRef.current.reset();
          effectsRef.current.reset();
          predictedBombsRef.current = [];
          lastResultSeqRef.current = 0;
          setGained({});
          setScreen((s) => (s === 'game_over' ? s : 'playing'));
          break;
        case 'match_report':
          setScores(msg.scores);
          setGained(msg.gained);
          setHardQuestions(msg.hardQuestions);
          break;
        case 'snapshot': {
          const data = msg.data;
          if (data.tiles) tilesRef.current = data.tiles;
          latestSnapshotRef.current = data;
          interpolationRef.current.updateFromSnapshot(data.players, data.tick);
          if (net.playerId) predictionRef.current.onSnapshot(data, net.playerId);
          effectsRef.current.onSnapshot(data, tilesRef.current, net.playerId);
          // Picked up a power-up: a small burst on our character
          const result = data.self.quizResult;
          if (result && result.seq !== lastResultSeqRef.current) {
            lastResultSeqRef.current = result.seq;
            const mine = predictionRef.current.get();
            if (result.reward && mine) effectsRef.current.burst(mine.x, mine.y, '#ffcd75');
          }

          setScreen(data.status === 'game_over' ? 'game_over' : 'playing');
          break;
        }
        case 'error':
          setErrorMessage(msg.message);
          // Lost our seat (e.g. the server was restarted): back to the start screen
          if (latestSnapshotRef.current || roomCodeRef.current) {
            net.forgetRoom();
            latestSnapshotRef.current = null;
            setRoomCode(null);
            setSelfPlayerId(null);
            setScreen('lobby');
          }
          break;
      }
    });

    net.connect();
    return () => {
      offConnection();
      offPing();
      offMessage();
      net.disconnect();
    };
  }, []);

  // React state for overlays is refreshed ~7 times per second
  useEffect(() => {
    const id = window.setInterval(() => {
      if (latestSnapshotRef.current) setHud(latestSnapshotRef.current);
    }, 150);
    return () => window.clearInterval(id);
  }, []);

  // ?watch=ABCD in the address opens the projector view of that room
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('watch');
    if (!code) return;
    return net.onConnection((isConnected) => {
      if (isConnected) net.send({ type: 'watch', roomCode: code.toUpperCase().slice(0, 6) });
    });
  }, []);

  // A phone that goes to the background stops drawing and, after a while, disconnects
  // (the seat is kept for a minute); coming back reconnects at once.
  useEffect(() => {
    let timer: number | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        timer = window.setTimeout(() => net.disconnect(), HIDDEN_DISCONNECT_MS);
      } else {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        if (!net.isConnected()) net.connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  // Background music: plays during the match and speeds up as the arena shrinks
  const musicActive = screen === 'playing' && (hud?.countdown ?? 1) <= 0;
  useEffect(() => {
    if (musicActive) sfx.startMusic();
    else sfx.stopMusic();
    return () => sfx.stopMusic();
  }, [musicActive]);
  useEffect(() => {
    if (!hud) return;
    const total = CONSTANTS.MAP_WIDTH_TILES - 3;
    sfx.setMusicIntensity(1 - (hud.safeZone.maxX - hud.safeZone.minX) / total);
  }, [hud]);

  // 60 fps loop: collect input, send changes to the server, render
  useEffect(() => {
    let animId = 0;
    let lastTime = performance.now();
    let lastSend = 0;
    let pendingBomb = false;
    let pendingWall = false;
    // Direction we want the server to have; a very short tap stays "wanted" until it was sent once
    let wantDx = 0;
    let wantDy = 0;
    let wantTap = false;
    let lastDx = 0;
    let lastDy = 0;

    /** Shows a bomb at once when we press the button; the server confirms it a moment later. */
    const predictBomb = (snapshot: GameSnapshot, myId: string, now: number) => {
      const local = predictionRef.current.get();
      const me = snapshot.players.find((p) => p.id === myId);
      if (!local || !me?.alive || snapshot.countdown > 0 || snapshot.self.inQuiz) return;
      const tileX = Math.floor(local.x / CONSTANTS.TILE_SIZE_PX);
      const tileY = Math.floor(local.y / CONSTANTS.TILE_SIZE_PX);
      const predicted = predictedBombsRef.current;
      if (predicted.some((g) => g.tileX === tileX && g.tileY === tileY)) return;
      if (snapshot.bombs.some((b) => b.tileX === tileX && b.tileY === tileY)) return;
      const infinite = snapshot.self.infiniteBombsTimer > 0;
      if (!infinite && snapshot.self.bombsOut + predicted.length >= snapshot.self.maxBombs) return;
      const tile = tilesRef.current[tileY * mapSizeRef.current.width + tileX];
      if (tile !== 0) return; // only on free floor; the server makes the final decision
      predicted.push({ tileX, tileY, at: now });
    };

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const input = inputRef.current;
      const snapshot = latestSnapshotRef.current;
      const myId = net.playerId;
      const viewerId = myId ?? (projectorRef.current ? '' : null); // the projector watches without being a player
      effectsRef.current.update(dt);

      if (input && !projectorRef.current) {
        const state = input.consume();
        if (state.toggleMap) setShowMap((v) => !v);
        if (state.toggleHelp) setShowHelp((v) => !v);
        if (state.toggleMute) setIsMuted(sfx.toggleMute());
        pendingBomb = pendingBomb || state.placeBomb;
        pendingWall = pendingWall || state.placeWall;
        if (state.dx !== 0 || state.dy !== 0) {
          wantDx = state.dx;
          wantDy = state.dy;
          wantTap = true;
        } else if (!wantTap) {
          wantDx = 0;
          wantDy = 0;
        }

        // The local character moves right away; the server gets the same input and confirms it
        if (snapshot && myId) {
          predictionRef.current.step(dt, state.dx, state.dy, snapshot, tilesRef.current, mapSizeRef.current.width, mapSizeRef.current.height);
        }

        // Send only when something changed (direction, bomb, wall) plus a keepalive while moving.
        // The server keeps the last direction, so this is far less traffic than a constant stream.
        const dirChanged = wantDx !== lastDx || wantDy !== lastDy;
        const keepAlive = (lastDx !== 0 || lastDy !== 0) && now - lastSend >= KEEPALIVE_INTERVAL_MS;
        if (
          snapshot && myId && snapshot.status === 'playing' &&
          (dirChanged || pendingBomb || pendingWall || keepAlive) &&
          now - lastSend >= MIN_SEND_INTERVAL_MS
        ) {
          lastSend = now;
          if (pendingBomb) predictBomb(snapshot, myId, now);
          net.send({ type: 'input', dx: wantDx, dy: wantDy, placeBomb: pendingBomb, placeWall: pendingWall });
          lastDx = wantDx;
          lastDy = wantDy;
          pendingBomb = false;
          pendingWall = false;
          wantTap = false;
        }
      }

      // Bombs the server has confirmed (or never will) are no longer predicted
      if (predictedBombsRef.current.length > 0) {
        predictedBombsRef.current = predictedBombsRef.current.filter(
          (g) => now - g.at < PREDICTED_BOMB_MAX_AGE * 1000 && !snapshot?.bombs.some((b) => b.tileX === g.tileX && b.tileY === g.tileY)
        );
      }

      interpolationRef.current.step(dt);
      // Our own character is drawn where the prediction is, not where the (delayed) server says
      const local = predictionRef.current.get();
      const me = myId ? interpolationRef.current.get(myId) : undefined;
      if (me && local) {
        me.x = local.x;
        me.y = local.y;
        me.targetX = local.x;
        me.targetY = local.y;
        me.facing = local.facing;
      }
      // A knocked-out player watches the one who knocked them out (or the first living player)
      let focus = me;
      if (snapshot && myId && snapshot.players.find((p) => p.id === myId)?.alive === false) {
        const target = spectateTarget(snapshot, myId);
        focus = (target && interpolationRef.current.get(target.id)) || me;
      }
      if (projectorRef.current) {
        cameraRef.current.x = 0;
        cameraRef.current.y = 0;
      } else if (focus) updateCamera(cameraRef.current, focus.x, focus.y);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && snapshot && viewerId !== null && tilesRef.current.length > 0) {
        const pixelScale = viewRef.current.pixelScale;
        ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0); // draw in game pixels, output in device pixels
        ctx.imageSmoothingEnabled = false;
        renderScene({
          ctx,
          pixelScale,
          camera: cameraRef.current,
          snapshot,
          interpolatedPlayers: interpolationRef.current.getAll(),
          selfPlayerId: viewerId,
          tiles: tilesRef.current,
          mapWidth: mapSizeRef.current.width,
          mapHeight: mapSizeRef.current.height,
          time: now / 1000,
          theme: themeRef.current,
          effects: effectsRef.current,
          predictedBombs: predictedBombsRef.current.map((g) => ({ tileX: g.tileX, tileY: g.tileY, age: (now - g.at) / 1000 })),
        });
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const startWithCredentials = (name: string, color: string, send: () => void) => {
    net.rememberPlayer(name, color);
    setErrorMessage(null);
    send();
  };

  const toggleMute = useCallback(() => setIsMuted(sfx.toggleMute()), []);
  const toggleMusic = useCallback(() => setMusicOn(sfx.toggleMusic()), []);
  const closeMap = useCallback(() => setShowMap(false), []);
  const closeHelp = useCallback(() => setShowHelp(false), []);
  const answerQuiz = useCallback((answerIndex: number) => net.send({ type: 'quiz_answer', answerIndex }), []);

  if (screen === 'lobby' && projector && roomCode) {
    return (
      <div className="h-[100dvh] w-screen">
        <ProjectorLobby roomCode={roomCode} players={lobbyPlayers} scores={scores} hardQuestions={hardQuestions} />
      </div>
    );
  }

  if (screen === 'lobby') {
    return (
      <div className="h-[100dvh] w-screen">
        <Lobby
          connected={connected}
          roomCode={roomCode}
          hostId={hostId}
          selfPlayerId={selfPlayerId}
          players={lobbyPlayers}
          botLevel={botLevel}
          onAddBot={() => net.send({ type: 'add_bot' })}
          onRemoveBot={() => net.send({ type: 'remove_bot' })}
          onBotLevel={(level) => net.send({ type: 'bot_level', level })}
          errorMessage={errorMessage}
          onCreateRoom={(name, color) => startWithCredentials(name, color, () => net.send({ type: 'create_room', hostName: name, hostColor: color }))}
          onJoinRoom={(code, name, color) => startWithCredentials(name, color, () => net.send({ type: 'join', roomCode: code, name, color }))}
          onStartGame={() => net.send({ type: 'start_game' })}
          onStartDemo={(name, color) => startWithCredentials(name, color, () => net.send({ type: 'start_demo', hostName: name, hostColor: color }))}
          onWatch={(code) => {
            setErrorMessage(null);
            net.send({ type: 'watch', roomCode: code });
          }}
          options={options}
          onOptions={(change: { theme?: ThemeChoice; categories?: string[] }) => net.send({ type: 'set_options', ...change })}
          scores={scores}
          hardQuestions={hardQuestions}
          watchers={watchers}
        />
      </div>
    );
  }

  const countdown = hud?.countdown ?? 0;
  const isHost = selfPlayerId !== null && selfPlayerId === hostId;

  return (
    <div className="relative flex h-[100dvh] w-screen select-none flex-col overflow-hidden bg-px-ink">
      {hud && selfPlayerId && !projector && <HUD snapshot={hud} selfPlayerId={selfPlayerId} pingMs={pingMs} onOpenMap={() => setShowMap(true)} onOpenHelp={() => setShowHelp(true)} />}

      <div className="flex min-h-0 flex-1">
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-px-ink">
        <canvas
          ref={canvasRef}
          width={view.width * view.pixelScale}
          height={view.height * view.pixelScale}
          style={{ imageRendering: 'pixelated', width: view.width * view.cssScale, height: view.height * view.cssScale }}
        />
        {!connected && (
          <div className="absolute inset-x-0 top-2 z-40 mx-auto w-max animate-pulse bg-px-orange px-3 py-1 font-pixel text-[9px] text-px-ink">
            Kapcsolat megszakadt - újracsatlakozás...
          </div>
        )}
        {hud && selfPlayerId && !projector && screen === 'playing' && <GameMessages snapshot={hud} selfPlayerId={selfPlayerId} />}
        {isTouch && screen === 'playing' && !projector && inputRef.current && <VirtualControls inputManager={inputRef.current} />}
      </div>
      {projector && hud && <ProjectorSidebar snapshot={hud} />}
      </div>

      {hud && screen === 'playing' && countdown > 0 && !projector && (
        <div className="px-backdrop fixed inset-0 z-40 flex items-center justify-center p-3">
          <div className="px-panel flex max-h-[96dvh] w-full max-w-lg flex-col items-center gap-3 overflow-y-auto p-4 text-center">
            <h2 className="px-title text-sm text-px-yellow">{HU.countdown.title}</h2>
            <div className="px-title text-6xl text-px-white">{Math.ceil(countdown)}</div>
            <HowToPlay compact />
          </div>
        </div>
      )}

      {hud && screen === 'playing' && countdown <= 0 && !projector && <QuizModal self={hud.self} onAnswer={answerQuiz} />}
      {showMap && hud && selfPlayerId && screen !== 'game_over' && (
        <Minimap snapshotRef={latestSnapshotRef} tilesRef={tilesRef} selfPlayerId={selfPlayerId} onClose={closeMap} />
      )}
      {showHelp && <HelpOverlay isMuted={isMuted} onToggleMute={toggleMute} musicOn={musicOn} onToggleMusic={toggleMusic} onClose={closeHelp} />}
      {screen === 'game_over' && hud && (
        <GameOver
          snapshot={hud}
          isHost={isHost}
          onBackToLobby={projector ? undefined : () => net.send({ type: 'back_to_lobby' })}
          scores={scores}
          gained={gained}
          hardQuestions={hardQuestions}
          selfId={selfPlayerId}
          large={projector}
        />
      )}
    </div>
  );
}
