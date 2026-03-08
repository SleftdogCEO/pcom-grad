'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

type GamePhase = 'betting' | 'playing' | 'dealer-turn' | 'result';
type Result = 'blackjack' | 'win' | 'lose' | 'push' | 'bust' | null;

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CHIP_VALUES = [25, 50, 100, 500];

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<Suit, string> = {
  hearts: '#ef4444',
  diamonds: '#ef4444',
  clubs: '#1a1a2e',
  spades: '#1a1a2e',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < 6; d++) { // 6-deck shoe
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank, faceUp: true });
      }
    }
  }
  return shuffle(deck);
}

function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardValue(card: Card): number[] {
  if (card.rank === 'A') return [1, 11];
  if (['K', 'Q', 'J'].includes(card.rank)) return [10];
  return [parseInt(card.rank)];
}

function handValue(cards: Card[]): number {
  let totals = [0];
  for (const card of cards) {
    if (!card.faceUp) continue;
    const vals = cardValue(card);
    const newTotals: number[] = [];
    for (const t of totals) {
      for (const v of vals) {
        newTotals.push(t + v);
      }
    }
    totals = [...new Set(newTotals)];
  }
  const valid = totals.filter((t) => t <= 21);
  return valid.length > 0 ? Math.max(...valid) : Math.min(...totals);
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

function isBust(cards: Card[]): boolean {
  return handValue(cards) > 21;
}

function isSoft17(cards: Card[]): boolean {
  if (handValue(cards) !== 17) return false;
  const hasAce = cards.some((c) => c.rank === 'A');
  // Check if ace is counted as 11
  const withoutAce = cards.filter((c) => c.rank !== 'A');
  const rest = withoutAce.reduce((s, c) => s + cardValue(c)[0], 0);
  const aceCount = cards.filter((c) => c.rank === 'A').length;
  return hasAce && rest + aceCount - 1 + 11 === 17;
}

// ─── Dealer Avatars ──────────────────────────────────────────────────────────

const DEALERS = [
  { name: 'Dr. House', initials: 'DH', color: '#8B1A2B' },
  { name: 'Dr. Grey', initials: 'MG', color: '#6B21A8' },
  { name: 'Dr. Turk', initials: 'CT', color: '#0369A1' },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function BlackjackGame() {
  const [deck, setDeck] = useState<Card[]>(() => createDeck());
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [phase, setPhase] = useState<GamePhase>('betting');
  const [result, setResult] = useState<Result>(null);
  const [balance, setBalance] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pcom-bj-balance');
      return saved ? parseInt(saved) : 1000;
    }
    return 1000;
  });
  const [currentBet, setCurrentBet] = useState(0);
  const [resultMessage, setResultMessage] = useState('');
  const [dealer] = useState(() => DEALERS[Math.floor(Math.random() * DEALERS.length)]);
  const [playerName, setPlayerName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('guestName') || 'Player';
    }
    return 'Player';
  });
  const [dealtCards, setDealtCards] = useState(0); // for stagger animation
  const [showChipAnimation, setShowChipAnimation] = useState(false);
  const dealTimeouts = useRef<NodeJS.Timeout[]>([]);

  // Split state
  const [splitHand, setSplitHand] = useState<Card[]>([]);
  const [splitBet, setSplitBet] = useState(0);
  const [splitResult, setSplitResult] = useState<Result>(null);
  const [splitResultMessage, setSplitResultMessage] = useState('');
  const [activeSplit, setActiveSplit] = useState(false);
  const [isSplit, setIsSplit] = useState(false);

  // Refs for async/timeout access (avoids stale closures)
  const playerHandRef = useRef<Card[]>([]);
  const splitHandRef = useRef<Card[]>([]);
  const dealerHandRef = useRef<Card[]>([]);
  const deckRef = useRef<Card[]>([]);
  const currentBetRef = useRef(0);
  const splitBetRef = useRef(0);
  const isSplitRef = useRef(false);
  const activeSplitRef = useRef(false);

  // Persist balance
  useEffect(() => {
    localStorage.setItem('pcom-bj-balance', balance.toString());
  }, [balance]);

  // Load player name from localStorage
  useEffect(() => {
    const name = localStorage.getItem('guestName');
    if (name) setPlayerName(name);
  }, []);

  // Cleanup timeouts
  useEffect(() => {
    return () => dealTimeouts.current.forEach(clearTimeout);
  }, []);

  // Sync refs
  useEffect(() => { playerHandRef.current = playerHand; }, [playerHand]);
  useEffect(() => { splitHandRef.current = splitHand; }, [splitHand]);
  useEffect(() => { dealerHandRef.current = dealerHand; }, [dealerHand]);
  useEffect(() => { deckRef.current = deck; }, [deck]);
  useEffect(() => { currentBetRef.current = currentBet; }, [currentBet]);
  useEffect(() => { splitBetRef.current = splitBet; }, [splitBet]);
  useEffect(() => { isSplitRef.current = isSplit; }, [isSplit]);
  useEffect(() => { activeSplitRef.current = activeSplit; }, [activeSplit]);

  const drawCard = useCallback((faceUp = true): [Card, Card[]] => {
    const newDeck = [...deck];
    if (newDeck.length < 20) {
      const fresh = createDeck();
      newDeck.push(...fresh);
    }
    const card = { ...newDeck.pop()!, faceUp };
    return [card, newDeck];
  }, [deck]);

  const addBet = (amount: number) => {
    if (balance >= amount) {
      setCurrentBet((prev) => prev + amount);
      setBalance((prev) => prev - amount);
      setShowChipAnimation(true);
      setTimeout(() => setShowChipAnimation(false), 300);
    }
  };

  const clearBet = () => {
    setBalance((prev) => prev + currentBet);
    setCurrentBet(0);
  };

  const deal = useCallback(() => {
    if (currentBet === 0) return;

    setDealtCards(0);
    const newDeck = [...deck];
    if (newDeck.length < 20) newDeck.push(...createDeck());

    const p1 = { ...newDeck.pop()!, faceUp: true };
    const d1 = { ...newDeck.pop()!, faceUp: true };
    const p2 = { ...newDeck.pop()!, faceUp: true };
    const d2 = { ...newDeck.pop()!, faceUp: false };

    setDeck(newDeck);
    setPlayerHand([]);
    setDealerHand([]);
    setResult(null);
    setResultMessage('');
    setPhase('playing');

    // Staggered dealing animation
    const delays = [0, 200, 400, 600];
    dealTimeouts.current = [];

    dealTimeouts.current.push(setTimeout(() => {
      setPlayerHand([p1]);
      setDealtCards(1);
    }, delays[0]));

    dealTimeouts.current.push(setTimeout(() => {
      setDealerHand([d1]);
      setDealtCards(2);
    }, delays[1]));

    dealTimeouts.current.push(setTimeout(() => {
      setPlayerHand([p1, p2]);
      setDealtCards(3);
    }, delays[2]));

    dealTimeouts.current.push(setTimeout(() => {
      setDealerHand([d1, d2]);
      setDealtCards(4);

      // Check for immediate blackjack
      if (isBlackjack([p1, p2])) {
        const revealedD2 = { ...d2, faceUp: true };
        setDealerHand([d1, revealedD2]);
        if (isBlackjack([d1, revealedD2])) {
          setResult('push');
          setResultMessage('Both blackjack! Push.');
          setBalance((prev) => prev + currentBet);
          setPhase('result');
        } else {
          setResult('blackjack');
          setResultMessage('BLACKJACK! Pays 3:2!');
          setBalance((prev) => prev + currentBet + Math.floor(currentBet * 1.5));
          setPhase('result');
        }
      }
    }, delays[3]));
  }, [currentBet, deck]);

  // ─── Dealer Play (reads from refs for timeout safety) ─────────────────────
  const runDealer = () => {
    setPhase('dealer-turn');
    const mainHand = playerHandRef.current;
    const splitHd = splitHandRef.current;
    const hasSplit = isSplitRef.current;
    const mainBet = currentBetRef.current;
    const sBet = splitBetRef.current;
    const mainBusted = isBust(mainHand);
    const splitBusted = hasSplit ? isBust(splitHd) : true;

    const revealed = dealerHandRef.current.map((c) => ({ ...c, faceUp: true }));
    setDealerHand(revealed);

    if (mainBusted && splitBusted) {
      setPhase('result');
      return;
    }

    let curDealer = [...revealed];
    let curDeck = [...deckRef.current];
    const draws: Card[] = [];

    while (handValue(curDealer) < 17 || isSoft17(curDealer)) {
      if (curDeck.length < 5) curDeck.push(...createDeck());
      const card = { ...curDeck.pop()!, faceUp: true };
      curDealer.push(card);
      draws.push(card);
    }

    draws.forEach((card, i) => {
      dealTimeouts.current.push(setTimeout(() => {
        setDealerHand((prev) => [...prev, card]);
        setDealtCards((prev) => prev + 1);
      }, 400 + i * 500));
    });

    dealTimeouts.current.push(setTimeout(() => {
      setDeck(curDeck);
      const dVal = handValue(curDealer);
      const dBust = isBust(curDealer);

      // Evaluate main hand
      if (!mainBusted) {
        const pVal = handValue(mainHand);
        if (dBust) { setResult('win'); setResultMessage(hasSplit ? 'Dealer busts! Hand 1 wins!' : `Dealer busts with ${dVal}! You win!`); setBalance((p) => p + mainBet * 2); }
        else if (pVal > dVal) { setResult('win'); setResultMessage(hasSplit ? `Hand 1: ${pVal} beats ${dVal}!` : `${pVal} beats ${dVal}! You win!`); setBalance((p) => p + mainBet * 2); }
        else if (pVal < dVal) { setResult('lose'); setResultMessage(hasSplit ? `Hand 1: Dealer's ${dVal} beats ${pVal}.` : `Dealer's ${dVal} beats your ${pVal}.`); }
        else { setResult('push'); setResultMessage(hasSplit ? 'Hand 1: Push!' : 'Push! Bet returned.'); setBalance((p) => p + mainBet); }
      }

      // Evaluate split hand
      if (hasSplit && !splitBusted) {
        const sVal = handValue(splitHd);
        if (dBust) { setSplitResult('win'); setSplitResultMessage('Dealer busts! Hand 2 wins!'); setBalance((p) => p + sBet * 2); }
        else if (sVal > dVal) { setSplitResult('win'); setSplitResultMessage(`Hand 2: ${sVal} beats ${dVal}!`); setBalance((p) => p + sBet * 2); }
        else if (sVal < dVal) { setSplitResult('lose'); setSplitResultMessage(`Hand 2: Dealer's ${dVal} beats ${sVal}.`); }
        else { setSplitResult('push'); setSplitResultMessage('Hand 2: Push!'); setBalance((p) => p + sBet); }
      }

      setPhase('result');
    }, 400 + draws.length * 500 + 200));
  };

  // ─── Player Actions ─────────────────────────────────────────────────────────
  const hit = () => {
    const [card, newDeck] = drawCard(true);
    setDeck(newDeck);
    setDealtCards((prev) => prev + 1);

    if (isSplit && activeSplit) {
      const newHand = [...splitHand, card];
      setSplitHand(newHand);
      if (isBust(newHand)) {
        setSplitResult('bust');
        setSplitResultMessage('Hand 2 busts!');
        setTimeout(() => runDealer(), 600);
      }
    } else {
      const newHand = [...playerHand, card];
      setPlayerHand(newHand);
      if (isBust(newHand)) {
        if (isSplit) {
          setResult('bust');
          setResultMessage('Hand 1 busts!');
          setTimeout(() => setActiveSplit(true), 400);
        } else {
          setResult('bust');
          setResultMessage('Bust! Over 21.');
          setPhase('result');
        }
      }
    }
  };

  const stand = () => {
    if (isSplitRef.current && !activeSplitRef.current) {
      setActiveSplit(true);
      return;
    }
    runDealer();
  };

  const doubleDown = () => {
    const hand = isSplit && activeSplit ? splitHand : playerHand;
    const bet = isSplit && activeSplit ? splitBet : currentBet;

    if (balance >= bet && hand.length === 2) {
      setBalance((prev) => prev - bet);
      if (isSplit && activeSplit) {
        setSplitBet((prev) => prev * 2);
      } else {
        setCurrentBet((prev) => prev * 2);
      }
      const [card, newDeck] = drawCard(true);
      const newHand = [...hand, card];
      if (isSplit && activeSplit) {
        setSplitHand(newHand);
      } else {
        setPlayerHand(newHand);
      }
      setDeck(newDeck);
      setDealtCards((prev) => prev + 1);

      if (isBust(newHand)) {
        if (isSplit && activeSplit) {
          setSplitResult('bust');
          setSplitResultMessage('Hand 2 busts!');
          setTimeout(() => runDealer(), 600);
        } else if (isSplit) {
          setResult('bust');
          setResultMessage('Hand 1 busts!');
          setTimeout(() => setActiveSplit(true), 600);
        } else {
          setResult('bust');
          setResultMessage('Bust! Over 21.');
          setPhase('result');
        }
      } else {
        setTimeout(() => stand(), 600);
      }
    }
  };

  const handleSplit = () => {
    const card1 = playerHand[0];
    const card2 = playerHand[1];
    const newDeck = [...deck];
    if (newDeck.length < 5) newDeck.push(...createDeck());
    const deal1 = { ...newDeck.pop()!, faceUp: true };
    const deal2 = { ...newDeck.pop()!, faceUp: true };

    setPlayerHand([card1, deal1]);
    setSplitHand([card2, deal2]);
    setSplitBet(currentBet);
    setBalance((prev) => prev - currentBet);
    setDeck(newDeck);
    setIsSplit(true);
    setActiveSplit(false);
    setDealtCards((prev) => prev + 2);
  };

  const newRound = () => {
    setPhase('betting');
    setPlayerHand([]);
    setDealerHand([]);
    setCurrentBet(0);
    setResult(null);
    setResultMessage('');
    setDealtCards(0);
    setSplitHand([]);
    setSplitBet(0);
    setSplitResult(null);
    setSplitResultMessage('');
    setActiveSplit(false);
    setIsSplit(false);
    dealTimeouts.current.forEach(clearTimeout);
    dealTimeouts.current = [];
    if (balance <= 0) setBalance(1000);
  };

  const playerVal = handValue(playerHand);
  const splitVal = handValue(splitHand);
  const dealerVal = handValue(dealerHand);
  const activeHand = isSplit && activeSplit ? splitHand : playerHand;
  const activeBet = isSplit && activeSplit ? splitBet : currentBet;
  const canDouble = phase === 'playing' && activeHand.length === 2 && balance >= activeBet;
  const canSplit = phase === 'playing' && playerHand.length === 2 && !isSplit &&
    balance >= currentBet && cardValue(playerHand[0])[0] === cardValue(playerHand[1])[0];

  return (
    <div className="bj-page">
      {/* Back link */}
      <a href="/" className="bj-back">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </a>

      {/* Table */}
      <div className="bj-table">
        <div className="bj-felt">
          {/* Table markings */}
          <div className="bj-table-arc" />
          <div className="bj-table-text">BLACKJACK PAYS 3 TO 2</div>
          <div className="bj-table-subtext">Dealer must hit soft 17</div>
          <div className="bj-table-logo">PCOM &apos;26</div>

          {/* Dealer area */}
          <div className="bj-dealer-area">
            <div className="bj-avatar" style={{ background: dealer.color }}>
              <span>{dealer.initials}</span>
            </div>
            <div className="bj-dealer-name">{dealer.name}</div>
            <div className="bj-dealer-label">DEALER</div>

            <div className="bj-hand bj-dealer-hand">
              {dealerHand.map((card, i) => (
                <div
                  key={`d-${i}`}
                  className="bj-card-wrapper"
                  style={{
                    animationDelay: `${i * 0.15}s`,
                    marginLeft: i > 0 ? '-40px' : '0',
                    zIndex: i,
                  }}
                >
                  <CardComponent card={card} />
                </div>
              ))}
            </div>
            {dealerHand.length > 0 && (
              <div className="bj-hand-value bj-dealer-value">
                {dealerHand.every((c) => c.faceUp) ? dealerVal : '?'}
              </div>
            )}
          </div>

          {/* Betting circle */}
          <div className="bj-bet-circle">
            {currentBet > 0 && (
              <div className={`bj-bet-display ${showChipAnimation ? 'bj-chip-bounce' : ''}`}>
                <div className="bj-chip-stack">
                  {getChipBreakdown(currentBet).map((chip, i) => (
                    <div
                      key={i}
                      className="bj-chip-mini"
                      style={{
                        background: CHIP_COLORS[chip],
                        bottom: `${i * 4}px`,
                      }}
                    />
                  ))}
                </div>
                <span className="bj-bet-amount">${currentBet}</span>
              </div>
            )}
          </div>

          {/* Player area */}
          <div className="bj-player-area">
            <div className={`bj-hands-row ${isSplit ? 'bj-hands-split' : ''}`}>
              <div className={`bj-hand-col ${isSplit && !activeSplit && phase === 'playing' ? 'bj-hand-active' : ''} ${isSplit && activeSplit ? 'bj-hand-dim' : ''}`}>
                {isSplit && <div className="bj-hand-label">Hand 1</div>}
                <div className="bj-hand bj-player-hand">
                  {playerHand.map((card, i) => (
                    <div key={`p-${i}`} className="bj-card-wrapper" style={{ animationDelay: `${i * 0.15}s`, marginLeft: i > 0 ? '-40px' : '0', zIndex: i }}>
                      <CardComponent card={card} />
                    </div>
                  ))}
                </div>
                {playerHand.length > 0 && (
                  <div className={`bj-hand-value bj-player-value ${isBust(playerHand) ? 'bj-bust' : ''}`}>{playerVal}</div>
                )}
              </div>
              {isSplit && (
                <div className={`bj-hand-col ${activeSplit && phase === 'playing' ? 'bj-hand-active' : ''} ${!activeSplit ? 'bj-hand-dim' : ''}`}>
                  <div className="bj-hand-label">Hand 2</div>
                  <div className="bj-hand bj-player-hand">
                    {splitHand.map((card, i) => (
                      <div key={`s-${i}`} className="bj-card-wrapper" style={{ animationDelay: `${i * 0.15}s`, marginLeft: i > 0 ? '-40px' : '0', zIndex: i }}>
                        <CardComponent card={card} />
                      </div>
                    ))}
                  </div>
                  {splitHand.length > 0 && (
                    <div className={`bj-hand-value bj-player-value ${isBust(splitHand) ? 'bj-bust' : ''}`}>{splitVal}</div>
                  )}
                </div>
              )}
            </div>

            <div className="bj-player-info">
              <div className="bj-avatar bj-avatar-player">
                <span>{playerName.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="bj-player-name">{playerName}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bj-controls">
        {/* Result banner */}
        {phase === 'result' && (
          <>
            <div className={`bj-result ${result === 'win' || result === 'blackjack' ? 'bj-result-win' : result === 'push' ? 'bj-result-push' : 'bj-result-lose'}`}>
              <div className="bj-result-text">{resultMessage}</div>
              {(result === 'win' || result === 'blackjack') && (
                <div className="bj-result-amount">
                  +${result === 'blackjack' ? Math.floor(currentBet * 1.5) : currentBet}
                </div>
              )}
            </div>
            {isSplit && splitResultMessage && (
              <div className={`bj-result ${splitResult === 'win' ? 'bj-result-win' : splitResult === 'push' ? 'bj-result-push' : 'bj-result-lose'}`}>
                <div className="bj-result-text">{splitResultMessage}</div>
                {splitResult === 'win' && (
                  <div className="bj-result-amount">+${splitBet}</div>
                )}
              </div>
            )}
          </>
        )}

        {/* Balance */}
        <div className="bj-balance-bar">
          <div className="bj-balance">
            <span className="bj-balance-label">PCOM Bucks</span>
            <span className="bj-balance-amount">${balance.toLocaleString()}</span>
          </div>
          {phase === 'betting' && currentBet > 0 && (
            <div className="bj-current-bet">
              Bet: <strong>${currentBet}</strong>
            </div>
          )}
        </div>

        {/* Betting phase */}
        {phase === 'betting' && (
          <div className="bj-betting">
            <div className="bj-chips">
              {CHIP_VALUES.map((val) => (
                <button
                  key={val}
                  onClick={() => addBet(val)}
                  disabled={balance < val}
                  className="bj-chip"
                  style={{ background: CHIP_COLORS[val] }}
                  data-value={val}
                >
                  <span className="bj-chip-inner">${val}</span>
                </button>
              ))}
            </div>
            <div className="bj-bet-actions">
              <button onClick={clearBet} disabled={currentBet === 0} className="bj-btn bj-btn-secondary">
                Clear
              </button>
              <button onClick={deal} disabled={currentBet === 0} className="bj-btn bj-btn-primary">
                Deal
              </button>
            </div>
          </div>
        )}

        {/* Playing phase */}
        {phase === 'playing' && (
          <div className="bj-actions">
            <button onClick={hit} className="bj-btn bj-btn-action">
              Hit
            </button>
            <button onClick={stand} className="bj-btn bj-btn-action bj-btn-stand">
              Stand
            </button>
            {canDouble && (
              <button onClick={doubleDown} className="bj-btn bj-btn-action bj-btn-double">
                Double
              </button>
            )}
            {canSplit && (
              <button onClick={handleSplit} className="bj-btn bj-btn-action bj-btn-split">
                Split
              </button>
            )}
          </div>
        )}

        {/* Dealer turn */}
        {phase === 'dealer-turn' && (
          <div className="bj-waiting">
            <div className="bj-waiting-dots">
              <span />
              <span />
              <span />
            </div>
            Dealer&apos;s turn...
          </div>
        )}

        {/* Result phase */}
        {phase === 'result' && (
          <div className="bj-result-actions">
            <button onClick={newRound} className="bj-btn bj-btn-primary bj-btn-large">
              {balance <= 0 ? 'New Game ($1,000)' : 'Play Again'}
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        /* ─── Page ─────────────────────────────────── */
        .bj-page {
          min-height: 100dvh;
          background: #0a0a12;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .bj-back {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 50;
          color: rgba(255,255,255,0.4);
          text-decoration: none;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: color 0.2s;
        }
        .bj-back:hover { color: rgba(255,255,255,0.8); }

        /* ─── Table ────────────────────────────────── */
        .bj-table {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 60px 16px 16px;
          perspective: 800px;
        }

        .bj-felt {
          width: 100%;
          max-width: 700px;
          height: 480px;
          background:
            radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.3) 0%, transparent 70%),
            radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.05) 0%, transparent 50%),
            linear-gradient(180deg, #0d5a2d 0%, #0a4a24 40%, #07391a 100%);
          border-radius: 200px 200px 20px 20px;
          border: 8px solid #2a1a0a;
          box-shadow:
            inset 0 0 60px rgba(0,0,0,0.4),
            inset 0 0 120px rgba(0,0,0,0.2),
            0 0 0 4px #1a0f05,
            0 0 0 8px #3a2815,
            0 20px 60px rgba(0,0,0,0.6);
          position: relative;
          overflow: hidden;
          transform: rotateX(5deg);
          transform-origin: bottom center;
        }

        /* Felt texture overlay */
        .bj-felt::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          opacity: 0.03;
          mix-blend-mode: overlay;
          pointer-events: none;
        }

        .bj-table-arc {
          position: absolute;
          top: 60%;
          left: 50%;
          transform: translateX(-50%);
          width: 75%;
          height: 50%;
          border: 2px solid rgba(201, 169, 78, 0.15);
          border-radius: 50% 50% 0 0;
          border-bottom: none;
          pointer-events: none;
        }

        .bj-table-text {
          position: absolute;
          top: 40%;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(201, 169, 78, 0.2);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          white-space: nowrap;
          pointer-events: none;
        }

        .bj-table-subtext {
          position: absolute;
          top: calc(40% + 22px);
          left: 50%;
          transform: translateX(-50%);
          color: rgba(255, 255, 255, 0.1);
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          white-space: nowrap;
          pointer-events: none;
        }

        .bj-table-logo {
          position: absolute;
          bottom: 12px;
          right: 20px;
          color: rgba(201, 169, 78, 0.12);
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 3px;
          pointer-events: none;
        }

        /* ─── Dealer ───────────────────────────────── */
        .bj-dealer-area {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .bj-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 800;
          color: white;
          border: 3px solid rgba(255,255,255,0.2);
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }

        .bj-avatar-player {
          background: linear-gradient(135deg, #C9A94E, #8B6914);
        }

        .bj-dealer-name {
          color: rgba(255,255,255,0.6);
          font-size: 12px;
          font-weight: 600;
        }

        .bj-dealer-label {
          color: rgba(201, 169, 78, 0.4);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
        }

        .bj-dealer-hand {
          margin-top: 8px;
        }

        /* ─── Hands ────────────────────────────────── */
        .bj-hand {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 110px;
        }

        .bj-card-wrapper {
          animation: dealCard 0.3s ease-out both;
          position: relative;
          filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
        }

        @keyframes dealCard {
          from {
            opacity: 0;
            transform: translateY(-60px) scale(0.7) rotateY(90deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1) rotateY(0deg);
          }
        }

        .bj-hand-value {
          text-align: center;
          font-size: 18px;
          font-weight: 800;
          color: white;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 4px 16px;
          border-radius: 20px;
          display: inline-block;
          margin: 0 auto;
        }

        .bj-dealer-value {
          margin-top: 4px;
        }

        .bj-player-value {
          margin-bottom: 4px;
        }

        .bj-bust {
          background: rgba(239, 68, 68, 0.4);
          border-color: rgba(239, 68, 68, 0.5);
          color: #fca5a5;
        }

        /* ─── Bet Circle ──────────────────────────── */
        .bj-bet-circle {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 2px dashed rgba(201, 169, 78, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .bj-bet-display {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .bj-chip-bounce {
          animation: chipBounce 0.3s ease-out;
        }

        @keyframes chipBounce {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }

        .bj-chip-stack {
          position: relative;
          width: 32px;
          height: 32px;
        }

        .bj-chip-mini {
          position: absolute;
          width: 32px;
          height: 6px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.3);
          left: 0;
        }

        .bj-bet-amount {
          font-size: 12px;
          font-weight: 800;
          color: #C9A94E;
        }

        /* ─── Player Area ─────────────────────────── */
        .bj-player-area {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .bj-player-hand {
          margin-bottom: 4px;
        }

        .bj-player-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .bj-player-info .bj-avatar {
          width: 36px;
          height: 36px;
          font-size: 13px;
        }

        .bj-player-name {
          color: rgba(255,255,255,0.5);
          font-size: 11px;
          font-weight: 600;
        }

        /* ─── Controls ────────────────────────────── */
        .bj-controls {
          padding: 12px 16px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .bj-balance-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          width: 100%;
          max-width: 400px;
        }

        .bj-balance {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .bj-balance-label {
          font-size: 10px;
          color: rgba(255,255,255,0.3);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 600;
        }

        .bj-balance-amount {
          font-size: 24px;
          font-weight: 800;
          color: #C9A94E;
          font-variant-numeric: tabular-nums;
        }

        .bj-current-bet {
          font-size: 14px;
          color: rgba(255,255,255,0.5);
        }
        .bj-current-bet strong {
          color: white;
        }

        /* ─── Chips ────────────────────────────────── */
        .bj-betting {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .bj-chips {
          display: flex;
          gap: 10px;
        }

        .bj-chip {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          border: 3px dashed rgba(255,255,255,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow:
            inset 0 2px 4px rgba(255,255,255,0.2),
            inset 0 -2px 4px rgba(0,0,0,0.3),
            0 4px 12px rgba(0,0,0,0.4);
        }

        .bj-chip:hover:not(:disabled) {
          transform: translateY(-4px) scale(1.05);
          box-shadow:
            inset 0 2px 4px rgba(255,255,255,0.2),
            inset 0 -2px 4px rgba(0,0,0,0.3),
            0 8px 20px rgba(0,0,0,0.5);
        }

        .bj-chip:active:not(:disabled) {
          transform: translateY(0) scale(0.95);
        }

        .bj-chip:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .bj-chip-inner {
          font-size: 13px;
          font-weight: 800;
          color: white;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }

        /* ─── Buttons ──────────────────────────────── */
        .bj-bet-actions {
          display: flex;
          gap: 10px;
        }

        .bj-btn {
          padding: 12px 32px;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: all 0.15s;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .bj-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .bj-btn-primary {
          background: linear-gradient(135deg, #8B1A2B, #a62040);
          color: white;
          box-shadow: 0 4px 16px rgba(139, 26, 43, 0.4);
        }
        .bj-btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(139, 26, 43, 0.6);
        }

        .bj-btn-secondary {
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.6);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .bj-btn-secondary:hover:not(:disabled) {
          background: rgba(255,255,255,0.12);
          color: white;
        }

        .bj-actions {
          display: flex;
          gap: 10px;
        }

        .bj-btn-action {
          padding: 14px 40px;
          font-size: 16px;
          background: linear-gradient(135deg, #C9A94E, #8B6914);
          color: #1a1a2e;
          border-radius: 16px;
          box-shadow: 0 4px 16px rgba(201, 169, 78, 0.3);
        }
        .bj-btn-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(201, 169, 78, 0.5);
        }

        .bj-btn-stand {
          background: linear-gradient(135deg, #8B1A2B, #a62040);
          color: white;
          box-shadow: 0 4px 16px rgba(139, 26, 43, 0.4);
        }
        .bj-btn-stand:hover {
          box-shadow: 0 6px 24px rgba(139, 26, 43, 0.6);
        }

        .bj-btn-double {
          background: linear-gradient(135deg, #0ea5e9, #0369a1);
          color: white;
          box-shadow: 0 4px 16px rgba(14, 165, 233, 0.3);
        }

        .bj-btn-split {
          background: linear-gradient(135deg, #a855f7, #7c3aed);
          color: white;
          box-shadow: 0 4px 16px rgba(168, 85, 247, 0.3);
        }

        /* ─── Split Hands ─────────────────────────────── */
        .bj-hands-row { display: flex; justify-content: center; }
        .bj-hands-split { gap: 24px; }
        .bj-hand-col { display: flex; flex-direction: column; align-items: center; gap: 4px; transition: opacity 0.3s; }
        .bj-hand-dim { opacity: 0.4; }
        .bj-hand-active { box-shadow: 0 0 0 2px rgba(201,169,78,0.4); border-radius: 12px; padding: 4px 8px; background: rgba(201,169,78,0.05); }
        .bj-hand-label { font-size: 10px; font-weight: 700; color: rgba(201,169,78,0.6); text-transform: uppercase; letter-spacing: 1px; }

        .bj-btn-large {
          padding: 16px 48px;
          font-size: 17px;
        }

        /* ─── Result ───────────────────────────────── */
        .bj-result {
          padding: 12px 24px;
          border-radius: 16px;
          text-align: center;
          animation: resultSlide 0.4s ease-out;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        @keyframes resultSlide {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .bj-result-win {
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .bj-result-win .bj-result-text { color: #86efac; }
        .bj-result-win .bj-result-amount { color: #4ade80; font-weight: 800; font-size: 18px; }

        .bj-result-lose {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .bj-result-lose .bj-result-text { color: #fca5a5; }

        .bj-result-push {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .bj-result-push .bj-result-text { color: rgba(255,255,255,0.6); }

        .bj-result-text {
          font-size: 15px;
          font-weight: 700;
        }

        .bj-result-actions {
          display: flex;
          justify-content: center;
        }

        /* ─── Waiting ──────────────────────────────── */
        .bj-waiting {
          color: rgba(255,255,255,0.4);
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .bj-waiting-dots {
          display: flex;
          gap: 3px;
        }

        .bj-waiting-dots span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(201, 169, 78, 0.5);
          animation: dotPulse 1.2s ease-in-out infinite;
        }
        .bj-waiting-dots span:nth-child(2) { animation-delay: 0.2s; }
        .bj-waiting-dots span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes dotPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        /* ─── Mobile ───────────────────────────────── */
        @media (max-width: 640px) {
          .bj-felt {
            height: 400px;
            border-radius: 140px 140px 16px 16px;
            border-width: 5px;
          }
          .bj-felt::after {
            display: none;
          }
          .bj-chip {
            width: 52px;
            height: 52px;
          }
          .bj-chip-inner {
            font-size: 11px;
          }
          .bj-btn-action {
            padding: 12px 28px;
            font-size: 14px;
          }
          .bj-table-text {
            font-size: 9px;
            letter-spacing: 2px;
          }
          .bj-avatar {
            width: 40px;
            height: 40px;
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Card Component ─────────────────────────────────────────────────────────

function CardComponent({ card }: { card: Card }) {
  if (!card.faceUp) {
    return (
      <div className="playing-card card-back">
        <div className="card-back-pattern" />
        <style jsx>{`
          .playing-card {
            width: 75px;
            height: 108px;
            border-radius: 8px;
            position: relative;
            transform-style: preserve-3d;
          }
          .card-back {
            background: linear-gradient(135deg, #8B1A2B, #5a1118);
            border: 2px solid rgba(255,255,255,0.15);
            overflow: hidden;
          }
          .card-back-pattern {
            position: absolute;
            inset: 6px;
            border-radius: 4px;
            border: 2px solid rgba(201, 169, 78, 0.3);
            background:
              repeating-linear-gradient(
                45deg,
                transparent,
                transparent 5px,
                rgba(201, 169, 78, 0.05) 5px,
                rgba(201, 169, 78, 0.05) 10px
              );
          }
        `}</style>
      </div>
    );
  }

  const symbol = SUIT_SYMBOLS[card.suit];
  const color = SUIT_COLORS[card.suit];
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className="playing-card card-face">
      <div className="card-corner card-top">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit-small">{symbol}</span>
      </div>
      <div className="card-center">
        <span className="card-suit-large">{symbol}</span>
      </div>
      <div className="card-corner card-bottom">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit-small">{symbol}</span>
      </div>
      <style jsx>{`
        .playing-card {
          width: 75px;
          height: 108px;
          border-radius: 8px;
          position: relative;
        }
        .card-face {
          background: linear-gradient(170deg, #ffffff 0%, #f0f0f0 100%);
          border: 1px solid rgba(0,0,0,0.12);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .card-corner {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1;
        }
        .card-top {
          top: 5px;
          left: 6px;
        }
        .card-bottom {
          bottom: 5px;
          right: 6px;
          transform: rotate(180deg);
        }
        .card-rank {
          font-size: 15px;
          font-weight: 800;
          color: ${color};
        }
        .card-suit-small {
          font-size: 12px;
          color: ${color};
          margin-top: -2px;
        }
        .card-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .card-suit-large {
          font-size: 32px;
          color: ${isRed ? '#ef4444' : '#1a1a2e'};
        }
      `}</style>
    </div>
  );
}

// ─── Chip helpers ────────────────────────────────────────────────────────────

const CHIP_COLORS: Record<number, string> = {
  25: 'linear-gradient(135deg, #22c55e, #16a34a)',
  50: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  100: 'linear-gradient(135deg, #1a1a2e, #0f0f1a)',
  500: 'linear-gradient(135deg, #a855f7, #7c3aed)',
};

function getChipBreakdown(amount: number): number[] {
  const chips: number[] = [];
  let remaining = amount;
  for (const val of [500, 100, 50, 25]) {
    while (remaining >= val) {
      chips.push(val);
      remaining -= val;
    }
  }
  return chips.slice(0, 6); // Max 6 chips shown
}
