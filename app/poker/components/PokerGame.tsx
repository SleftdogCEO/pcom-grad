'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  type GameState, type Card, type Phase,
  createInitialState, addPlayer, rebuy, dealNewHand,
  fold, check, call, raise, allIn,
  SUIT_DISPLAY, RANK_DISPLAY,
} from '../lib/engine';

const ROOM_ID = 'pcom-main';
const DEFAULT_BUY_IN = 1000;
const BLIND_LEVELS = [
  { small: 10, big: 20 },
  { small: 25, big: 50 },
  { small: 50, big: 100 },
];

export default function PokerGame() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [buyInAmount, setBuyInAmount] = useState(DEFAULT_BUY_IN);
  const [raiseInput, setRaiseInput] = useState('');
  const [showRaise, setShowRaise] = useState(false);
  const [joined, setJoined] = useState(false);
  const stateRef = useRef<GameState | null>(null);

  // Load name from main site
  useEffect(() => {
    const name = localStorage.getItem('guestName');
    if (name) {
      setMyName(name);
      setNameInput(name);
    }
  }, []);

  // Load or create room
  useEffect(() => {
    if (!supabase) return;

    async function loadRoom() {
      const { data } = await supabase!.from('poker_rooms').select('game_state').eq('id', ROOM_ID).single();
      if (data) {
        const gs = data.game_state as GameState;
        setGameState(gs);
        stateRef.current = gs;
      } else {
        const initial = createInitialState();
        await supabase!.from('poker_rooms').insert({ id: ROOM_ID, game_state: initial });
        setGameState(initial);
        stateRef.current = initial;
      }
    }

    loadRoom();

    // Subscribe to realtime
    const channel = supabase
      .channel('poker-room')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'poker_rooms',
        filter: `id=eq.${ROOM_ID}`,
      }, (payload) => {
        const gs = (payload.new as { game_state: GameState }).game_state;
        setGameState(gs);
        stateRef.current = gs;
      })
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, []);

  const updateState = useCallback(async (newState: GameState) => {
    if (!supabase) return;
    setGameState(newState);
    stateRef.current = newState;
    await supabase.from('poker_rooms').update({
      game_state: newState,
      updated_at: new Date().toISOString(),
    }).eq('id', ROOM_ID);
  }, []);

  const handleJoin = async () => {
    const name = nameInput.trim();
    if (!name || !gameState) return;
    setMyName(name);
    localStorage.setItem('guestName', name);

    const existing = gameState.players.find((p) => p.name === name);
    if (existing) {
      setJoined(true);
      return;
    }

    const newState = addPlayer(gameState, name, buyInAmount);
    await updateState(newState);
    setJoined(true);
  };

  const handleRebuy = async () => {
    if (!myName || !gameState) return;
    const newState = rebuy(gameState, myName, buyInAmount);
    await updateState(newState);
  };

  const handleDeal = async () => {
    if (!gameState) return;
    const newState = dealNewHand(gameState);
    await updateState(newState);
  };

  const handleFold = async () => {
    if (!myName || !gameState) return;
    await updateState(fold(gameState, myName));
  };

  const handleCheck = async () => {
    if (!myName || !gameState) return;
    await updateState(check(gameState, myName));
  };

  const handleCall = async () => {
    if (!myName || !gameState) return;
    await updateState(call(gameState, myName));
  };

  const handleRaise = async () => {
    if (!myName || !gameState) return;
    const amount = parseInt(raiseInput);
    if (isNaN(amount)) return;
    await updateState(raise(gameState, myName, amount));
    setShowRaise(false);
    setRaiseInput('');
  };

  const handleAllIn = async () => {
    if (!myName || !gameState) return;
    await updateState(allIn(gameState, myName));
  };

  if (!gameState) {
    return (
      <div className="pk-page">
        <div className="pk-loading">Loading table...</div>
      </div>
    );
  }

  const me = gameState.players.find((p) => p.name === myName);
  const isMyTurn = me && gameState.currentTurn >= 0 && gameState.players[gameState.currentTurn]?.name === myName;
  const maxBet = Math.max(0, ...gameState.players.filter((p) => !p.folded).map((p) => p.bet));
  const canCheck = isMyTurn && me && me.bet >= maxBet;
  const callAmount = me ? Math.min(maxBet - me.bet, me.chips) : 0;
  const minRaiseTotal = maxBet + gameState.minRaise;
  const activePlayers = gameState.players.filter((p) => p.chips > 0 && !p.sittingOut);
  const canDeal = gameState.phase === 'waiting' || gameState.phase === 'showdown';
  const canStartGame = canDeal && activePlayers.length >= 2;

  // If not joined, show join screen
  if (!joined && !me) {
    return (
      <div className="pk-page">
        <a href="/" className="pk-back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </a>
        <div className="pk-join">
          <div className="pk-join-card">
            <div style={{ fontSize: 48, marginBottom: 8 }}>&#x1F0A1;</div>
            <h1>PCOM Poker Night</h1>
            <p>Texas Hold&apos;em &bull; No Limit</p>

            <div className="pk-join-form">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your name"
                className="pk-input"
                autoFocus
              />
              <div className="pk-buyin-picker">
                <span className="pk-buyin-label">Buy-in</span>
                <div className="pk-buyin-options">
                  {[500, 1000, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setBuyInAmount(amt)}
                      className={`pk-buyin-btn ${buyInAmount === amt ? 'pk-buyin-active' : ''}`}
                    >
                      ${amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleJoin}
                disabled={!nameInput.trim()}
                className="pk-btn pk-btn-primary"
              >
                Take a Seat
              </button>
            </div>

            {gameState.players.length > 0 && (
              <div className="pk-seated">
                <span className="pk-seated-label">At the table:</span>
                {gameState.players.map((p) => (
                  <span key={p.name} className="pk-seated-name">{p.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  // If me exists but not "joined" state, auto-join
  if (me && !joined) setJoined(true);

  return (
    <div className="pk-page">
      <a href="/" className="pk-back">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </a>

      {/* Table */}
      <div className="pk-table-wrap">
        <div className="pk-table">
          <div className="pk-felt">
            {/* Pot */}
            <div className="pk-pot">
              {gameState.pot > 0 && (
                <>
                  <div className="pk-pot-chips" />
                  <span className="pk-pot-amount">Pot: ${gameState.pot.toLocaleString()}</span>
                </>
              )}
            </div>

            {/* Community cards */}
            <div className="pk-community">
              {gameState.community.map((card, i) => (
                <div key={i} className="pk-card-deal" style={{ animationDelay: `${i * 0.1}s` }}>
                  <PokerCard card={card} />
                </div>
              ))}
              {/* Placeholder slots */}
              {Array.from({ length: 5 - gameState.community.length }).map((_, i) => (
                <div key={`empty-${i}`} className="pk-card-slot" />
              ))}
            </div>

            {/* Phase label */}
            <div className="pk-phase">
              {gameState.phase === 'waiting' ? 'Waiting for deal...' :
               gameState.phase === 'showdown' ? '' :
               gameState.phase.toUpperCase()}
            </div>

            {/* Player seats */}
            {gameState.players.map((player, idx) => {
              const isMe = player.name === myName;
              const isTurn = gameState.currentTurn === idx;
              const seatPos = getSeatPosition(idx, gameState.players.length);

              return (
                <div
                  key={player.name}
                  className={`pk-seat ${isTurn ? 'pk-seat-active' : ''} ${player.folded ? 'pk-seat-folded' : ''}`}
                  style={{ left: `${seatPos.x}%`, top: `${seatPos.y}%` }}
                >
                  {/* Cards */}
                  <div className="pk-seat-cards">
                    {player.hand.length === 2 && (
                      <>
                        <div className="pk-seat-card">
                          {isMe || gameState.phase === 'showdown' ? (
                            <PokerCard card={player.hand[0]} small />
                          ) : (
                            <CardBack small />
                          )}
                        </div>
                        <div className="pk-seat-card" style={{ marginLeft: -12 }}>
                          {isMe || gameState.phase === 'showdown' ? (
                            <PokerCard card={player.hand[1]} small />
                          ) : (
                            <CardBack small />
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Avatar */}
                  <div className={`pk-avatar ${isMe ? 'pk-avatar-me' : ''}`}>
                    {player.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="pk-seat-name">{player.name}</div>
                  <div className="pk-seat-chips">${player.chips.toLocaleString()}</div>

                  {/* Bet */}
                  {player.bet > 0 && (
                    <div className="pk-seat-bet">
                      <div className="pk-bet-chip" />
                      ${player.bet}
                    </div>
                  )}

                  {/* Action label */}
                  {player.lastAction && (
                    <div className={`pk-action-label pk-action-${player.lastAction}`}>
                      {player.lastAction}
                    </div>
                  )}

                  {/* Dealer chip */}
                  {gameState.dealer === idx && gameState.phase !== 'waiting' && (
                    <div className="pk-dealer-chip">D</div>
                  )}
                </div>
              );
            })}

            {/* Winners */}
            {gameState.winners && gameState.winners.length > 0 && (
              <div className="pk-winners">
                {gameState.winners.map((w, i) => (
                  <div key={i} className="pk-winner-banner">
                    <strong>{w.name}</strong> wins ${w.amount.toLocaleString()}
                    <span className="pk-winner-hand">{w.hand}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Table branding */}
            <div className="pk-table-brand">PCOM &apos;26 POKER</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="pk-controls">
        {/* My info */}
        {me && (
          <div className="pk-my-info">
            <span className="pk-my-chips">${me.chips.toLocaleString()}</span>
            {me.chips <= 0 && gameState.phase === 'waiting' || gameState.phase === 'showdown' && (
              <button onClick={handleRebuy} className="pk-btn pk-btn-rebuy">
                Rebuy ${buyInAmount.toLocaleString()}
              </button>
            )}
          </div>
        )}

        {/* Deal button */}
        {canStartGame && (
          <button onClick={handleDeal} className="pk-btn pk-btn-deal">
            {gameState.handNumber === 0 ? 'Start Game' : 'Deal Next Hand'}
          </button>
        )}

        {/* Action buttons */}
        {isMyTurn && !me!.folded && gameState.phase !== 'showdown' && (
          <div className="pk-actions">
            <button onClick={handleFold} className="pk-btn pk-btn-fold">Fold</button>

            {canCheck ? (
              <button onClick={handleCheck} className="pk-btn pk-btn-check">Check</button>
            ) : (
              <button onClick={handleCall} className="pk-btn pk-btn-call">
                Call ${callAmount}
              </button>
            )}

            {!showRaise ? (
              <button onClick={() => { setShowRaise(true); setRaiseInput(String(minRaiseTotal)); }} className="pk-btn pk-btn-raise">
                Raise
              </button>
            ) : (
              <div className="pk-raise-controls">
                <input
                  type="number"
                  value={raiseInput}
                  onChange={(e) => setRaiseInput(e.target.value)}
                  min={minRaiseTotal}
                  max={me!.chips + me!.bet}
                  className="pk-raise-input"
                  autoFocus
                />
                <button onClick={handleRaise} className="pk-btn pk-btn-raise-confirm">
                  Raise to ${raiseInput}
                </button>
              </div>
            )}

            <button onClick={handleAllIn} className="pk-btn pk-btn-allin">
              All In
            </button>
          </div>
        )}

        {/* Waiting message */}
        {gameState.phase !== 'waiting' && gameState.phase !== 'showdown' && !isMyTurn && me && !me.folded && (
          <div className="pk-waiting-msg">
            Waiting for {gameState.players[gameState.currentTurn]?.name || '...'}
          </div>
        )}

        {me && me.folded && gameState.phase !== 'showdown' && gameState.phase !== 'waiting' && (
          <div className="pk-waiting-msg pk-folded-msg">You folded this hand</div>
        )}
      </div>

      <style jsx>{styles}</style>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PokerCard({ card, small }: { card: Card; small?: boolean }) {
  const rank = card.length === 3 ? card.slice(0, 2) : card[0];
  const suit = card[card.length - 1];
  const display = SUIT_DISPLAY[suit];
  const rankStr = RANK_DISPLAY[rank] || rank;
  const isRed = suit === 'h' || suit === 'd';

  return (
    <div className={`pkc ${small ? 'pkc-sm' : ''}`}>
      <span className="pkc-rank" style={{ color: isRed ? '#ef4444' : '#1a1a2e' }}>{rankStr}</span>
      <span className="pkc-suit" style={{ color: display?.color }}>{display?.symbol}</span>
      <style jsx>{`
        .pkc {
          width: 56px; height: 80px; border-radius: 6px;
          background: linear-gradient(170deg, #fff 0%, #f0f0f0 100%);
          border: 1px solid rgba(0,0,0,0.12);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          position: relative;
        }
        .pkc-sm { width: 42px; height: 60px; }
        .pkc-rank { font-size: 18px; font-weight: 800; line-height: 1; }
        .pkc-sm .pkc-rank { font-size: 14px; }
        .pkc-suit { font-size: 20px; margin-top: -2px; }
        .pkc-sm .pkc-suit { font-size: 14px; }
      `}</style>
    </div>
  );
}

function CardBack({ small }: { small?: boolean }) {
  return (
    <div className={`pkc-back ${small ? 'pkc-back-sm' : ''}`}>
      <style jsx>{`
        .pkc-back {
          width: 56px; height: 80px; border-radius: 6px;
          background: linear-gradient(135deg, #8B1A2B, #5a1118);
          border: 2px solid rgba(255,255,255,0.15);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          position: relative; overflow: hidden;
        }
        .pkc-back::after {
          content: ''; position: absolute; inset: 4px; border-radius: 3px;
          border: 1px solid rgba(201,169,78,0.3);
          background: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(201,169,78,0.05) 4px, rgba(201,169,78,0.05) 8px);
        }
        .pkc-back-sm { width: 42px; height: 60px; }
      `}</style>
    </div>
  );
}

// ─── Seat positioning ────────────────────────────────────────────────────────

function getSeatPosition(index: number, total: number): { x: number; y: number } {
  // Arrange seats in an oval around the table
  const positions: Record<number, { x: number; y: number }[]> = {
    1: [{ x: 50, y: 85 }],
    2: [{ x: 25, y: 85 }, { x: 75, y: 85 }],
    3: [{ x: 50, y: 85 }, { x: 10, y: 45 }, { x: 90, y: 45 }],
    4: [{ x: 30, y: 85 }, { x: 70, y: 85 }, { x: 10, y: 35 }, { x: 90, y: 35 }],
    5: [{ x: 50, y: 88 }, { x: 10, y: 65 }, { x: 10, y: 25 }, { x: 90, y: 25 }, { x: 90, y: 65 }],
    6: [{ x: 30, y: 88 }, { x: 70, y: 88 }, { x: 5, y: 50 }, { x: 30, y: 8 }, { x: 70, y: 8 }, { x: 95, y: 50 }],
    7: [{ x: 50, y: 88 }, { x: 15, y: 78 }, { x: 5, y: 40 }, { x: 25, y: 5 }, { x: 75, y: 5 }, { x: 95, y: 40 }, { x: 85, y: 78 }],
    8: [{ x: 30, y: 88 }, { x: 70, y: 88 }, { x: 5, y: 65 }, { x: 5, y: 30 }, { x: 30, y: 5 }, { x: 70, y: 5 }, { x: 95, y: 30 }, { x: 95, y: 65 }],
  };
  const layout = positions[total] || positions[8]!;
  return layout[index] || { x: 50, y: 50 };
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = `
  .pk-page {
    min-height: 100dvh;
    background: #0a0a12;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: white;
    overflow: hidden;
  }

  .pk-back {
    position: fixed; top: 12px; left: 12px; z-index: 50;
    color: rgba(255,255,255,0.4); text-decoration: none;
    font-size: 14px; display: flex; align-items: center; gap: 4px;
  }
  .pk-back:hover { color: rgba(255,255,255,0.8); }

  .pk-loading {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.3); font-size: 16px;
  }

  /* ─── Join Screen ─── */
  .pk-join {
    flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .pk-join-card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px; padding: 40px; max-width: 420px; width: 100%; text-align: center;
  }
  .pk-join-card h1 { font-size: 28px; font-weight: 800; margin-bottom: 4px; }
  .pk-join-card p { color: rgba(255,255,255,0.4); font-size: 14px; margin-bottom: 24px; }

  .pk-join-form { display: flex; flex-direction: column; gap: 12px; }
  .pk-input {
    width: 100%; padding: 14px; border-radius: 12px; font-size: 16px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    color: white; text-align: center; outline: none;
  }
  .pk-input:focus { border-color: rgba(201,169,78,0.5); }

  .pk-buyin-picker { text-align: center; }
  .pk-buyin-label { font-size: 11px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 2px; }
  .pk-buyin-options { display: flex; gap: 6px; margin-top: 8px; }
  .pk-buyin-btn {
    flex: 1; padding: 10px; border-radius: 10px; font-size: 13px; font-weight: 700;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.15s;
  }
  .pk-buyin-btn:hover { border-color: rgba(255,255,255,0.2); color: white; }
  .pk-buyin-active {
    background: rgba(201,169,78,0.15) !important;
    border-color: rgba(201,169,78,0.4) !important;
    color: #C9A94E !important;
  }

  .pk-seated { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-items: center; }
  .pk-seated-label { font-size: 11px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 1px; }
  .pk-seated-name { font-size: 12px; padding: 4px 10px; border-radius: 20px; background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); }

  /* ─── Table ─── */
  .pk-table-wrap {
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 48px 12px 8px;
  }
  .pk-table {
    width: 100%; max-width: 750px; aspect-ratio: 16/10;
    position: relative;
  }
  .pk-felt {
    width: 100%; height: 100%;
    background:
      radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.04) 0%, transparent 70%),
      linear-gradient(180deg, #0d5a2d 0%, #0a4a24 40%, #07391a 100%);
    border-radius: 50%;
    border: 8px solid #2a1a0a;
    box-shadow:
      inset 0 0 60px rgba(0,0,0,0.4),
      0 0 0 4px #1a0f05, 0 0 0 8px #3a2815,
      0 20px 60px rgba(0,0,0,0.6);
    position: relative;
    overflow: visible;
  }

  .pk-table-brand {
    position: absolute; bottom: 18%; left: 50%; transform: translateX(-50%);
    color: rgba(201,169,78,0.1); font-size: 14px; font-weight: 900;
    letter-spacing: 6px; pointer-events: none;
  }

  /* ─── Pot ─── */
  .pk-pot {
    position: absolute; top: 25%; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 5;
  }
  .pk-pot-chips {
    width: 28px; height: 28px; border-radius: 50%;
    background: linear-gradient(135deg, #C9A94E, #8B6914);
    border: 2px dashed rgba(255,255,255,0.4);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .pk-pot-amount {
    font-size: 14px; font-weight: 800; color: #C9A94E;
    text-shadow: 0 1px 4px rgba(0,0,0,0.6);
  }

  /* ─── Community cards ─── */
  .pk-community {
    position: absolute; top: 38%; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; z-index: 5;
  }
  .pk-card-deal { animation: cardDeal 0.3s ease-out both; }
  @keyframes cardDeal {
    from { opacity: 0; transform: translateY(-20px) scale(0.8); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .pk-card-slot {
    width: 56px; height: 80px; border-radius: 6px;
    border: 1px dashed rgba(255,255,255,0.08);
  }

  /* ─── Phase ─── */
  .pk-phase {
    position: absolute; top: 18%; left: 50%; transform: translateX(-50%);
    font-size: 11px; color: rgba(201,169,78,0.4);
    font-weight: 700; letter-spacing: 3px; text-transform: uppercase;
  }

  /* ─── Seats ─── */
  .pk-seat {
    position: absolute; transform: translate(-50%, -50%);
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    transition: all 0.3s; z-index: 10;
  }
  .pk-seat-active .pk-avatar {
    box-shadow: 0 0 0 3px rgba(201,169,78,0.6), 0 0 20px rgba(201,169,78,0.3);
  }
  .pk-seat-folded { opacity: 0.4; }

  .pk-seat-cards { display: flex; margin-bottom: 4px; }
  .pk-seat-card { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); }

  .pk-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: rgba(139,26,43,0.6); border: 2px solid rgba(255,255,255,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 800; color: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: box-shadow 0.3s;
  }
  .pk-avatar-me { background: linear-gradient(135deg, #C9A94E, #8B6914); }

  .pk-seat-name { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.7); max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pk-seat-chips { font-size: 10px; color: rgba(201,169,78,0.7); font-weight: 700; }

  .pk-seat-bet {
    position: absolute; top: -8px; right: -28px;
    font-size: 11px; font-weight: 700; color: white;
    display: flex; align-items: center; gap: 3px;
    background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 10px;
  }
  .pk-bet-chip {
    width: 12px; height: 12px; border-radius: 50%;
    background: linear-gradient(135deg, #C9A94E, #8B6914);
    border: 1px dashed rgba(255,255,255,0.4);
  }

  .pk-action-label {
    font-size: 10px; font-weight: 700; padding: 2px 8px;
    border-radius: 8px; text-transform: uppercase; letter-spacing: 1px;
    position: absolute; top: -20px;
    animation: actionPop 0.3s ease-out;
  }
  @keyframes actionPop {
    from { opacity: 0; transform: scale(0.8) translateY(4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .pk-action-fold { background: rgba(239,68,68,0.2); color: #fca5a5; }
  .pk-action-check { background: rgba(34,197,94,0.2); color: #86efac; }
  .pk-action-call { background: rgba(59,130,246,0.2); color: #93c5fd; }
  .pk-action-raise { background: rgba(201,169,78,0.2); color: #C9A94E; }
  .pk-action-all-in { background: rgba(168,85,247,0.3); color: #c084fc; }

  .pk-dealer-chip {
    position: absolute; top: 50%; right: -22px; transform: translateY(-50%);
    width: 22px; height: 22px; border-radius: 50%;
    background: white; color: #1a1a2e;
    font-size: 11px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  }

  /* ─── Winners ─── */
  .pk-winners {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 20; display: flex; flex-direction: column; gap: 6px;
  }
  .pk-winner-banner {
    background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3);
    padding: 10px 20px; border-radius: 14px; text-align: center;
    font-size: 14px; color: #86efac;
    animation: winnerPop 0.5s ease-out;
  }
  @keyframes winnerPop {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
  }
  .pk-winner-hand {
    display: block; font-size: 11px; color: rgba(134,239,172,0.6);
    margin-top: 2px;
  }

  /* ─── Controls ─── */
  .pk-controls {
    padding: 8px 16px 24px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }

  .pk-my-info {
    display: flex; align-items: center; gap: 12px;
  }
  .pk-my-chips {
    font-size: 22px; font-weight: 800; color: #C9A94E;
    font-variant-numeric: tabular-nums;
  }

  .pk-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

  .pk-btn {
    padding: 12px 24px; border-radius: 14px; font-size: 14px;
    font-weight: 700; border: none; cursor: pointer;
    transition: all 0.15s; text-transform: uppercase; letter-spacing: 1px;
  }
  .pk-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .pk-btn:hover:not(:disabled) { transform: translateY(-2px); }

  .pk-btn-primary {
    background: linear-gradient(135deg, #8B1A2B, #a62040);
    color: white; box-shadow: 0 4px 16px rgba(139,26,43,0.4);
    padding: 14px 36px; font-size: 16px;
  }
  .pk-btn-deal {
    background: linear-gradient(135deg, #C9A94E, #8B6914);
    color: #1a1a2e; box-shadow: 0 4px 16px rgba(201,169,78,0.3);
    padding: 14px 36px; font-size: 16px;
  }
  .pk-btn-fold { background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
  .pk-btn-check { background: rgba(34,197,94,0.15); color: #86efac; border: 1px solid rgba(34,197,94,0.3); }
  .pk-btn-call { background: rgba(59,130,246,0.15); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }
  .pk-btn-raise { background: rgba(201,169,78,0.15); color: #C9A94E; border: 1px solid rgba(201,169,78,0.3); }
  .pk-btn-allin { background: rgba(168,85,247,0.2); color: #c084fc; border: 1px solid rgba(168,85,247,0.3); }
  .pk-btn-rebuy { background: rgba(34,197,94,0.15); color: #86efac; border: 1px solid rgba(34,197,94,0.3); font-size: 12px; padding: 8px 16px; }

  .pk-raise-controls { display: flex; gap: 6px; align-items: center; }
  .pk-raise-input {
    width: 100px; padding: 10px; border-radius: 10px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(201,169,78,0.3);
    color: white; font-size: 14px; text-align: center; outline: none;
  }
  .pk-btn-raise-confirm {
    background: linear-gradient(135deg, #C9A94E, #8B6914);
    color: #1a1a2e; padding: 10px 16px; border-radius: 10px;
    font-size: 13px; font-weight: 700; border: none; cursor: pointer;
  }

  .pk-waiting-msg {
    font-size: 13px; color: rgba(255,255,255,0.3);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.7; }
  }
  .pk-folded-msg { color: rgba(239,68,68,0.4); }

  /* ─── Mobile ─── */
  @media (max-width: 640px) {
    .pk-table-wrap { padding: 48px 4px 4px; }
    .pk-felt { border-width: 5px; }
    .pk-avatar { width: 36px; height: 36px; font-size: 12px; }
    .pk-seat-name { font-size: 9px; }
    .pk-seat-chips { font-size: 9px; }
    .pk-community { gap: 3px; }
    .pk-card-slot { width: 42px; height: 60px; }
    .pk-pot-amount { font-size: 12px; }
    .pk-btn { padding: 10px 16px; font-size: 12px; }
  }
`;
