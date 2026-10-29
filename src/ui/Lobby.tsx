/**
 * Lobby: create or join a room, pick a tie colour, read the rules, wait for the host to start.
 * The host also sees the address (and a QR code) the students have to open.
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CONSTANTS } from '@/shared/constants.js';
import { BotLevel, LobbyPlayer } from '@/shared/protocol.js';
import { HU } from '../i18n/hu.js';
import { HowToPlay } from './HowToPlay.js';
import { PixelIcon } from './PixelIcon.js';

interface LobbyProps {
  connected: boolean;
  roomCode: string | null;
  hostId: string | null;
  selfPlayerId: string | null;
  players: LobbyPlayer[];
  botLevel: BotLevel;
  onAddBot: () => void;
  onRemoveBot: () => void;
  onBotLevel: (level: BotLevel) => void;
  errorMessage: string | null;
  onCreateRoom: (name: string, color: string) => void;
  onJoinRoom: (code: string, name: string, color: string) => void;
  onStartGame: () => void;
  onStartDemo: (name: string, color: string) => void;
}

/** Static browser-only build (vite --mode demo): only games against bots, no server. */
const DEMO = import.meta.env.VITE_DEMO === '1';
const REPO_URL = 'https://github.com/tothistvantopi/fizika-bomberman';

const TIE_COLORS = [
  '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#73eff7', '#41a6f6',
  '#3b5dc9', '#5d275d', '#ff77a8', '#a05b2d', '#94b0c2', '#566c86', '#e8e8e8',
];

/** Address students should open: the LAN address of the host computer, or this page's own address. */
function useJoinUrl(enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    if (!isLocal) {
      setUrl(window.location.origin);
      return;
    }
    fetch('/api/info')
      .then((r) => r.json())
      .then((info: { port: number; addresses: string[] }) => {
        setUrl(info.addresses.length > 0 ? `http://${info.addresses[0]}:${info.port}` : null);
      })
      .catch(() => setUrl(null));
  }, [enabled]);
  return url;
}

export const Lobby: React.FC<LobbyProps> = ({
  connected,
  roomCode,
  hostId,
  selfPlayerId,
  players,
  botLevel,
  onAddBot,
  onRemoveBot,
  onBotLevel,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onStartGame,
  onStartDemo,
}) => {
  const [tab, setTab] = useState<'create' | 'join'>(DEMO ? 'create' : 'join');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState(TIE_COLORS[Math.floor(Math.random() * TIE_COLORS.length)]);
  const [qr, setQr] = useState<string | null>(null);

  const inRoom = Boolean(roomCode);
  const isHost = inRoom && selfPlayerId === hostId;
  const canStart = isHost && players.length >= CONSTANTS.MIN_PLAYERS_TO_START;
  const joinUrl = useJoinUrl(isHost && !DEMO);

  useEffect(() => {
    if (!joinUrl) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(joinUrl, { margin: 1, width: 200, color: { dark: '#1a1c2c', light: '#f4f4f4' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [joinUrl]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !connected) return;
    if (tab === 'create') onCreateRoom(trimmed, color);
    else if (code.trim().length === 4) onJoinRoom(code.trim().toUpperCase(), trimmed, color);
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-px-ink">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center gap-5 px-4 py-5">
        <div className="text-center">
          <h1 className="px-title flex items-center justify-center gap-3 text-xl leading-snug text-px-yellow md:text-3xl">
            <PixelIcon name="bomb" size={28} className="text-px-orange" />
            <span>
              FIZIKA <br className="md:hidden" />
              BOMBERMAN
            </span>
            <PixelIcon name="bomb" size={28} className="text-px-orange" />
          </h1>
          <p className="mt-3 text-2xl text-px-cyan">{HU.subtitle}</p>
          <p className="text-lg text-px-silver">{HU.gradeLevel}</p>
        </div>

        {errorMessage && (
          <div className="px-panel-dark flex w-full items-center gap-2 border-px-red p-3 text-xl text-px-orange">
            <PixelIcon name="warning" size={20} /> {errorMessage}
          </div>
        )}
        {!connected && <div className="w-full animate-pulse bg-px-orange p-2 text-center text-xl text-px-ink">{HU.lobby.connecting}</div>}

        <div className="px-panel w-full p-4">
          {!inRoom ? (
            <>
              <div className="mb-4 flex gap-2">
                {DEMO ? null : (['join', 'create'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className="px-btn flex flex-1 items-center justify-center gap-2 !px-1 !text-[9px]"
                    style={{ ['--btn' as string]: tab === t ? '#ffcd75' : '#566c86' }}
                  >
                    <PixelIcon name={t === 'join' ? 'key' : 'plus'} size={12} />
                    {t === 'join' ? HU.lobby.joinRoomTab : HU.lobby.createRoomTab}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1 text-xl text-px-silver">
                  {tab === 'create' ? HU.lobby.hostNameLabel : HU.lobby.playerNameLabel}
                  <input
                    type="text"
                    required
                    maxLength={14}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                    className="px-input"
                  />
                </label>

                {tab === 'join' && (
                  <label className="flex flex-col gap-1 text-xl text-px-silver">
                    {HU.lobby.roomCodeLabel}
                    <input
                      type="text"
                      required
                      maxLength={4}
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      autoComplete="off"
                      autoCapitalize="characters"
                      placeholder="ABCD"
                      className="px-input !font-pixel !text-2xl text-center uppercase tracking-[0.3em] !text-px-yellow"
                    />
                  </label>
                )}

                <div className="flex flex-col gap-2 text-xl text-px-silver">
                  {HU.lobby.chooseColor}
                  <div className="px-inset flex flex-wrap gap-2.5 p-2.5">
                    {TIE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Szín ${c}`}
                        onClick={() => setColor(c)}
                        className={`h-9 w-9 border-4 ${color === c ? 'border-px-white shadow-[0_0_0_3px_#000]' : 'border-px-ink'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {!DEMO && (
                  <button type="submit" disabled={!connected} className="px-btn !py-4">
                    {tab === 'create' ? HU.lobby.createRoomBtn : HU.lobby.joinRoomBtn}
                  </button>
                )}
                {tab === 'create' && (
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => onStartDemo(name.trim() || 'Tanár', color)}
                    className={DEMO ? 'px-btn flex items-center justify-center gap-2 !py-4' : 'px-btn flex items-center justify-center gap-2 !text-[9px]'}
                    style={{ ['--btn' as string]: '#38b764' }}
                  >
                    <PixelIcon name="flask" size={14} /> {DEMO ? HU.lobby.demoOnlyBtn : HU.lobby.demoBtn}
                  </button>
                )}
                {DEMO && (
                  <div className="px-inset p-3 text-lg text-px-silver">
                    {HU.lobby.demoNote}{' '}
                    <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-px-cyan underline">
                      {HU.lobby.demoDownload}
                    </a>
                  </div>
                )}
              </form>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="px-inset flex items-center justify-between p-3">
                <div>
                  <span className="block text-xl text-px-silver">{HU.lobby.roomCode}</span>
                  <span className="px-title text-3xl tracking-widest text-px-yellow">{roomCode}</span>
                </div>
                <div className="text-right">
                  <span className="block text-xl text-px-silver">{HU.lobby.players}</span>
                  <span className="px-title text-lg text-px-cyan">
                    {players.length}/{CONSTANTS.MAX_PLAYERS}
                  </span>
                </div>
              </div>

              {isHost && joinUrl && (
                <div className="px-inset flex items-center gap-3 !border-px-teal p-3">
                  {qr && <img src={qr} alt="QR kód a csatlakozáshoz" className="h-28 w-28 shrink-0 border-4 border-px-white" style={{ imageRendering: 'pixelated' }} />}
                  <div className="min-w-0">
                    <p className="text-lg text-px-cyan">{HU.lobby.joinAt}</p>
                    <p className="mt-1 break-all font-pixel text-[10px] leading-relaxed text-px-white">{joinUrl}</p>
                    <p className="mt-1 text-lg text-px-silver">+ szobakód: {roomCode}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-xl text-px-silver">{HU.lobby.connectedPlayers}</span>
                <div className="px-inset grid max-h-52 grid-cols-2 gap-2 overflow-y-auto p-2">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 border-2 border-px-slate bg-px-dusk p-1.5 text-xl">
                      <span className="h-4 w-4 shrink-0 border-2 border-px-white" style={{ backgroundColor: p.color }} />
                      <span className="truncate">{p.name}</span>
                      {p.isBot && <span className="ml-auto bg-px-slate px-1 font-pixel text-[7px] text-px-white">{HU.lobby.botBadge}</span>}
                      {p.isHost && <span className="ml-auto bg-px-yellow px-1 font-pixel text-[7px] text-px-ink">TANÁR</span>}
                      {p.id === selfPlayerId && !p.isHost && <span className="ml-auto bg-px-cyan px-1 font-pixel text-[7px] text-px-ink">{HU.lobby.youBadge}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {isHost && (
                <div className="px-inset flex flex-col gap-2 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xl text-px-silver">{HU.lobby.botsLabel}</span>
                    <span className="flex items-center gap-2">
                      <button onClick={onRemoveBot} disabled={!players.some((p) => p.isBot)} className="px-btn !px-3 !py-1.5" aria-label="Bot törlése">-</button>
                      <span className="px-title w-6 text-center text-xs text-px-cyan">{players.filter((p) => p.isBot).length}</span>
                      <button onClick={onAddBot} disabled={players.length >= CONSTANTS.MAX_PLAYERS} className="px-btn !px-3 !py-1.5" aria-label="Bot hozzáadása">+</button>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {(['easy', 'normal', 'hard'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => onBotLevel(level)}
                        className="px-btn flex-1 !px-1 !py-2 !text-[8px]"
                        style={{ ['--btn' as string]: botLevel === level ? '#ffcd75' : '#566c86' }}
                      >
                        {HU.lobby.botLevels[level]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isHost ? (
                <div className="flex flex-col gap-2">
                  <button onClick={onStartGame} disabled={!canStart} className="px-btn flex items-center justify-center gap-2 !py-4 !text-xs" style={{ ['--btn' as string]: '#38b764' }}>
                    <PixelIcon name="play" size={14} /> {HU.lobby.startGameBtn}
                  </button>
                  {!canStart && <p className="text-center text-xl text-px-orange">{HU.lobby.needMorePlayers(CONSTANTS.MIN_PLAYERS_TO_START)}</p>}
                </div>
              ) : (
                <div className="px-inset animate-pulse p-3 text-center text-xl text-px-silver">{HU.lobby.waitingForHost}</div>
              )}
            </div>
          )}
        </div>

        <div className="px-panel-dark w-full p-4">
          <HowToPlay />
        </div>
      </div>
    </div>
  );
};
