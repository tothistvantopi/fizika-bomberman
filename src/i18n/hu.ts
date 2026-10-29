/**
 * Hungarian UI strings.
 */

import type { IconName } from '../ui/PixelIcon.js';

export const HU = {
  appTitle: 'Fizika Bomberman',
  subtitle: 'Mindenki mindenki ellen – kis Einsteinek harca',
  gradeLevel: '7. osztályos fizika: mozgások és erők',

  howToTitle: 'Hogyan működik?',
  howTo: [
    { icon: 'person', text: 'Te egy kis Einstein vagy, a nyakkendőd a te színed. Mindenki mindenki ellen játszik!' },
    { icon: 'bomb', text: 'Bomba: Szóköz vagy B (telefonon a BOMBA gomb). 2 mp múlva kereszt alakban robban és széttöri a téglákat. A saját bombád nem árt neked, a másokéi igen!' },
    { icon: 'wall', text: 'Fal: F vagy FAL gomb. Magad elé építhetsz egy falat, ami kibír egy robbanást. 3 falad van, idővel pótlódnak.' },
    { icon: 'question', text: 'Lépj egy kérdőjelre: fizika kérdést kapsz (20 mp). Amíg gondolkodsz, védett vagy. Helyes válaszért extra jár!' },
    { icon: 'shield', text: 'Extrák: sebezhetetlenség 30 mp, gyors mozgás 30 mp, óriási robbanás 30 mp, végtelen bomba 10 mp.' },
    { icon: 'storm', text: 'A pálya idővel szűkül. A piros zónában kiesel, ezért mozogj középre!' },
    { icon: 'trophy', text: 'Aki utoljára marad, nyer. Legfeljebb 5 perc a játék, a végén a legjobb 3 kerül a dobogóra.' },
  ] as Array<{ icon: IconName; text: string }>,
  controlsDesktop: 'MOZGÁS: WASD/NYILAK · BOMBA: SZÓKÖZ/B · FAL: F · TÉRKÉP: Q · SÚGÓ: P · HANG: M · VÁLASZ: 1 2 3',
  controlsTouch: 'MOZGÁS: JOYSTICK · BOMBA, FAL: GOMBOK · VÁLASZ: KOPPINTS A LEHETŐSÉGRE',

  lobby: {
    createRoomTab: 'Új Szoba',
    joinRoomTab: 'Csatlakozás',
    hostNameLabel: 'Neved (pl. Tanár úr)',
    playerNameLabel: 'Neved (pl. Bence)',
    roomCodeLabel: '4 betűs szobakód',
    chooseColor: 'Válassz nyakkendő-színt:',
    createRoomBtn: 'Szoba Létrehozása',
    joinRoomBtn: 'Belépés a Szobába',
    demoBtn: 'Gyors teszt (te + 7 bot)',
    roomCode: 'Szobakód:',
    players: 'Játékosok:',
    waitingForHost: 'Várakozás a tanárra/szobavezetőre az indításhoz...',
    startGameBtn: 'Játék Indítása',
    needMorePlayers: (min: number) => `Legalább ${min} játékos kell az induláshoz.`,
    connectedPlayers: 'Csatlakozott játékosok:',
    hostBadge: 'SZERVEZŐ',
    youBadge: 'TE',
    botsLabel: 'Számítógépes ellenfelek:',
    botLevels: { easy: 'Könnyű', normal: 'Közepes', hard: 'Nehéz' } as Record<'easy' | 'normal' | 'hard', string>,
    botBadge: 'BOT',
    joinAt: 'Csatlakozás a diákoknak (ugyanazon a Wi-Fin):',
    connecting: 'Csatlakozás a szerverhez...',
  },

  quiz: {
    title: 'Fizika kérdés',
    instruction: 'Válaszolj 1, 2, 3 gombbal vagy koppintással:',
    timeLeft: (s: number) => `${s} mp`,
    correct: 'Helyes válasz!',
    wrong: 'Nem talált!',
    timedOut: 'Lejárt az idő!',
    correctAnswerIs: 'A helyes válasz:',
    continueBtn: 'Tovább',
    reward: 'Kapott extra:',
    noReward: 'Ezúttal nem jár extra.',
  },

  powerUps: {
    INVULNERABLE: { icon: 'shield', name: 'Sebezhetetlenség' },
    SPEED: { icon: 'bolt', name: 'Gyors mozgás' },
    BIG_BLAST: { icon: 'blast', name: 'Óriási robbanás' },
    INFINITE_BOMBS: { icon: 'infinity', name: 'Végtelen bomba' },
  } as Record<'INVULNERABLE' | 'SPEED' | 'BIG_BLAST' | 'INFINITE_BOMBS', { icon: IconName; name: string }>,

  feed: {
    hit: (victim: string, killer: string | undefined, left: number) =>
      killer ? `${killer} eltalálta ${victim} játékost (${left} élet maradt)` : `${victim} életet vesztett (${left} maradt)`,
    out: (victim: string, killer: string) => `${killer} kiütötte ${victim} játékost!`,
    storm: (victim: string) => `A zóna végzett ${victim} játékossal!`,
  },

  dead: {
    title: 'KIESTÉL!',
    byPlayer: (name: string) => `Kiütött: ${name}`,
    byStorm: 'A veszélyzóna végzett veled.',
    spectating: (name: string) => `Nézed: ${name}`,
  },

  hud: {
    alive: 'Életben',
    zoneWarning: (s: number) => `A pálya széle ${s} mp múlva beomlik!`,
    finalZone: 'VÉGSŐ ZÓNA',
    shrinkIn: (s: number) => `${s} mp`,
  },

  countdown: {
    title: 'A játék mindjárt indul!',
    go: 'Vigyázz, kész...',
  },

  gameOver: {
    title: 'A JÁTÉK VÉGE',
    podium: 'Dobogó',
    others: 'További helyezések',
    kills: (n: number) => `${n} kiütés`,
    newGame: 'Új játék (vissza a váróterembe)',
    waitHost: 'A szobavezető hamarosan új játékot indít...',
  },

  help: {
    title: 'SÚGÓ',
    close: 'Bezárás',
    mute: 'Hang némítása',
    unmute: 'Hang bekapcsolása',
  },

  mobile: {
    bomb: 'BOMBA',
    wall: 'FAL',
    map: 'TÉRKÉP',
  },
};
