// ─── Types ───────────────────────────────────────────────────────────────────

export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Card = `${Rank}${Suit}`; // e.g. "Ah", "Td", "2c"

export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface Player {
  name: string;
  chips: number;
  hand: [Card, Card] | [];
  bet: number;        // current round bet
  totalBet: number;   // total bet this hand
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  seat: number;
  lastAction?: string;
}

export interface GameState {
  players: Player[];
  community: Card[];
  deck: Card[];
  pot: number;
  sidePots: { amount: number; eligible: string[] }[];
  phase: Phase;
  dealer: number;       // seat index of dealer
  currentTurn: number;  // seat index whose turn it is
  smallBlind: number;
  bigBlind: number;
  lastRaise: number;
  minRaise: number;
  roundStarted: boolean;
  winners?: { name: string; amount: number; hand: string }[];
  handNumber: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SUITS: Suit[] = ['h', 'd', 'c', 's'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// ─── Deck ────────────────────────────────────────────────────────────────────

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push(`${r}${s}` as Card);
    }
  }
  return shuffle(deck);
}

function shuffle(arr: Card[]): Card[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Initial state ───────────────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    players: [],
    community: [],
    deck: [],
    pot: 0,
    sidePots: [],
    phase: 'waiting',
    dealer: 0,
    currentTurn: -1,
    smallBlind: 10,
    bigBlind: 20,
    lastRaise: 20,
    minRaise: 20,
    roundStarted: false,
    handNumber: 0,
  };
}

// ─── Player management ──────────────────────────────────────────────────────

export function addPlayer(state: GameState, name: string, buyIn: number): GameState {
  if (state.players.find((p) => p.name === name)) return state;
  if (state.players.length >= 8) return state;

  const takenSeats = new Set(state.players.map((p) => p.seat));
  let seat = 0;
  while (takenSeats.has(seat)) seat++;

  const player: Player = {
    name,
    chips: buyIn,
    hand: [],
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    sittingOut: false,
    seat,
  };

  return { ...state, players: [...state.players, player] };
}

export function removePlayer(state: GameState, name: string): GameState {
  return { ...state, players: state.players.filter((p) => p.name !== name) };
}

export function rebuy(state: GameState, name: string, amount: number): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.name === name ? { ...p, chips: p.chips + amount, sittingOut: false } : p
    ),
  };
}

// ─── Deal a new hand ─────────────────────────────────────────────────────────

export function dealNewHand(state: GameState): GameState {
  const activePlayers = state.players.filter((p) => p.chips > 0 && !p.sittingOut);
  if (activePlayers.length < 2) return state;

  const deck = createDeck();
  const newPlayers = state.players.map((p) => ({
    ...p,
    hand: [] as Card[] | [Card, Card],
    bet: 0,
    totalBet: 0,
    folded: p.chips <= 0 || p.sittingOut,
    allIn: false,
    lastAction: undefined,
  }));

  // Move dealer
  let dealer = (state.dealer + 1) % newPlayers.length;
  while (newPlayers[dealer].folded) dealer = (dealer + 1) % newPlayers.length;

  // Deal 2 cards to each active player
  let deckIdx = 0;
  for (let i = 0; i < newPlayers.length; i++) {
    if (!newPlayers[i].folded) {
      newPlayers[i].hand = [deck[deckIdx], deck[deckIdx + 1]] as [Card, Card];
      deckIdx += 2;
    }
  }

  const remainingDeck = deck.slice(deckIdx);

  // Post blinds
  const activeIdxs = newPlayers.map((p, i) => (!p.folded ? i : -1)).filter((i) => i >= 0);
  const dealerActiveIdx = activeIdxs.indexOf(dealer);

  let sbIdx: number, bbIdx: number;
  if (activeIdxs.length === 2) {
    sbIdx = dealer;
    bbIdx = activeIdxs[(dealerActiveIdx + 1) % activeIdxs.length];
  } else {
    sbIdx = activeIdxs[(dealerActiveIdx + 1) % activeIdxs.length];
    bbIdx = activeIdxs[(dealerActiveIdx + 2) % activeIdxs.length];
  }

  const sb = Math.min(state.smallBlind, newPlayers[sbIdx].chips);
  newPlayers[sbIdx].chips -= sb;
  newPlayers[sbIdx].bet = sb;
  newPlayers[sbIdx].totalBet = sb;
  if (newPlayers[sbIdx].chips === 0) newPlayers[sbIdx].allIn = true;

  const bb = Math.min(state.bigBlind, newPlayers[bbIdx].chips);
  newPlayers[bbIdx].chips -= bb;
  newPlayers[bbIdx].bet = bb;
  newPlayers[bbIdx].totalBet = bb;
  if (newPlayers[bbIdx].chips === 0) newPlayers[bbIdx].allIn = true;

  // First to act is left of big blind
  const bbActiveIdx = activeIdxs.indexOf(bbIdx);
  const firstToAct = activeIdxs[(bbActiveIdx + 1) % activeIdxs.length];

  return {
    ...state,
    players: newPlayers as Player[],
    community: [],
    deck: remainingDeck,
    pot: sb + bb,
    sidePots: [],
    phase: 'preflop',
    dealer,
    currentTurn: firstToAct,
    lastRaise: state.bigBlind,
    minRaise: state.bigBlind,
    roundStarted: true,
    winners: undefined,
    handNumber: state.handNumber + 1,
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function getActivePlayers(state: GameState): number[] {
  return state.players
    .map((p, i) => (!p.folded && !p.sittingOut ? i : -1))
    .filter((i) => i >= 0);
}

function getNextActive(state: GameState, from: number): number {
  const active = getActivePlayers(state);
  const currentIdx = active.indexOf(from);
  return active[(currentIdx + 1) % active.length];
}

function playersStillInHand(state: GameState): Player[] {
  return state.players.filter((p) => !p.folded && !p.sittingOut);
}

function allBetsSettled(state: GameState): boolean {
  const inHand = state.players.filter((p) => !p.folded && !p.sittingOut && !p.allIn);
  if (inHand.length <= 1) return true;
  const maxBet = Math.max(...inHand.map((p) => p.bet));
  return inHand.every((p) => p.bet === maxBet && p.lastAction !== undefined);
}

function advancePhase(state: GameState): GameState {
  const remaining = playersStillInHand(state);

  // Only one player left — they win
  if (remaining.length === 1) {
    const winner = remaining[0];
    return {
      ...state,
      phase: 'showdown',
      winners: [{ name: winner.name, amount: state.pot, hand: 'Last one standing' }],
      players: state.players.map((p) =>
        p.name === winner.name ? { ...p, chips: p.chips + state.pot } : p
      ),
      pot: 0,
      currentTurn: -1,
    };
  }

  // All players all-in — run out remaining community cards
  const canAct = remaining.filter((p) => !p.allIn);

  // Reset bets for new round
  const resetPlayers = state.players.map((p) => ({ ...p, bet: 0, lastAction: undefined }));

  // Find first to act (left of dealer, still in hand)
  const activeIdxs = resetPlayers
    .map((p, i) => (!p.folded && !p.sittingOut && !p.allIn ? i : -1))
    .filter((i) => i >= 0);

  let firstToAct = -1;
  if (activeIdxs.length > 0) {
    const allInHand = resetPlayers
      .map((p, i) => (!p.folded && !p.sittingOut ? i : -1))
      .filter((i) => i >= 0);
    const dealerPos = allInHand.indexOf(state.dealer);
    for (let offset = 1; offset <= allInHand.length; offset++) {
      const candidate = allInHand[(dealerPos + offset) % allInHand.length];
      if (activeIdxs.includes(candidate)) {
        firstToAct = candidate;
        break;
      }
    }
  }

  const deck = [...state.deck];
  let community = [...state.community];

  switch (state.phase) {
    case 'preflop':
      // Deal flop
      community = [deck.shift()!, deck.shift()!, deck.shift()!];
      return {
        ...state,
        phase: canAct.length <= 1 ? advanceUntilShowdown({ ...state, community, deck, players: resetPlayers, pot: state.pot }).phase : 'flop',
        community: canAct.length <= 1 ? advanceUntilShowdown({ ...state, community, deck, players: resetPlayers, pot: state.pot }).community : community,
        deck: canAct.length <= 1 ? advanceUntilShowdown({ ...state, community, deck, players: resetPlayers, pot: state.pot }).deck : deck,
        players: resetPlayers,
        currentTurn: canAct.length <= 1 ? -1 : firstToAct,
        lastRaise: state.bigBlind,
        minRaise: state.bigBlind,
      };
    case 'flop':
      community.push(deck.shift()!);
      return {
        ...state,
        phase: canAct.length <= 1 ? advanceUntilShowdown({ ...state, community, deck, players: resetPlayers, pot: state.pot }).phase : 'turn',
        community: canAct.length <= 1 ? advanceUntilShowdown({ ...state, community, deck, players: resetPlayers, pot: state.pot }).community : community,
        deck: canAct.length <= 1 ? advanceUntilShowdown({ ...state, community, deck, players: resetPlayers, pot: state.pot }).deck : deck,
        players: resetPlayers,
        currentTurn: canAct.length <= 1 ? -1 : firstToAct,
        lastRaise: state.bigBlind,
        minRaise: state.bigBlind,
      };
    case 'turn':
      community.push(deck.shift()!);
      return {
        ...state,
        phase: canAct.length <= 1 ? 'showdown' : 'river',
        community,
        deck,
        players: resetPlayers,
        currentTurn: canAct.length <= 1 ? -1 : firstToAct,
        lastRaise: state.bigBlind,
        minRaise: state.bigBlind,
      };
    case 'river':
      return resolveShowdown({ ...state, players: resetPlayers });
    default:
      return state;
  }
}

function advanceUntilShowdown(state: GameState): { phase: Phase; community: Card[]; deck: Card[] } {
  const deck = [...state.deck];
  const community = [...state.community];
  while (community.length < 5) {
    community.push(deck.shift()!);
  }
  return { phase: 'showdown', community, deck };
}

export function fold(state: GameState, playerName: string): GameState {
  if (state.players[state.currentTurn]?.name !== playerName) return state;

  const newPlayers = state.players.map((p) =>
    p.name === playerName ? { ...p, folded: true, lastAction: 'fold' } : p
  );

  let newState = { ...state, players: newPlayers };
  const remaining = playersStillInHand(newState);

  if (remaining.length === 1) {
    return advancePhase(newState);
  }

  newState.currentTurn = getNextActive(newState, state.currentTurn);
  if (allBetsSettled(newState)) {
    return advancePhase(newState);
  }
  return newState;
}

export function check(state: GameState, playerName: string): GameState {
  if (state.players[state.currentTurn]?.name !== playerName) return state;
  const player = state.players[state.currentTurn];
  const maxBet = Math.max(...state.players.filter((p) => !p.folded).map((p) => p.bet));
  if (player.bet < maxBet) return state; // Can't check, must call

  const newPlayers = state.players.map((p) =>
    p.name === playerName ? { ...p, lastAction: 'check' } : p
  );

  let newState = { ...state, players: newPlayers };
  newState.currentTurn = getNextActive(newState, state.currentTurn);

  if (allBetsSettled(newState)) {
    return advancePhase(newState);
  }
  return newState;
}

export function call(state: GameState, playerName: string): GameState {
  if (state.players[state.currentTurn]?.name !== playerName) return state;
  const player = state.players[state.currentTurn];
  const maxBet = Math.max(...state.players.filter((p) => !p.folded).map((p) => p.bet));
  const callAmount = Math.min(maxBet - player.bet, player.chips);

  const newPlayers = state.players.map((p) => {
    if (p.name !== playerName) return p;
    const newChips = p.chips - callAmount;
    return {
      ...p,
      chips: newChips,
      bet: p.bet + callAmount,
      totalBet: p.totalBet + callAmount,
      allIn: newChips === 0,
      lastAction: newChips === 0 ? 'all-in' : 'call',
    };
  });

  let newState = { ...state, players: newPlayers, pot: state.pot + callAmount };
  newState.currentTurn = getNextActive(newState, state.currentTurn);

  if (allBetsSettled(newState)) {
    return advancePhase(newState);
  }
  return newState;
}

export function raise(state: GameState, playerName: string, totalBet: number): GameState {
  if (state.players[state.currentTurn]?.name !== playerName) return state;
  const player = state.players[state.currentTurn];
  const raiseAmount = totalBet - player.bet;
  if (raiseAmount > player.chips) return state;

  const actualRaise = totalBet - Math.max(...state.players.filter((p) => !p.folded).map((p) => p.bet));

  const newPlayers = state.players.map((p) => {
    if (p.name !== playerName) return p;
    const newChips = p.chips - raiseAmount;
    return {
      ...p,
      chips: newChips,
      bet: totalBet,
      totalBet: p.totalBet + raiseAmount,
      allIn: newChips === 0,
      lastAction: newChips === 0 ? 'all-in' : 'raise',
    };
  });

  // Reset lastAction for others so they get a chance to act
  const resetPlayers = newPlayers.map((p) =>
    p.name !== playerName && !p.folded && !p.allIn ? { ...p, lastAction: undefined } : p
  );

  let newState = {
    ...state,
    players: resetPlayers,
    pot: state.pot + raiseAmount,
    lastRaise: actualRaise,
    minRaise: Math.max(state.bigBlind, actualRaise),
  };
  newState.currentTurn = getNextActive(newState, state.currentTurn);
  return newState;
}

export function allIn(state: GameState, playerName: string): GameState {
  const player = state.players.find((p) => p.name === playerName);
  if (!player) return state;
  return raise(state, playerName, player.bet + player.chips);
}

// ─── Showdown ────────────────────────────────────────────────────────────────

function resolveShowdown(state: GameState): GameState {
  const remaining = playersStillInHand(state);
  const community = state.community;

  // Evaluate each player's best hand
  const evaluated = remaining.map((p) => ({
    player: p,
    rank: evaluateHand([...p.hand, ...community]),
  }));

  // Sort by hand rank (highest first)
  evaluated.sort((a, b) => compareHands(b.rank, a.rank));

  // Simple pot distribution (no side pots for now)
  const bestRank = evaluated[0].rank;
  const winners = evaluated.filter((e) => compareHands(e.rank, bestRank) === 0);
  const share = Math.floor(state.pot / winners.length);

  const winnerInfo = winners.map((w) => ({
    name: w.player.name,
    amount: share,
    hand: handRankName(w.rank),
  }));

  const newPlayers = state.players.map((p) => {
    const win = winnerInfo.find((w) => w.name === p.name);
    return win ? { ...p, chips: p.chips + win.amount } : p;
  });

  return {
    ...state,
    phase: 'showdown',
    players: newPlayers,
    pot: 0,
    currentTurn: -1,
    winners: winnerInfo,
  };
}

// ─── Hand Evaluation ─────────────────────────────────────────────────────────

interface HandRank {
  rank: number; // 9=straight flush, 8=four of a kind, ... 0=high card
  values: number[]; // tiebreaker values
}

function evaluateHand(cards: Card[]): HandRank {
  // Generate all 5-card combinations from 7 cards
  const combos = getCombinations(cards, 5);
  let best: HandRank = { rank: -1, values: [] };
  for (const combo of combos) {
    const rank = rankFiveCards(combo);
    if (compareHands(rank, best) > 0) {
      best = rank;
    }
  }
  return best;
}

function getCombinations(arr: Card[], k: number): Card[][] {
  const result: Card[][] = [];
  function backtrack(start: number, combo: Card[]) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1, combo);
      combo.pop();
    }
  }
  backtrack(0, []);
  return result;
}

function rankFiveCards(cards: Card[]): HandRank {
  const ranks = cards.map((c) => RANK_VALUES[c[0] as Rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c[c.length - 1]);

  const isFlush = suits.every((s) => s === suits[0]);
  const isStraight = checkStraight(ranks);

  // Count rank occurrences
  const counts: Record<number, number> = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([val, count]) => ({ val: parseInt(val), count }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  if (isFlush && isStraight) {
    const high = isStraight;
    return { rank: 8, values: [high] }; // Straight flush
  }
  if (groups[0].count === 4) {
    return { rank: 7, values: [groups[0].val, groups[1].val] }; // Four of a kind
  }
  if (groups[0].count === 3 && groups[1].count === 2) {
    return { rank: 6, values: [groups[0].val, groups[1].val] }; // Full house
  }
  if (isFlush) {
    return { rank: 5, values: ranks }; // Flush
  }
  if (isStraight) {
    return { rank: 4, values: [isStraight] }; // Straight
  }
  if (groups[0].count === 3) {
    return { rank: 3, values: [groups[0].val, ...groups.slice(1).map((g) => g.val)] }; // Three of a kind
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairs = [groups[0].val, groups[1].val].sort((a, b) => b - a);
    return { rank: 2, values: [...pairs, groups[2].val] }; // Two pair
  }
  if (groups[0].count === 2) {
    return { rank: 1, values: [groups[0].val, ...groups.slice(1).map((g) => g.val)] }; // One pair
  }
  return { rank: 0, values: ranks }; // High card
}

function checkStraight(sortedRanks: number[]): number | false {
  // Check normal straight
  if (sortedRanks[0] - sortedRanks[4] === 4 && new Set(sortedRanks).size === 5) {
    return sortedRanks[0];
  }
  // Check wheel (A-2-3-4-5)
  if (
    sortedRanks[0] === 14 &&
    sortedRanks[1] === 5 &&
    sortedRanks[2] === 4 &&
    sortedRanks[3] === 3 &&
    sortedRanks[4] === 2
  ) {
    return 5;
  }
  return false;
}

function compareHands(a: HandRank, b: HandRank): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
    if ((a.values[i] || 0) !== (b.values[i] || 0)) return (a.values[i] || 0) - (b.values[i] || 0);
  }
  return 0;
}

function handRankName(rank: HandRank): string {
  const names = [
    'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
    'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
  ];
  return names[rank.rank] || 'Unknown';
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export const SUIT_DISPLAY: Record<string, { symbol: string; color: string }> = {
  h: { symbol: '\u2665', color: '#ef4444' },
  d: { symbol: '\u2666', color: '#ef4444' },
  c: { symbol: '\u2663', color: '#1a1a2e' },
  s: { symbol: '\u2660', color: '#1a1a2e' },
};

export const RANK_DISPLAY: Record<string, string> = {
  T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A',
  '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9',
};
