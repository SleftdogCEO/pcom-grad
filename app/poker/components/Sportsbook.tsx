'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import AmbientCanvas from './AmbientCanvas';
import { KNOWN_PLAYERS, getAvatar } from '../lib/avatars';

const BOOK_ID = 'pcom-sportsbook';
const STARTING_BALANCE = 500;

interface Game {
  id: string;
  teamA: string;
  teamB: string;
  spread: number; // teamA spread (negative = favored)
  tipoff: string;
  status: 'open' | 'locked' | 'final';
  scoreA?: number;
  scoreB?: number;
}

interface PlayerBet {
  id: string;
  player: string;
  gameId: string;
  pick: 'A' | 'B';
  amount: number;
  timestamp: number;
  result?: 'win' | 'loss' | 'push';
}

interface BookState {
  games: Game[];
  bets: PlayerBet[];
  balances: Record<string, number>;
}

const SEED_GAMES: Game[] = [
  { id: 'g1', teamA: 'Duke', teamB: 'North Carolina', spread: -3.5, tipoff: 'Sat 3/8 \u00b7 6:00 PM', status: 'open' },
  { id: 'g2', teamA: 'Kansas', teamB: 'Houston', spread: 2.5, tipoff: 'Sat 3/8 \u00b7 8:30 PM', status: 'open' },
  { id: 'g3', teamA: 'UConn', teamB: 'Creighton', spread: -5.5, tipoff: 'Sun 3/9 \u00b7 1:00 PM', status: 'open' },
  { id: 'g4', teamA: 'Auburn', teamB: 'Tennessee', spread: -1.5, tipoff: 'Sun 3/9 \u00b7 3:30 PM', status: 'open' },
  { id: 'g5', teamA: 'Purdue', teamB: 'Michigan St', spread: -4, tipoff: 'Sun 3/9 \u00b7 6:00 PM', status: 'open' },
  { id: 'g6', teamA: 'Arizona', teamB: 'Oregon', spread: -7, tipoff: 'Mon 3/10 \u00b7 7:00 PM', status: 'open' },
  { id: 'g7', teamA: 'Kentucky', teamB: 'Florida', spread: -2.5, tipoff: 'Mon 3/10 \u00b7 9:00 PM', status: 'open' },
  { id: 'g8', teamA: 'Gonzaga', teamB: "Saint Mary's", spread: -4.5, tipoff: 'Tue 3/11 \u00b7 8:00 PM', status: 'open' },
];

function createInitialBook(): BookState {
  return { games: [...SEED_GAMES], bets: [], balances: {} };
}

function fmtSpread(s: number): string {
  if (s === 0) return 'PK';
  return s > 0 ? `+${s}` : `${s}`;
}

export default function Sportsbook() {
  const [book, setBook] = useState<BookState | null>(null);
  const [myName, setMyName] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('betsPlayerName');
    return null;
  });
  const [nameInput, setNameInput] = useState('');
  const [selectedBet, setSelectedBet] = useState<{ gameId: string; pick: 'A' | 'B' } | null>(null);
  const [betAmount, setBetAmount] = useState('50');
  const [adminScores, setAdminScores] = useState<Record<string, { a: string; b: string }>>({});
  const bookRef = useRef<BookState | null>(null);

  useEffect(() => { bookRef.current = book; }, [book]);

  useEffect(() => {
    if (!supabase) { setBook(createInitialBook()); return; }
    const load = async () => {
      const { data } = await supabase!.from('poker_rooms').select('game_state').eq('id', BOOK_ID).single();
      if (data?.game_state) {
        setBook(data.game_state as BookState);
      } else {
        const initial = createInitialBook();
        await supabase!.from('poker_rooms').insert({ id: BOOK_ID, game_state: initial });
        setBook(initial);
      }
    };
    const timeout = setTimeout(load, 100);
    const channel = supabase.channel('sportsbook')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_rooms', filter: `id=eq.${BOOK_ID}` }, (payload) => {
        if (payload.new && 'game_state' in payload.new) {
          setBook((payload.new as { game_state: BookState }).game_state);
        }
      })
      .subscribe();
    return () => { clearTimeout(timeout); supabase!.removeChannel(channel); };
  }, []);

  const updateBook = useCallback(async (newBook: BookState) => {
    setBook(newBook);
    bookRef.current = newBook;
    if (!supabase) return;
    await supabase.from('poker_rooms').update({ game_state: newBook, updated_at: new Date().toISOString() }).eq('id', BOOK_ID);
  }, []);

  const getBalance = useCallback((name: string): number => {
    if (!book) return 0;
    return book.balances[name] ?? STARTING_BALANCE;
  }, [book]);

  const handleJoin = (name: string) => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    setMyName(trimmed);
    localStorage.setItem('betsPlayerName', trimmed);
    if (book && !(trimmed in book.balances)) {
      updateBook({ ...book, balances: { ...book.balances, [trimmed]: STARTING_BALANCE } });
    }
  };

  const handlePlaceBet = () => {
    const current = bookRef.current;
    if (!current || !myName || !selectedBet) return;
    const amount = parseInt(betAmount);
    if (isNaN(amount) || amount <= 0) return;
    const balance = current.balances[myName] ?? STARTING_BALANCE;
    if (amount > balance) return;
    const game = current.games.find(g => g.id === selectedBet.gameId);
    if (!game || game.status !== 'open') return;

    const bet: PlayerBet = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      player: myName,
      gameId: selectedBet.gameId,
      pick: selectedBet.pick,
      amount,
      timestamp: Date.now(),
    };

    updateBook({
      ...current,
      bets: [...current.bets, bet],
      balances: { ...current.balances, [myName]: balance - amount },
    });
    setSelectedBet(null);
    setBetAmount('50');
  };

  const handleResolve = (gameId: string) => {
    const current = bookRef.current;
    if (!current) return;
    const scores = adminScores[gameId];
    if (!scores) return;
    const scoreA = parseInt(scores.a);
    const scoreB = parseInt(scores.b);
    if (isNaN(scoreA) || isNaN(scoreB)) return;
    const game = current.games.find(g => g.id === gameId);
    if (!game) return;

    // A covers if scoreA + spread > scoreB (spread is negative when A is favored)
    const margin = scoreA + game.spread - scoreB;
    const newBets = current.bets.map(b => {
      if (b.gameId !== gameId) return b;
      if (margin > 0) return { ...b, result: (b.pick === 'A' ? 'win' : 'loss') as 'win' | 'loss' };
      if (margin < 0) return { ...b, result: (b.pick === 'B' ? 'win' : 'loss') as 'win' | 'loss' };
      return { ...b, result: 'push' as const };
    });

    const newBalances = { ...current.balances };
    for (const bet of newBets) {
      if (bet.gameId !== gameId || !bet.result) continue;
      if (bet.result === 'win') newBalances[bet.player] = (newBalances[bet.player] || 0) + bet.amount * 2;
      else if (bet.result === 'push') newBalances[bet.player] = (newBalances[bet.player] || 0) + bet.amount;
    }

    const newGames = current.games.map(g =>
      g.id === gameId ? { ...g, status: 'final' as const, scoreA, scoreB } : g
    );
    updateBook({ ...current, games: newGames, bets: newBets, balances: newBalances });
  };

  // ─── Join Screen ───
  if (!myName) {
    return (
      <div className="sb-page">
        <AmbientCanvas />
        <div className="sb-join">
          <div className="sb-join-card">
            <div className="sb-join-icon">🏀</div>
            <h1>March Madness</h1>
            <p>Bet PCOM Bucks on college basketball</p>
            <div className="sb-player-grid">
              {KNOWN_PLAYERS.map(p => (
                <button key={p.name} onClick={() => handleJoin(p.name)} className="sb-player-btn">
                  {getAvatar(p.name) ? (
                    <img src={getAvatar(p.name)!} alt={p.name} className="sb-player-img" />
                  ) : (
                    <div className="sb-player-initials">{p.name.slice(0, 2).toUpperCase()}</div>
                  )}
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleJoin(nameInput); }} className="sb-custom-name">
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Or type a name..." className="sb-name-input" />
              <button type="submit" className="sb-name-go" disabled={!nameInput.trim()}>Go</button>
            </form>
          </div>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="sb-page">
        <AmbientCanvas />
        <div className="sb-loading">Loading sportsbook...</div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  const balance = getBalance(myName);
  const myBets = book.bets.filter(b => b.player === myName);
  const isAdmin = myName.toLowerCase() === 'grant';

  return (
    <div className="sb-page">
      <AmbientCanvas />

      {/* Header */}
      <div className="sb-header">
        <a href="/poker" className="sb-back">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Poker
        </a>
        <div className="sb-title">🏀 Sportsbook</div>
        <div className="sb-balance">${balance.toLocaleString()}</div>
      </div>

      <div className="sb-content">
        <div className="sb-hero">
          <h2>March Madness 2026</h2>
          <p>Against the spread &middot; Even money payouts &middot; PCOM Bucks</p>
        </div>

        {/* Games */}
        <div className="sb-games">
          {book.games.map(game => {
            const gameBets = book.bets.filter(b => b.gameId === game.id);
            const totalAction = gameBets.reduce((s, b) => s + b.amount, 0);
            const isSelected = selectedBet?.gameId === game.id;
            const isFinal = game.status === 'final';

            return (
              <div key={game.id} className={`sb-game ${isFinal ? 'sb-game-final' : ''}`}>
                <div className="sb-game-top">
                  <span className="sb-game-time">{game.tipoff}</span>
                  {totalAction > 0 && <span className="sb-game-action">${totalAction} wagered</span>}
                </div>
                <div className="sb-game-teams">
                  <button
                    className={`sb-team ${isSelected && selectedBet?.pick === 'A' ? 'sb-team-sel' : ''}`}
                    onClick={() => !isFinal && setSelectedBet(isSelected && selectedBet?.pick === 'A' ? null : { gameId: game.id, pick: 'A' })}
                    disabled={isFinal}
                  >
                    <span className="sb-team-name">{game.teamA}</span>
                    <span className="sb-team-spread">{fmtSpread(game.spread)}</span>
                  </button>
                  <div className="sb-vs">VS</div>
                  <button
                    className={`sb-team ${isSelected && selectedBet?.pick === 'B' ? 'sb-team-sel' : ''}`}
                    onClick={() => !isFinal && setSelectedBet(isSelected && selectedBet?.pick === 'B' ? null : { gameId: game.id, pick: 'B' })}
                    disabled={isFinal}
                  >
                    <span className="sb-team-name">{game.teamB}</span>
                    <span className="sb-team-spread">{fmtSpread(-game.spread)}</span>
                  </button>
                </div>
                {isFinal && (
                  <div className="sb-game-score">
                    {game.teamA} {game.scoreA} &ndash; {game.scoreB} {game.teamB} &middot; FINAL
                  </div>
                )}
                {myBets.filter(b => b.gameId === game.id).map(b => (
                  <div key={b.id} className={`sb-mybet sb-mybet-${b.result || 'pending'}`}>
                    Your bet: {b.pick === 'A' ? game.teamA : game.teamB} {fmtSpread(b.pick === 'A' ? game.spread : -game.spread)} &middot; ${b.amount}
                    {b.result ? ` \u00b7 ${b.result.toUpperCase()}${b.result === 'win' ? ` (+$${b.amount})` : b.result === 'push' ? ' (refund)' : ''}` : ' \u00b7 PENDING'}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Leaderboard */}
        {Object.keys(book.balances).length > 0 && (
          <div className="sb-lb">
            <h3>Betting Leaderboard</h3>
            {Object.entries(book.balances)
              .sort(([, a], [, b]) => b - a)
              .map(([name, bal], i) => (
                <div key={name} className={`sb-lb-row ${name === myName ? 'sb-lb-me' : ''}`}>
                  <span className="sb-lb-rank">#{i + 1}</span>
                  <span className="sb-lb-name">{name}</span>
                  <span className="sb-lb-bal">${bal.toLocaleString()}</span>
                </div>
              ))}
          </div>
        )}

        {/* Admin: resolve games (Grant only) */}
        {isAdmin && (
          <div className="sb-admin">
            <h3>Admin: Resolve Games</h3>
            {book.games.filter(g => g.status !== 'final').map(game => (
              <div key={game.id} className="sb-admin-game">
                <span>{game.teamA} vs {game.teamB}</span>
                <div className="sb-admin-inputs">
                  <input
                    type="number"
                    placeholder={game.teamA.slice(0, 6)}
                    value={adminScores[game.id]?.a || ''}
                    onChange={e => setAdminScores(prev => ({ ...prev, [game.id]: { a: e.target.value, b: prev[game.id]?.b || '' } }))}
                    className="sb-admin-score"
                  />
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}>-</span>
                  <input
                    type="number"
                    placeholder={game.teamB.slice(0, 6)}
                    value={adminScores[game.id]?.b || ''}
                    onChange={e => setAdminScores(prev => ({ ...prev, [game.id]: { a: prev[game.id]?.a || '', b: e.target.value } }))}
                    className="sb-admin-score"
                  />
                  <button onClick={() => handleResolve(game.id)} className="sb-admin-resolve">Resolve</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bet Slip (fixed bottom) */}
      {selectedBet && (() => {
        const game = book.games.find(g => g.id === selectedBet.gameId)!;
        const team = selectedBet.pick === 'A' ? game.teamA : game.teamB;
        const spread = selectedBet.pick === 'A' ? game.spread : -game.spread;
        const amt = parseInt(betAmount) || 0;
        return (
          <div className="sb-slip">
            <div className="sb-slip-top">
              <span className="sb-slip-label">Bet Slip</span>
              <button onClick={() => setSelectedBet(null)} className="sb-slip-close">&times;</button>
            </div>
            <div className="sb-slip-pick">{team} {fmtSpread(spread)}</div>
            <div className="sb-slip-amounts">
              {[25, 50, 100, 250].map(a => (
                <button key={a} onClick={() => setBetAmount(String(a))} className={betAmount === String(a) ? 'sb-amt-active' : ''}>${a}</button>
              ))}
            </div>
            <div className="sb-slip-row">
              <input type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)} min={1} max={balance} className="sb-slip-input" />
              <span className="sb-slip-payout">Win: <strong>${amt}</strong></span>
            </div>
            <button onClick={handlePlaceBet} className="sb-slip-place" disabled={amt <= 0 || amt > balance}>
              Place Bet &middot; ${amt}
            </button>
          </div>
        );
      })()}

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .sb-page {
    min-height: 100dvh;
    background: linear-gradient(180deg, #0a0a14 0%, #12121f 50%, #0a0a14 100%);
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    position: relative;
    z-index: 1;
  }

  .sb-header {
    position: fixed; top: 0; left: 0; right: 0; z-index: 40;
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px;
    background: rgba(10, 10, 20, 0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .sb-back {
    display: flex; align-items: center; gap: 4px;
    color: rgba(255,255,255,0.5); text-decoration: none; font-size: 14px; font-weight: 600;
    transition: color 0.2s;
  }
  .sb-back:hover { color: white; }
  .sb-title { font-size: 16px; font-weight: 800; letter-spacing: 1px; color: #C9A94E; }
  .sb-balance {
    font-size: 16px; font-weight: 800; color: #C9A94E;
    background: rgba(201,169,78,0.1); padding: 4px 12px; border-radius: 20px;
    border: 1px solid rgba(201,169,78,0.2);
  }

  .sb-content { padding: 72px 16px 120px; max-width: 640px; margin: 0 auto; }

  .sb-hero { text-align: center; margin-bottom: 24px; }
  .sb-hero h2 {
    font-size: 24px; font-weight: 800; margin: 0 0 4px;
    background: linear-gradient(135deg, #C9A94E, #e8d48b);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .sb-hero p { color: rgba(255,255,255,0.4); font-size: 13px; margin: 0; }

  .sb-games { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }

  .sb-game {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px; padding: 14px; transition: border-color 0.2s;
  }
  .sb-game:hover { border-color: rgba(255,255,255,0.12); }
  .sb-game-final { opacity: 0.6; }

  .sb-game-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .sb-game-time {
    font-size: 11px; color: rgba(255,255,255,0.35); text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600;
  }
  .sb-game-action { font-size: 10px; color: rgba(201,169,78,0.6); font-weight: 600; }

  .sb-game-teams { display: flex; align-items: center; gap: 8px; }
  .sb-team {
    flex: 1; display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-radius: 10px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: white; cursor: pointer; transition: all 0.2s; font-size: 14px;
  }
  .sb-team:hover:not(:disabled) { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }
  .sb-team:disabled { cursor: default; opacity: 0.5; }
  .sb-team-sel {
    background: rgba(201,169,78,0.12) !important;
    border-color: rgba(201,169,78,0.4) !important;
    box-shadow: 0 0 12px rgba(201,169,78,0.15);
  }
  .sb-team-name { font-weight: 700; font-size: 14px; }
  .sb-team-spread {
    font-weight: 800; font-size: 13px; color: #C9A94E;
    background: rgba(201,169,78,0.1); padding: 2px 8px; border-radius: 6px;
  }
  .sb-vs { font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.2); flex-shrink: 0; }
  .sb-game-score { text-align: center; font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 8px; font-weight: 600; }

  .sb-mybet { font-size: 11px; margin-top: 8px; padding: 6px 10px; border-radius: 8px; font-weight: 600; }
  .sb-mybet-pending { background: rgba(59,130,246,0.1); color: rgba(147,197,253,0.8); border: 1px solid rgba(59,130,246,0.15); }
  .sb-mybet-win { background: rgba(34,197,94,0.1); color: #86efac; border: 1px solid rgba(34,197,94,0.2); }
  .sb-mybet-loss { background: rgba(239,68,68,0.1); color: #fca5a5; border: 1px solid rgba(239,68,68,0.15); }
  .sb-mybet-push { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.1); }

  /* Bet Slip */
  .sb-slip {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
    background: rgba(15,15,25,0.95); backdrop-filter: blur(16px);
    border-top: 1px solid rgba(201,169,78,0.3);
    padding: 16px 20px calc(16px + env(safe-area-inset-bottom));
    animation: sbSlideUp 0.25s ease-out;
  }
  @keyframes sbSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .sb-slip-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .sb-slip-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(201,169,78,0.7); }
  .sb-slip-close { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 18px; cursor: pointer; }
  .sb-slip-pick { font-size: 16px; font-weight: 800; margin-bottom: 10px; }
  .sb-slip-amounts { display: flex; gap: 6px; margin-bottom: 10px; }
  .sb-slip-amounts button {
    flex: 1; padding: 8px; border-radius: 8px; font-size: 13px; font-weight: 700;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    color: white; cursor: pointer; transition: all 0.15s;
  }
  .sb-slip-amounts button:hover { background: rgba(255,255,255,0.1); }
  .sb-amt-active { background: rgba(201,169,78,0.15) !important; border-color: rgba(201,169,78,0.4) !important; color: #C9A94E !important; }
  .sb-slip-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .sb-slip-input {
    flex: 1; padding: 8px 12px; border-radius: 8px; font-size: 16px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    color: white; outline: none; -webkit-text-fill-color: white;
  }
  .sb-slip-input:focus { border-color: rgba(201,169,78,0.4); }
  .sb-slip-payout { font-size: 13px; color: rgba(255,255,255,0.5); white-space: nowrap; }
  .sb-slip-payout strong { color: #86efac; }
  .sb-slip-place {
    width: 100%; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 800;
    text-transform: uppercase; letter-spacing: 1px;
    background: linear-gradient(135deg, #C9A94E, #8B6914); border: none; color: white;
    cursor: pointer; transition: all 0.2s;
  }
  .sb-slip-place:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(201,169,78,0.3); }
  .sb-slip-place:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Leaderboard */
  .sb-lb {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px; padding: 16px; margin-bottom: 24px;
  }
  .sb-lb h3 {
    font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    color: rgba(201,169,78,0.6); margin: 0 0 12px; text-align: center;
  }
  .sb-lb-row {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 8px; border-radius: 8px; font-size: 13px;
  }
  .sb-lb-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
  .sb-lb-me { background: rgba(201,169,78,0.08) !important; }
  .sb-lb-rank { color: rgba(255,255,255,0.3); font-weight: 700; width: 28px; }
  .sb-lb-name { flex: 1; font-weight: 600; color: rgba(255,255,255,0.7); }
  .sb-lb-bal { font-weight: 800; color: #C9A94E; }

  /* Admin */
  .sb-admin {
    background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.15);
    border-radius: 16px; padding: 16px; margin-top: 24px;
  }
  .sb-admin h3 {
    font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    color: rgba(239,68,68,0.6); margin: 0 0 12px;
  }
  .sb-admin-game { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; font-size: 13px; color: rgba(255,255,255,0.6); }
  .sb-admin-inputs { display: flex; align-items: center; gap: 6px; }
  .sb-admin-score {
    width: 60px; padding: 6px 8px; border-radius: 6px; font-size: 14px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    color: white; outline: none; text-align: center; -webkit-text-fill-color: white;
  }
  .sb-admin-resolve {
    padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 700;
    background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3);
    color: #fca5a5; cursor: pointer;
  }

  /* Join Screen */
  .sb-join {
    min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    padding: 20px; position: relative; z-index: 1;
  }
  .sb-join-card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px; padding: 40px; max-width: 500px; width: 100%; text-align: center;
  }
  .sb-join-icon { font-size: 48px; margin-bottom: 12px; }
  .sb-join-card h1 {
    font-size: 28px; font-weight: 800; margin: 0 0 4px;
    background: linear-gradient(135deg, #C9A94E, #e8d48b);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .sb-join-card > p { color: rgba(255,255,255,0.4); font-size: 14px; margin: 0 0 24px; }

  .sb-player-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
  .sb-player-btn {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 10px 4px; border-radius: 12px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.7); cursor: pointer; transition: all 0.15s; font-size: 11px;
  }
  .sb-player-btn:hover { background: rgba(201,169,78,0.1); border-color: rgba(201,169,78,0.3); }
  .sb-player-img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; object-position: top; }
  .sb-player-initials {
    width: 36px; height: 36px; border-radius: 50%; background: rgba(139,26,43,0.6);
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px;
  }

  .sb-custom-name { display: flex; gap: 8px; }
  .sb-name-input {
    flex: 1; padding: 10px 14px; border-radius: 10px; font-size: 14px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    color: white; outline: none; -webkit-text-fill-color: white;
  }
  .sb-name-input:focus { border-color: rgba(201,169,78,0.4); }
  .sb-name-go {
    padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 700;
    background: linear-gradient(135deg, #C9A94E, #8B6914); border: none; color: white; cursor: pointer;
  }
  .sb-name-go:disabled { opacity: 0.4; cursor: not-allowed; }

  .sb-loading {
    min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.4); font-size: 14px; position: relative; z-index: 1;
  }

  @media (max-width: 580px) {
    .sb-player-grid { grid-template-columns: repeat(3, 1fr); }
    .sb-team-name { font-size: 12px; }
    .sb-team-spread { font-size: 11px; padding: 2px 6px; }
    .sb-game-teams { gap: 4px; }
    .sb-team { padding: 10px; }
    .sb-join-card { padding: 28px 16px; }
    .sb-content { padding: 64px 12px 140px; }
  }
`;
