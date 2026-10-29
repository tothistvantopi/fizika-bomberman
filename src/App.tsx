/**
 * Main application: networking, the 60 fps canvas loop, input polling and screen switching
 * (lobby -> countdown/game -> podium).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CONSTANTS } from '@/shared/constants.js';
import { BotLevel, GameSnapshot, LobbyPlayer, ServerMessage } from '@/shared/protocol.js';
import { sfx } from './audio/sfx.js';
import { createCamera, updateCamera } from './game/camera.js';
import { InterpolationManager } from './game/interpolation.js';
import { HU } from './i18n/hu.js';
import { InputManager } from './input/keyboard.js';
import { net } from './net/client.js';
import { Prediction } from './game/prediction.js';
import { renderScene } from './render/renderer.js';
import { GameOver } from './ui/GameOver.js';
import { HelpOverlay } from './ui/HelpOverlay.js';
import { HowToPlay } from './ui/HowToPlay.js';
import { GameMessages, spectateTarget } from './ui/GameMessages.js';
import { HUD } from './ui/HUD.js';
import { Lobby } from './ui/Lobby.js';
import { Minimap } from './ui/Minimap.js';
import { QuizModal } from './ui/QuizModal.js';
import { useIsTouch } from './ui/useIsTouch.js';
import { VirtualControls } from './ui/VirtualControls.js';

const MIN_SEND_INTERVAL_MS = 30; // never send inputs more often than this
const KEEPALIVE_INTERVAL_MS = 250; // while a direction is held, repeat it (the server keeps it for 1.5 s)

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
      const cssScale = Math.max(2, Math.floor(Math.min(w, h) / 190));
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
  }, [stageVisible]);

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
    const offMessage = net.onMessage((msg: ServerMessage) => {
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
        case 'lobby_update':
          setRoomCode(msg.roomCode);
          setHostId(msg.hostId);
          setLobbyPlayers(msg.players);
          setBotLevel(msg.botLevel);
          latestSnapshotRef.current = null;
          interpolationRef.current.clear();
          predictionRef.current.reset();
          setHud(null);
          setScreen('lobby');
          break;
        case 'game_init':
          tilesRef.current = msg.tiles;
          mapSizeRef.current = { width: msg.width, height: msg.height };
          interpolationRef.current.clear();
          predictionRef.current.reset();
          setScreen((s) => (s === 'game_over' ? s : 'playing'));
          break;
        case 'snapshot': {
          const data = msg.data;
          if (data.tiles) tilesRef.current = data.tiles;
          latestSnapshotRef.current = data;
          interpolationRef.current.updateFromSnapshot(data.players, data.tick);
          if (net.playerId) predictionRef.current.onSnapshot(data, net.playerId);

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

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const input = inputRef.current;
      const snapshot = latestSnapshotRef.current;
      const myId = net.playerId;

      if (input) {
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
          net.send({ type: 'input', dx: wantDx, dy: wantDy, placeBomb: pendingBomb, placeWall: pendingWall });
          lastDx = wantDx;
          lastDy = wantDy;
          pendingBomb = false;
          pendingWall = false;
          wantTap = false;
        }
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
      if (focus) updateCamera(cameraRef.current, focus.x, focus.y);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && snapshot && myId && tilesRef.current.length > 0) {
        const pixelScale = viewRef.current.pixelScale;
        ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0); // draw in game pixels, output in device pixels
        ctx.imageSmoothingEnabled = false;
        renderScene({
          ctx,
          pixelScale,
          camera: cameraRef.current,
          snapshot,
          interpolatedPlayers: interpolationRef.current.getAll(),
          selfPlayerId: myId,
          tiles: tilesRef.current,
          mapWidth: mapSizeRef.current.width,
          mapHeight: mapSizeRef.current.height,
          time: now / 1000,
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
  const closeMap = useCallback(() => setShowMap(false), []);
  const closeHelp = useCallback(() => setShowHelp(false), []);
  const answerQuiz = useCallback((answerIndex: number) => net.send({ type: 'quiz_answer', answerIndex }), []);

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
        />
      </div>
    );
  }

  const countdown = hud?.countdown ?? 0;
  const isHost = selfPlayerId !== null && selfPlayerId === hostId;

  return (
    <div className="relative flex h-[100dvh] w-screen select-none flex-col overflow-hidden bg-px-ink">
      {hud && selfPlayerId && <HUD snapshot={hud} selfPlayerId={selfPlayerId} pingMs={pingMs} onOpenMap={() => setShowMap(true)} onOpenHelp={() => setShowHelp(true)} />}

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
        {hud && selfPlayerId && screen === 'playing' && <GameMessages snapshot={hud} selfPlayerId={selfPlayerId} />}
        {isTouch && screen === 'playing' && inputRef.current && <VirtualControls inputManager={inputRef.current} />}
      </div>

      {hud && screen === 'playing' && countdown > 0 && (
        <div className="px-backdrop fixed inset-0 z-40 flex items-center justify-center p-3">
          <div className="px-panel flex max-h-[96dvh] w-full max-w-lg flex-col items-center gap-3 overflow-y-auto p-4 text-center">
            <h2 className="px-title text-sm text-px-yellow">{HU.countdown.title}</h2>
            <div className="px-title text-6xl text-px-white">{Math.ceil(countdown)}</div>
            <HowToPlay compact />
          </div>
        </div>
      )}

      {hud && screen === 'playing' && countdown <= 0 && <QuizModal self={hud.self} onAnswer={answerQuiz} />}
      {showMap && hud && selfPlayerId && screen !== 'game_over' && (
        <Minimap snapshotRef={latestSnapshotRef} tilesRef={tilesRef} selfPlayerId={selfPlayerId} onClose={closeMap} />
      )}
      {showHelp && <HelpOverlay isMuted={isMuted} onToggleMute={toggleMute} onClose={closeHelp} />}
      {screen === 'game_over' && hud && (
        <GameOver snapshot={hud} isHost={isHost} onBackToLobby={() => net.send({ type: 'back_to_lobby' })} />
      )}
    </div>
  );
}
