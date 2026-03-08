'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  type GameState, type Card, type Phase, type ChatMessage,
  createInitialState, addPlayer, claimDailyBonus, dealNewHand,
  fold, check, call, raise, allIn,
  sendChat, sendReaction, toggleVibe, TURN_TIME,
  getBotAction, isBot, BOT_NAMES,
  getTodaysTheme,
  SUIT_DISPLAY, RANK_DISPLAY,
} from '../lib/engine';
import { getAvatar, findProfile, KNOWN_PLAYERS } from '../lib/avatars';
import AmbientCanvas from './AmbientCanvas';

const ROOM_ID = 'pcom-main';
const CHAT_ID = 'pcom-chat';
const DEFAULT_BUY_IN = 1000;
const BOT_DELAY = 2000; // bots act after 2s
const AUTO_DEAL_DELAY = 5000;
const MAX_CHAT = 200;
const CODE_VERSION = 7; // bump to force client reload
const theme = getTodaysTheme();

function patchState(gs: GameState): GameState {
  return {
    ...gs,
    players: gs.players || [],
    community: gs.community || [],
    deck: gs.deck || [],
    sidePots: gs.sidePots || [],
    leaderboard: gs.leaderboard || [],
    chat: gs.chat || [],
    handNumber: gs.handNumber ?? 0,
  };
}

export default function PokerGame() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [buyInAmount] = useState(DEFAULT_BUY_IN);
  const [raiseInput, setRaiseInput] = useState('');
  const [showRaise, setShowRaise] = useState(false);
  const [joined, setJoined] = useState(false);
  const [useNickname, setUseNickname] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('pokerUseNickname') === 'true';
    return false;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('pokerSeenIntro') !== String(CODE_VERSION);
    return true;
  });
  const [showCustom, setShowCustom] = useState(false);
  const [editName, setEditName] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatRef = useRef<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const [chatTab, setChatTab] = useState<'chat' | 'leaderboard'>('chat');
  const [turnTimer, setTurnTimer] = useState(0);
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [afkPrompt, setAfkPrompt] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const stateRef = useRef<GameState | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Force reload if client has stale code
  useEffect(() => {
    const lastVersion = localStorage.getItem('pokerCodeVersion');
    if (lastVersion && parseInt(lastVersion) < CODE_VERSION) {
      localStorage.setItem('pokerCodeVersion', String(CODE_VERSION));
      window.location.reload();
      return;
    }
    localStorage.setItem('pokerCodeVersion', String(CODE_VERSION));
  }, []);

  // Load name
  useEffect(() => {
    const name = localStorage.getItem('guestName');
    if (name) { setMyName(name); setNameInput(name); }
  }, []);

  // Load or create room
  useEffect(() => {
    if (!supabase) {
      const initial = createInitialState();
      setGameState(initial);
      stateRef.current = initial;
      return;
    }
    let loaded = false;
    async function loadRoom() {
      try {
        const { data } = await supabase!.from('poker_rooms').select('game_state').eq('id', ROOM_ID).single();
        loaded = true;
        if (data) {
          const gs = patchState(data.game_state as GameState);
          setGameState(gs); stateRef.current = gs;
        } else {
          const initial = createInitialState();
          await supabase!.from('poker_rooms').insert({ id: ROOM_ID, game_state: initial });
          setGameState(initial); stateRef.current = initial;
        }
      } catch {
        if (!loaded) {
          const initial = createInitialState();
          setGameState(initial); stateRef.current = initial;
        }
      }
    }
    const timeout = setTimeout(() => {
      if (!loaded) {
        const initial = createInitialState();
        setGameState(initial); stateRef.current = initial;
      }
    }, 4000);
    loadRoom();
    const channel = supabase.channel('poker-room')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poker_rooms', filter: `id=eq.${ROOM_ID}` }, (payload) => {
        const gs = patchState((payload.new as { game_state: GameState }).game_state);
        setGameState(gs); stateRef.current = gs;
      }).subscribe();
    return () => { clearTimeout(timeout); supabase!.removeChannel(channel); };
  }, []);

  // Load and sync persistent chat (separate from game state)
  useEffect(() => {
    if (!supabase) return;
    async function loadChat() {
      const { data } = await supabase!.from('poker_rooms').select('game_state').eq('id', CHAT_ID).single();
      if (data) {
        const msgs = (data.game_state as { messages: ChatMessage[] })?.messages || [];
        setChatMessages(msgs); chatRef.current = msgs;
      } else {
        await supabase!.from('poker_rooms').insert({ id: CHAT_ID, game_state: { messages: [] } });
      }
    }
    loadChat();
    const channel = supabase.channel('poker-chat')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poker_rooms', filter: `id=eq.${CHAT_ID}` }, (payload) => {
        const msgs = ((payload.new as { game_state: { messages: ChatMessage[] } }).game_state)?.messages || [];
        setChatMessages(msgs); chatRef.current = msgs;
      }).subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, []);

  const updateChat = useCallback(async (msgs: ChatMessage[]) => {
    setChatMessages(msgs); chatRef.current = msgs;
    if (!supabase) return;
    await supabase.from('poker_rooms').update({ game_state: { messages: msgs }, updated_at: new Date().toISOString() }).eq('id', CHAT_ID);
  }, []);

  const updateState = useCallback(async (newState: GameState) => {
    if (!supabase) { setGameState(newState); stateRef.current = newState; return; }
    setGameState(newState); stateRef.current = newState;
    await supabase.from('poker_rooms').update({ game_state: newState, updated_at: new Date().toISOString() }).eq('id', ROOM_ID);
  }, []);

  // Auto-deal after showdown
  useEffect(() => {
    if (!gameState || gameState.phase !== 'showdown') return;
    const activePlayers = gameState.players.filter((p) => p.chips > 0 && !p.sittingOut);
    if (activePlayers.length < 2) return;
    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (current && current.phase === 'showdown') {
        updateState({ ...dealNewHand(current), turnDeadline: Date.now() + TURN_TIME });
      }
    }, AUTO_DEAL_DELAY);
    return () => clearTimeout(timer);
  }, [gameState?.phase, gameState?.handNumber, updateState]);

  // Shot clock — auto-fold + AFK tracking
  useEffect(() => {
    if (!gameState || gameState.currentTurn < 0) { setTurnTimer(0); return; }
    const deadline = gameState.turnDeadline || (Date.now() + TURN_TIME);
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTurnTimer(remaining);
      if (remaining <= 0) {
        const current = stateRef.current;
        if (current && current.currentTurn >= 0) {
          const player = current.players[current.currentTurn];
          if (player) {
            // Increment auto-fold count for this player
            const newPlayers = current.players.map((p) =>
              p.name === player.name ? { ...p, autoFoldCount: (p.autoFoldCount || 0) + 1 } : p
            );
            const folded = fold({ ...current, players: newPlayers }, player.name);
            const afkPlayer = newPlayers.find((p) => p.name === player.name);
            // After 3 auto-folds, remove non-bot player
            if (afkPlayer && !isBot(afkPlayer.name) && (afkPlayer.autoFoldCount || 0) >= 3) {
              if (afkPlayer.name === myName) {
                setAfkPrompt(true);
              } else {
                // Remove AFK player
                const removed = { ...folded, players: folded.players.filter((p) => p.name !== afkPlayer.name) };
                updateState(withDeadline(removed));
                return;
              }
            }
            updateState(withDeadline(folded));
          }
        }
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [gameState?.currentTurn, gameState?.turnDeadline, updateState, myName]);

  // Bot auto-play: when it's a bot's turn, act after delay
  useEffect(() => {
    if (!gameState || gameState.currentTurn < 0) return;
    const currentPlayer = gameState.players[gameState.currentTurn];
    if (!currentPlayer || !isBot(currentPlayer.name)) return;
    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (!current || current.currentTurn < 0) return;
      const bot = current.players[current.currentTurn];
      if (bot && isBot(bot.name)) {
        updateState(withDeadline(getBotAction(current, bot.name)));
      }
    }, BOT_DELAY);
    return () => clearTimeout(timer);
  }, [gameState?.currentTurn, gameState?.handNumber, updateState]);

  // Bot management: add bots when not enough players, remove when enough humans
  useEffect(() => {
    if (!gameState || gameState.phase !== 'waiting') return;
    const humans = gameState.players.filter((p) => !isBot(p.name));
    const bots = gameState.players.filter((p) => isBot(p.name));

    // If 3+ humans, remove all bots
    if (humans.length >= 3 && bots.length > 0) {
      const newPlayers = gameState.players.filter((p) => !isBot(p.name));
      updateState({ ...gameState, players: newPlayers });
      return;
    }

    // If 2 humans, keep max 1 bot
    if (humans.length === 2 && bots.length > 1) {
      const newPlayers = [...humans, bots[0]];
      updateState({ ...gameState, players: newPlayers });
      return;
    }

    // If fewer than 3 total and at least 1 human, add bots
    if (humans.length >= 1 && gameState.players.length < 3) {
      const botsNeeded = 3 - gameState.players.length;
      const availableBots = BOT_NAMES.filter((b) => !gameState.players.find((p) => p.name === b));
      if (availableBots.length === 0) return;
      let state = gameState;
      for (let i = 0; i < Math.min(botsNeeded, availableBots.length); i++) {
        state = addPlayer(state, availableBots[i], DEFAULT_BUY_IN);
      }
      updateState(state);
    }
  }, [gameState?.players?.length, gameState?.phase, updateState]);

  // AFK auto-remove after 20s if no response
  useEffect(() => {
    if (!afkPrompt) return;
    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (current && myName) {
        updateState({ ...current, players: current.players.filter((p) => p.name !== myName) });
        setJoined(false);
        setAfkPrompt(false);
      }
    }, 20000);
    return () => clearTimeout(timer);
  }, [afkPrompt, myName, updateState]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const withDeadline = (s: GameState) => s.currentTurn >= 0 ? { ...s, turnDeadline: Date.now() + TURN_TIME } : s;

  const handleSendChat = async () => {
    if (!myName || !chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    const msgs = [...chatRef.current, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: myName, text: msg, timestamp: Date.now() }];
    if (msgs.length > MAX_CHAT) msgs.splice(0, msgs.length - MAX_CHAT);
    await updateChat(msgs);
  };

  const handleReaction = async (emoji: string) => {
    if (!myName) return;
    // Floating emoji animation
    const id = `${Date.now()}-${Math.random()}`;
    const x = 20 + Math.random() * 60;
    setFloatingEmojis((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== id)), 2000);
    const msgs = [...chatRef.current, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: myName, text: '', emoji, timestamp: Date.now() }];
    if (msgs.length > MAX_CHAT) msgs.splice(0, msgs.length - MAX_CHAT);
    await updateChat(msgs);
  };

  const handleJoin = async () => {
    const name = nameInput.trim();
    if (!name || !gameState) return;
    setMyName(name);
    localStorage.setItem('guestName', name);
    const existing = gameState.players.find((p) => p.name === name);
    if (existing) { setJoined(true); return; }
    const newState = addPlayer(gameState, name, buyInAmount);
    await updateState(newState);
    setJoined(true);
  };

  const handleDailyBonus = async () => {
    const current = stateRef.current;
    if (!myName || !current || claimingBonus) return;
    setClaimingBonus(true);
    await updateState(claimDailyBonus(current, myName));
  };

  const handleDeal = async () => {
    if (!gameState) return;
    await updateState({ ...dealNewHand(gameState), turnDeadline: Date.now() + TURN_TIME });
  };

  // Clear AFK counter when player takes any manual action
  const clearAfk = (state: GameState): GameState => ({
    ...state,
    players: state.players.map((p) => p.name === myName ? { ...p, autoFoldCount: 0 } : p),
  });

  const handleFold = async () => {
    if (!myName || !gameState) return;
    setAfkPrompt(false);
    await updateState(withDeadline(clearAfk(fold(gameState, myName))));
  };
  const handleCheck = async () => {
    if (!myName || !gameState) return;
    await updateState(withDeadline(clearAfk(check(gameState, myName))));
  };
  const handleCall = async () => {
    if (!myName || !gameState) return;
    await updateState(withDeadline(clearAfk(call(gameState, myName))));
  };
  const handleRaise = async () => {
    if (!myName || !gameState) return;
    const amount = parseInt(raiseInput);
    if (isNaN(amount)) return;
    await updateState(withDeadline(clearAfk(raise(gameState, myName, amount))));
    setShowRaise(false); setRaiseInput('');
  };
  const handleAllIn = async () => {
    if (!myName || !gameState) return;
    await updateState(withDeadline(clearAfk(allIn(gameState, myName))));
  };

  // ─── Loading ─────────────────────────────────────────────────────
  if (!gameState) {
    return (
      <div style={{ minHeight: '100dvh', background: '#0a0a12', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 16, fontFamily: 'sans-serif' }}>
        Loading table...
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

  // ─── Intro / How It Works ───────────────────────────────────────
  if (showIntro) {
    return (
      <div className="pk-page">
        <AmbientCanvas />
        <a href="/" className="pk-back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back
        </a>
        <div className="pk-intro">
          <div className="pk-intro-card">
            <div className="pk-intro-welcome">
              <div className="pk-welcome-line" />
              <p className="pk-welcome-pre">Ladies &amp; Gentlemen</p>
              <h1 className="pk-welcome-title">Welcome to<br/><span>Sleft Poker</span></h1>
              <p className="pk-welcome-sub">An evening of cards, trash talk &amp; questionable medical decisions</p>
              <p className="pk-welcome-class">PCOM DO Class of 2026 &bull; Black Tie Optional, Ego Required</p>
              <div className="pk-welcome-line" />
            </div>

            <div className="pk-intro-grid">
              <div className="pk-intro-block">
                <div className="pk-intro-block-icon">&#x1F4B0;</div>
                <h3>PCOM Bucks</h3>
                <p>Everyone starts with <strong>$1,000</strong> fake money. Come back daily for a <strong>+$100 bonus</strong>. Special drops on Match Day (Mar 20) and Graduation (Apr 28).</p>
              </div>
              <div className="pk-intro-block">
                <div className="pk-intro-block-icon">&#x1F916;</div>
                <h3>Always Action</h3>
                <p>AI bots (Dr. House, Dr. Grey, Dr. Cox) are here 24/7 so you always have someone to play. <strong>You don&apos;t lose chips against bots</strong> &mdash; it&apos;s just practice. They leave when real players join.</p>
              </div>
              <div className="pk-intro-block">
                <div className="pk-intro-block-icon">&#x23F1;</div>
                <h3>Speed Poker</h3>
                <p><strong>20-second shot clock</strong> per turn &mdash; stall and you auto-fold. Next hand auto-deals in 5 seconds. No waiting around.</p>
              </div>
              <div className="pk-intro-block">
                <div className="pk-intro-block-icon">&#x1F3AD;</div>
                <h3>Theme Nights</h3>
                <p>The table changes every day: Anatomy Lab, Flavortown, Shrek&apos;s Swamp, Bro Science, Board Exam PTSD, Jurassic Poker, Match Day.</p>
              </div>
            </div>

            <div className="pk-intro-how">
              <h3>How to Play</h3>
              <ol>
                <li><strong>Pick your character</strong> &mdash; find yourself in the roster or type a custom name</li>
                <li><strong>Take a seat</strong> &mdash; you start with $1,000 PCOM Bucks</li>
                <li><strong>Hit Deal</strong> &mdash; standard Texas Hold&apos;em rules. Best 5-card hand wins the pot</li>
                <li><strong>Talk trash</strong> &mdash; use the chat sidebar to roast your classmates</li>
                <li><strong>Climb the board</strong> &mdash; check the leaderboard to see who&apos;s on top</li>
              </ol>
            </div>

            <div className="pk-intro-hands">
              <h3>Hand Rankings</h3>
              <div className="pk-intro-hands-grid">
                <div className="pk-ih-row pk-ih-top"><span className="pk-ih-cards">A&#9824; K&#9824; Q&#9824; J&#9824; 10&#9824;</span><span>Royal Flush</span></div>
                <div className="pk-ih-row"><span className="pk-ih-cards">9&#9829; 8&#9829; 7&#9829; 6&#9829; 5&#9829;</span><span>Straight Flush</span></div>
                <div className="pk-ih-row"><span className="pk-ih-cards">K&#9827; K&#9830; K&#9829; K&#9824;</span><span>Four of a Kind</span></div>
                <div className="pk-ih-row"><span className="pk-ih-cards">J&#9829; J&#9824; J&#9830; 8&#9827; 8&#9824;</span><span>Full House</span></div>
                <div className="pk-ih-row"><span className="pk-ih-cards">A&#9830; J&#9830; 8&#9830; 6&#9830; 2&#9830;</span><span>Flush</span></div>
                <div className="pk-ih-row"><span className="pk-ih-cards">10&#9824; 9&#9829; 8&#9827; 7&#9830; 6&#9824;</span><span>Straight</span></div>
                <div className="pk-ih-row"><span className="pk-ih-cards">Q&#9829; Q&#9824; Q&#9827;</span><span>Three of a Kind</span></div>
                <div className="pk-ih-row"><span className="pk-ih-cards">A&#9824; A&#9829; 5&#9827; 5&#9830;</span><span>Two Pair</span></div>
                <div className="pk-ih-row"><span className="pk-ih-cards">K&#9829; K&#9827;</span><span>One Pair</span></div>
                <div className="pk-ih-row"><span className="pk-ih-cards">A&#9824; J&#9829; 8&#9827; 5&#9830; 2&#9824;</span><span>High Card</span></div>
              </div>
            </div>

            <button onClick={() => { setShowIntro(false); localStorage.setItem('pokerSeenIntro', String(CODE_VERSION)); }} className="pk-btn pk-btn-deal pk-intro-cta">
              Let&apos;s Play
            </button>
          </div>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  // ─── Character Select ────────────────────────────────────────────
  if (!joined && !me) {
    const alreadySeated = new Set(gameState.players.map((p) => p.name.toLowerCase()));
    const handlePickPlayer = (profile: typeof KNOWN_PLAYERS[number]) => {
      setNameInput(profile.name);
      setMyName(profile.name);
      localStorage.setItem('guestName', profile.name);
    };

    return (
      <div className="pk-page">
        <a href="/" className="pk-back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back
        </a>
        <div className="pk-join">
          <div className="pk-join-card pk-join-wide">
            <div style={{ fontSize: 48, marginBottom: 8 }}>&#x1F0A1;</div>
            <h1>PCOM Poker Night</h1>
            <div className="pk-theme-badge">{theme.name}: {theme.subtitle}</div>
            <p>Pick yourself to sit down</p>
            <div className="pk-char-grid">
              {KNOWN_PLAYERS.map((profile) => {
                const seated = alreadySeated.has(profile.name.toLowerCase());
                const selected = nameInput === profile.name;
                return (
                  <button key={profile.name} onClick={() => handlePickPlayer(profile)}
                    className={`pk-char-card ${selected ? 'pk-char-selected' : ''} ${seated ? 'pk-char-returning' : ''}`}>
                    <div className="pk-char-img">
                      <img src={profile.avatar} alt={profile.name} />
                      {seated && <div className="pk-char-taken">REJOIN</div>}
                    </div>
                    <div className="pk-char-name">{profile.name}</div>
                    {profile.nickname !== profile.name && <div className="pk-char-nick">&ldquo;{profile.nickname}&rdquo;</div>}
                  </button>
                );
              })}
            </div>
            {nameInput && (
              <div className="pk-buyin-section">
                <div className="pk-selected-player">Playing as <strong>{nameInput}</strong></div>
                <div className="pk-buyin-info">Everyone starts with $1,000 PCOM Bucks. Daily bonus: +$100.</div>
                <button onClick={handleJoin} className="pk-btn pk-btn-primary">Take a Seat</button>
              </div>
            )}
            <div className="pk-custom-section">
              {!showCustom ? (
                <button onClick={() => setShowCustom(true)} className="pk-custom-toggle">I&apos;m not in the list</button>
              ) : (
                <div className="pk-custom-form">
                  <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Type your name" className="pk-input" autoFocus />
                  <button onClick={handleJoin} disabled={!nameInput.trim()} className="pk-btn pk-btn-primary" style={{ marginTop: 8 }}>Take a Seat</button>
                </div>
              )}
            </div>
            {gameState.players.length > 0 && (
              <div className="pk-seated">
                <span className="pk-seated-label">At the table:</span>
                {gameState.players.map((p) => <span key={p.name} className="pk-seated-name">{p.name}</span>)}
              </div>
            )}
          </div>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (me && !joined) setJoined(true);

  // ─── Main Game View ──────────────────────────────────────────────
  return (
    <div className="pk-page">
      {/* Background jazz */}
      <audio id="pk-jazz" loop preload="auto">
        <source src="https://audionautix.com/Music/StandardJazzBars.mp3" type="audio/mpeg" />
      </audio>

      {/* Canvas ambient background */}
      <AmbientCanvas />

      {/* Floating emoji reactions */}
      {floatingEmojis.map((e) => (
        <div key={e.id} className="pk-float-emoji" style={{ left: `${e.x}%` }}>{e.emoji}</div>
      ))}

      <a href="/" className="pk-back">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </a>

      {/* Theme banner */}
      <div className="pk-theme-banner">
        <span>{theme.emoji}</span> <span className="pk-theme-label">Tonight:</span> {theme.name} &mdash; <em>{theme.subtitle}</em>
      </div>

      {/* Music toggle */}
      <button className={`pk-music-btn ${musicPlaying ? 'pk-music-on' : ''}`} onClick={() => {
        const audio = document.getElementById('pk-jazz') as HTMLAudioElement;
        if (!audio) return;
        if (audio.paused) {
          audio.volume = 0.15;
          audio.play().then(() => setMusicPlaying(true)).catch(() => {});
        } else {
          audio.pause();
          setMusicPlaying(false);
        }
      }} title="Toggle jazz">
        {musicPlaying ? (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
        )}
      </button>

      {/* Main layout: table + chat side by side */}
      <div className="pk-layout">
        {/* Table area */}
        <div className="pk-main">
          <div className="pk-table-wrap">
            <div className="pk-table">
              <div className="pk-felt">
                {/* Table decorations */}
                <div className="pk-deco pk-deco-1">🥃</div>
                <div className="pk-deco pk-deco-2">🚬</div>
                <div className="pk-deco pk-deco-3">{theme.emoji}</div>

                <div className="pk-pot">
                  {gameState.pot > 0 && (
                    <>
                      <div className="pk-pot-chips" />
                      <span className="pk-pot-amount">Pot: ${gameState.pot.toLocaleString()}</span>
                    </>
                  )}
                </div>
                <div className="pk-community">
                  {gameState.community.map((card, i) => (
                    <div key={i} className="pk-card-deal" style={{ animationDelay: `${i * 0.1}s` }}>
                      <PokerCard card={card} />
                    </div>
                  ))}
                  {Array.from({ length: 5 - gameState.community.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="pk-card-slot" />
                  ))}
                </div>
                <div className="pk-phase">
                  {gameState.phase === 'waiting' ? 'Waiting for deal...' :
                   gameState.phase === 'showdown' ? '' :
                   gameState.phase.toUpperCase()}
                </div>
                {gameState.players.map((player, idx) => {
                  const isMe = player.name === myName;
                  const isTurn = gameState.currentTurn === idx;
                  const seatPos = getSeatPosition(idx, gameState.players.length);
                  const botPlayer = isBot(player.name);
                  return (
                    <div key={player.name}
                      className={`pk-seat ${isTurn ? 'pk-seat-active' : ''} ${player.folded ? 'pk-seat-folded' : ''}`}
                      style={{ left: `${seatPos.x}%`, top: `${seatPos.y}%` }}>
                      <div className="pk-seat-cards">
                        {player.hand.length === 2 && (
                          <>
                            <div className="pk-seat-card">
                              {isMe || gameState.phase === 'showdown' ? <PokerCard card={player.hand[0]} small /> : <CardBack small />}
                            </div>
                            <div className="pk-seat-card" style={{ marginLeft: -12 }}>
                              {isMe || gameState.phase === 'showdown' ? <PokerCard card={player.hand[1]} small /> : <CardBack small />}
                            </div>
                          </>
                        )}
                      </div>
                      {getAvatar(player.name) ? (
                        <div className={`pk-avatar pk-avatar-img ${isMe ? 'pk-avatar-me-ring' : ''}`}>
                          <img src={getAvatar(player.name)!} alt={player.name} />
                        </div>
                      ) : (
                        <div className={`pk-avatar ${isMe ? 'pk-avatar-me' : ''} ${botPlayer ? 'pk-avatar-bot' : ''}`}>
                          {botPlayer ? '🤖' : player.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      {(player.vibes?.length ?? 0) > 0 && (
                        <div className="pk-vibes">
                          {player.vibes!.map((v) => <span key={v} className="pk-vibe">{v}</span>)}
                        </div>
                      )}
                      <div className="pk-seat-name">
                        {findProfile(player.name)
                          ? (useNickname ? findProfile(player.name)!.nickname : findProfile(player.name)!.name)
                          : player.name}
                      </div>
                      <div className="pk-seat-chips">${player.chips.toLocaleString()}</div>
                      {/* Shot clock ring for active player */}
                      {isTurn && turnTimer > 0 && (
                        <div className={`pk-seat-timer ${turnTimer <= 5 ? 'pk-seat-timer-urgent' : ''}`}>{turnTimer}</div>
                      )}
                      {player.bet > 0 && (
                        <div className="pk-seat-bet"><div className="pk-bet-chip" />${player.bet}</div>
                      )}
                      {player.lastAction && (
                        <div className={`pk-action-label pk-action-${player.lastAction}`}>{player.lastAction}</div>
                      )}
                      {gameState.dealer === idx && gameState.phase !== 'waiting' && (
                        <div className="pk-dealer-chip">D</div>
                      )}
                    </div>
                  );
                })}
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
                <div className="pk-table-brand">{theme.brandText}</div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="pk-controls">
            <div className="pk-top-buttons">
              <a href="/poker/bets" className="pk-rules-btn" title="Sportsbook" style={{ textDecoration: 'none', fontSize: '18px', lineHeight: 1 }}>
                🏀
              </a>
              <button onClick={() => setShowRules(true)} className="pk-rules-btn" title="Rules">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
              </button>
              <button onClick={() => setShowSettings(true)} className="pk-settings-btn" title="Settings">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
              </button>
            </div>
            {me && (
              <div className="pk-my-info">
                <span className="pk-my-chips">${me.chips.toLocaleString()}</span>
                <div className="pk-vibe-toggles">
                  {['🥃', '🚬'].map((v) => (
                    <button key={v} onClick={async () => { const c = stateRef.current; if (c && myName) await updateState(toggleVibe(c, myName, v)); }} className={`pk-vibe-btn ${(me.vibes || []).includes(v) ? 'pk-vibe-active' : ''}`}>{v}</button>
                  ))}
                </div>
                {(() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const stats = (gameState.leaderboard || []).find((s) => s.name === myName);
                  const canClaim = stats && stats.lastDaily !== today;
                  if (canClaim) return <button onClick={handleDailyBonus} disabled={claimingBonus} className="pk-btn pk-btn-rebuy">{claimingBonus ? 'Claimed!' : 'Claim Daily +$100'}</button>;
                  if (me.chips <= 0) return <span className="pk-broke-msg">Busted! Daily bonus tomorrow</span>;
                  return null;
                })()}
              </div>
            )}
            {canStartGame && (
              <button onClick={handleDeal} className="pk-btn pk-btn-deal">
                {gameState.handNumber === 0 ? 'Start Game' : 'Deal Next Hand'}
              </button>
            )}
            {isMyTurn && !me!.folded && gameState.phase !== 'showdown' && (
              <div className="pk-actions">
                <button onClick={handleFold} className="pk-btn pk-btn-fold">Fold</button>
                {canCheck ? (
                  <button onClick={handleCheck} className="pk-btn pk-btn-check">Check</button>
                ) : (
                  <button onClick={handleCall} className="pk-btn pk-btn-call">Call ${callAmount}</button>
                )}
                {!showRaise ? (
                  <button onClick={() => { setShowRaise(true); setRaiseInput(String(minRaiseTotal)); }} className="pk-btn pk-btn-raise">Raise</button>
                ) : (
                  <div className="pk-raise-controls">
                    <input type="number" value={raiseInput} onChange={(e) => setRaiseInput(e.target.value)} min={minRaiseTotal} max={me!.chips + me!.bet} className="pk-raise-input" autoFocus />
                    <button onClick={handleRaise} className="pk-btn pk-btn-raise-confirm">Raise to ${raiseInput}</button>
                  </div>
                )}
                <button onClick={handleAllIn} className="pk-btn pk-btn-allin">All In</button>
              </div>
            )}
            {gameState.phase !== 'waiting' && gameState.phase !== 'showdown' && !isMyTurn && me && !me.folded && (
              <div className="pk-waiting-msg">Waiting for {gameState.players[gameState.currentTurn]?.name || '...'}</div>
            )}
            {me && me.folded && gameState.phase !== 'showdown' && gameState.phase !== 'waiting' && (
              <div className="pk-waiting-msg pk-folded-msg">You folded this hand</div>
            )}
            {gameState.phase === 'showdown' && <div className="pk-waiting-msg">Next hand in 5s...</div>}
          </div>
        </div>

        {/* Chat panel */}
        <div className={`pk-chat ${chatOpen ? 'pk-chat-open' : 'pk-chat-closed'}`}>
          {!chatOpen ? (
            <button onClick={() => setChatOpen(true)} className="pk-chat-toggle">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zm-6 0H7v2h2V9z" clipRule="evenodd"/></svg>
            </button>
          ) : (
            <>
              <div className="pk-chat-header">
                <div className="pk-chat-tabs">
                  <button onClick={() => setChatTab('chat')} className={`pk-chat-tab ${chatTab === 'chat' ? 'pk-chat-tab-active' : ''}`}>Chat</button>
                  <button onClick={() => setChatTab('leaderboard')} className={`pk-chat-tab ${chatTab === 'leaderboard' ? 'pk-chat-tab-active' : ''}`}>Board</button>
                </div>
                <button onClick={() => setChatOpen(false)} className="pk-chat-close">&times;</button>
              </div>

              {/* Always-visible hand rankings cheatsheet with example cards */}
              <div className="pk-cheat">
                <div className="pk-cheat-title">Hand Rankings</div>
                <div className="pk-cheat-row pk-cheat-best"><span className="pk-cheat-cards"><span className="pk-cr">A</span><span className="pk-cs">&#9824;</span> <span className="pk-cr">K</span><span className="pk-cs">&#9824;</span> <span className="pk-cr">Q</span><span className="pk-cs">&#9824;</span> <span className="pk-cr">J</span><span className="pk-cs">&#9824;</span> <span className="pk-cr">10</span><span className="pk-cs">&#9824;</span></span><span>Royal Flush</span></div>
                <div className="pk-cheat-row"><span className="pk-cheat-cards"><span className="pk-cr pk-red">9</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr pk-red">8</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr pk-red">7</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr pk-red">6</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr pk-red">5</span><span className="pk-cs pk-red">&#9829;</span></span><span>Str. Flush</span></div>
                <div className="pk-cheat-row"><span className="pk-cheat-cards"><span className="pk-cr">K</span><span className="pk-cs">&#9827;</span> <span className="pk-cr pk-red">K</span><span className="pk-cs pk-red">&#9830;</span> <span className="pk-cr pk-red">K</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr">K</span><span className="pk-cs">&#9824;</span></span><span>Four of a Kind</span></div>
                <div className="pk-cheat-row"><span className="pk-cheat-cards"><span className="pk-cr pk-red">J</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr">J</span><span className="pk-cs">&#9824;</span> <span className="pk-cr pk-red">J</span><span className="pk-cs pk-red">&#9830;</span> <span className="pk-cr">8</span><span className="pk-cs">&#9827;</span> <span className="pk-cr">8</span><span className="pk-cs">&#9824;</span></span><span>Full House</span></div>
                <div className="pk-cheat-row"><span className="pk-cheat-cards"><span className="pk-cr pk-red">A</span><span className="pk-cs pk-red">&#9830;</span> <span className="pk-cr pk-red">J</span><span className="pk-cs pk-red">&#9830;</span> <span className="pk-cr pk-red">8</span><span className="pk-cs pk-red">&#9830;</span> <span className="pk-cr pk-red">6</span><span className="pk-cs pk-red">&#9830;</span> <span className="pk-cr pk-red">2</span><span className="pk-cs pk-red">&#9830;</span></span><span>Flush</span></div>
                <div className="pk-cheat-row"><span className="pk-cheat-cards"><span className="pk-cr">10</span><span className="pk-cs">&#9824;</span> <span className="pk-cr pk-red">9</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr">8</span><span className="pk-cs">&#9827;</span> <span className="pk-cr pk-red">7</span><span className="pk-cs pk-red">&#9830;</span> <span className="pk-cr">6</span><span className="pk-cs">&#9824;</span></span><span>Straight</span></div>
                <div className="pk-cheat-row"><span className="pk-cheat-cards"><span className="pk-cr pk-red">Q</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr">Q</span><span className="pk-cs">&#9824;</span> <span className="pk-cr">Q</span><span className="pk-cs">&#9827;</span></span><span>Three of a Kind</span></div>
                <div className="pk-cheat-row"><span className="pk-cheat-cards"><span className="pk-cr">A</span><span className="pk-cs">&#9824;</span> <span className="pk-cr pk-red">A</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr">5</span><span className="pk-cs">&#9827;</span> <span className="pk-cr pk-red">5</span><span className="pk-cs pk-red">&#9830;</span></span><span>Two Pair</span></div>
                <div className="pk-cheat-row"><span className="pk-cheat-cards"><span className="pk-cr pk-red">K</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr">K</span><span className="pk-cs">&#9827;</span></span><span>One Pair</span></div>
                <div className="pk-cheat-row pk-cheat-worst"><span className="pk-cheat-cards"><span className="pk-cr">A</span><span className="pk-cs">&#9824;</span> <span className="pk-cr pk-red">J</span><span className="pk-cs pk-red">&#9829;</span> <span className="pk-cr">8</span><span className="pk-cs">&#9827;</span></span><span>High Card</span></div>
              </div>

              {chatTab === 'chat' ? (
                <>
                  <div className="pk-chat-messages">
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className={`pk-chat-msg ${msg.emoji ? 'pk-chat-reaction' : ''}`}>
                        {msg.emoji ? (
                          <><span className="pk-chat-name">{msg.name}</span><span className="pk-chat-emoji-big">{msg.emoji}</span></>
                        ) : (
                          <><span className="pk-chat-name">{msg.name}</span><span className="pk-chat-text">{msg.text}</span></>
                        )}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="pk-chat-reactions">
                    {['🔥', '💀', '🤡', '😂', '🫡', '💰'].map((e) => (
                      <button key={e} onClick={() => handleReaction(e)} className="pk-react-btn">{e}</button>
                    ))}
                  </div>
                  <form className="pk-chat-input-row" onSubmit={(ev) => { ev.preventDefault(); handleSendChat(); }}>
                    <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Talk trash..." className="pk-chat-input" maxLength={200} />
                    <button type="submit" className="pk-chat-send" disabled={!chatInput.trim()}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
                    </button>
                  </form>
                </>
              ) : (
                <div className="pk-leaderboard">
                  {/* Current table */}
                  <div className="pk-lb-section-label">At the Table</div>
                  {gameState.players
                    .filter((p) => !isBot(p.name))
                    .sort((a, b) => b.chips - a.chips)
                    .map((player, i) => (
                      <div key={player.name} className={`pk-lb-row ${player.name === myName ? 'pk-lb-me' : ''}`}>
                        <span className="pk-lb-rank">{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                        <div className="pk-lb-player">
                          {getAvatar(player.name) && <img src={getAvatar(player.name)!} alt="" className="pk-lb-avatar" />}
                          <span className="pk-lb-name">{player.name}</span>
                        </div>
                        <div className="pk-lb-stats">
                          <span className="pk-lb-chips">${player.chips.toLocaleString()}</span>
                          <span className="pk-lb-wins">{player.folded ? 'Folded' : player.allIn ? 'All In' : ''}</span>
                        </div>
                      </div>
                    ))
                  }
                  {gameState.players.filter((p) => !isBot(p.name)).length === 0 && (
                    <div className="pk-lb-empty">No humans at the table</div>
                  )}

                  {/* All-time stats */}
                  {(gameState.leaderboard || []).filter((s) => !isBot(s.name)).length > 0 && (
                    <>
                      <div className="pk-lb-section-label pk-lb-section-alltime">All-Time Stats</div>
                      {[...(gameState.leaderboard || [])]
                        .filter((s) => !isBot(s.name))
                        .sort((a, b) => b.handsWon - a.handsWon)
                        .map((stats) => (
                          <div key={stats.name} className={`pk-lb-row pk-lb-row-small ${stats.name === myName ? 'pk-lb-me' : ''}`}>
                            <div className="pk-lb-player">
                              {getAvatar(stats.name) && <img src={getAvatar(stats.name)!} alt="" className="pk-lb-avatar" />}
                              <span className="pk-lb-name">{stats.name}</span>
                            </div>
                            <div className="pk-lb-stats">
                              <span className="pk-lb-wins">{stats.handsWon}W &bull; Best: ${stats.biggestPot.toLocaleString()}</span>
                            </div>
                          </div>
                        ))
                      }
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showSettings && (
        <div className="pk-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="pk-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <div className="pk-setting-row">
              <label>Show nicknames</label>
              <button onClick={() => { const next = !useNickname; setUseNickname(next); localStorage.setItem('pokerUseNickname', String(next)); }} className={`pk-toggle ${useNickname ? 'pk-toggle-on' : ''}`}>{useNickname ? 'ON' : 'OFF'}</button>
            </div>
            <div className="pk-setting-row">
              <label>Change name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={myName || 'Your name'} className="pk-input pk-input-sm" />
              <button onClick={() => { if (editName.trim()) { localStorage.setItem('guestName', editName.trim()); setMyName(editName.trim()); setEditName(''); } }} className="pk-btn pk-btn-sm" disabled={!editName.trim()}>Save</button>
            </div>
            <button onClick={() => setShowSettings(false)} className="pk-btn pk-btn-secondary pk-btn-full">Done</button>
          </div>
        </div>
      )}
      {showRules && (
        <div className="pk-modal-overlay" onClick={() => setShowRules(false)}>
          <div className="pk-modal pk-modal-rules" onClick={(e) => e.stopPropagation()}>
            <h3>PCOM Poker Night</h3>
            <div className="pk-rules-content">
              <div className="pk-rules-section">
                <h4>The Game</h4>
                <p>No-Limit Texas Hold&apos;em. Best 5-card hand wins. Bot dealers (Dr. House, Dr. Grey, Dr. Cox) fill empty seats so there&apos;s always action.</p>
              </div>
              <div className="pk-rules-section">
                <h4>PCOM Bucks</h4>
                <ul>
                  <li>Start: <strong>$1,000</strong></li>
                  <li>Daily bonus: <strong>+$100</strong></li>
                  <li>Match Day (Mar 20): <strong>+$500</strong></li>
                  <li>Graduation (Apr 28): <strong>+$500</strong></li>
                </ul>
              </div>
              <div className="pk-rules-section">
                <h4>Speed Rules</h4>
                <ul>
                  <li><strong>20s shot clock</strong> &mdash; auto-fold if you stall</li>
                  <li><strong>Auto-deal</strong> &mdash; next hand in 5s</li>
                  <li><strong>Drop in/out</strong> &mdash; join or leave anytime</li>
                </ul>
              </div>
              <div className="pk-rules-section">
                <h4>Theme Nights</h4>
                <ul>
                  <li>Sun: 🦴 Anatomy Lab</li>
                  <li>Mon: 🔥 Flavortown</li>
                  <li>Tue: 🧅 Shrek&apos;s Swamp</li>
                  <li>Wed: 💪 Bro Science</li>
                  <li>Thu: 📚 Board Exam PTSD</li>
                  <li>Fri: 🦕 Jurassic Poker</li>
                  <li>Sat: 🏥 Match Day</li>
                </ul>
              </div>
              <div className="pk-rules-section">
                <h4>Hand Rankings</h4>
                <div className="pk-hands-list">
                  <div className="pk-hand-row"><span className="pk-hand-cards">A&#9824; K&#9824; Q&#9824; J&#9824; 10&#9824;</span><span>Royal Flush</span></div>
                  <div className="pk-hand-row"><span className="pk-hand-cards">9&#9829; 8&#9829; 7&#9829; 6&#9829; 5&#9829;</span><span>Straight Flush</span></div>
                  <div className="pk-hand-row"><span className="pk-hand-cards">K&#9827; K&#9830; K&#9829; K&#9824;</span><span>Four of a Kind</span></div>
                  <div className="pk-hand-row"><span className="pk-hand-cards">J&#9829; J&#9824; J&#9830; 8&#9827; 8&#9824;</span><span>Full House</span></div>
                  <div className="pk-hand-row"><span className="pk-hand-cards">A&#9830; J&#9830; 8&#9830; 6&#9830; 2&#9830;</span><span>Flush</span></div>
                  <div className="pk-hand-row"><span className="pk-hand-cards">10&#9824; 9&#9829; 8&#9827; 7&#9830; 6&#9824;</span><span>Straight</span></div>
                  <div className="pk-hand-row"><span className="pk-hand-cards">Q&#9829; Q&#9824; Q&#9827;</span><span>Three of a Kind</span></div>
                  <div className="pk-hand-row"><span className="pk-hand-cards">A&#9824; A&#9829; 5&#9827; 5&#9830;</span><span>Two Pair</span></div>
                  <div className="pk-hand-row"><span className="pk-hand-cards">K&#9829; K&#9827;</span><span>One Pair</span></div>
                  <div className="pk-hand-row"><span className="pk-hand-cards">A&#9824; J&#9829; 8&#9827; 5&#9830; 2&#9824;</span><span>High Card</span></div>
                </div>
              </div>
            </div>
            <button onClick={() => setShowRules(false)} className="pk-btn pk-btn-secondary pk-btn-full">Got It</button>
          </div>
        </div>
      )}

      {/* AFK prompt */}
      {afkPrompt && (
        <div className="pk-modal-overlay">
          <div className="pk-modal">
            <h3>You still there?</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: 0 }}>
              You&apos;ve been auto-folded 3 times in a row. Tap below to stay in the game or you&apos;ll be removed.
            </p>
            <button onClick={() => {
              setAfkPrompt(false);
              if (stateRef.current && myName) {
                const cleared = { ...stateRef.current, players: stateRef.current.players.map((p) => p.name === myName ? { ...p, autoFoldCount: 0 } : p) };
                updateState(cleared);
              }
            }} className="pk-btn pk-btn-deal pk-btn-full">I&apos;m Here</button>
            <button onClick={() => {
              setAfkPrompt(false);
              if (stateRef.current && myName) {
                const removed = { ...stateRef.current, players: stateRef.current.players.filter((p) => p.name !== myName) };
                updateState(removed);
                setJoined(false);
              }
            }} className="pk-btn pk-btn-secondary pk-btn-full">Leave Table</button>
          </div>
        </div>
      )}

      <style jsx>{styles}</style>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

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
        .pkc { width: 56px; height: 80px; border-radius: 6px; background: linear-gradient(170deg, #fff 0%, #f0f0f0 100%); border: 1px solid rgba(0,0,0,0.12); display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
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
        .pkc-back { width: 56px; height: 80px; border-radius: 6px; background: linear-gradient(135deg, ${theme.cardBack}, ${theme.cardBack}cc); border: 2px solid rgba(255,255,255,0.15); box-shadow: 0 2px 8px rgba(0,0,0,0.3); position: relative; overflow: hidden; }
        .pkc-back::after { content: ''; position: absolute; inset: 4px; border-radius: 3px; border: 1px solid rgba(201,169,78,0.3); background: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(201,169,78,0.05) 4px, rgba(201,169,78,0.05) 8px); }
        .pkc-back-sm { width: 42px; height: 60px; }
      `}</style>
    </div>
  );
}

function getSeatPosition(index: number, total: number): { x: number; y: number } {
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
  return (positions[total] || positions[8]!)[index] || { x: 50, y: 50 };
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = `
  .pk-page {
    min-height: 100dvh;
    background:
      radial-gradient(ellipse at 20% 0%, ${theme.pageTint} 0%, transparent 50%),
      radial-gradient(ellipse at 80% 100%, rgba(201,169,78,0.06) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, #0a0a18 0%, #050510 100%);
    display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: white; overflow: hidden; position: relative;
  }

  /* Floating emoji reactions */
  .pk-float-emoji {
    position: fixed; bottom: 30%; font-size: 36px; z-index: 60;
    animation: emojiFloat 2s ease-out forwards; pointer-events: none;
  }
  @keyframes emojiFloat {
    0% { transform: translateY(0) scale(0.5); opacity: 1; }
    100% { transform: translateY(-200px) scale(1.3); opacity: 0; }
  }

  /* ─── Layout ─── */
  .pk-layout {
    flex: 1; display: flex; position: relative; z-index: 1;
  }
  .pk-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

  .pk-back {
    position: fixed; top: 12px; left: 12px; z-index: 50;
    color: rgba(255,255,255,0.4); text-decoration: none;
    font-size: 14px; display: flex; align-items: center; gap: 4px;
  }
  .pk-back:hover { color: rgba(255,255,255,0.8); }

  /* ─── Theme Banner ─── */
  .pk-theme-banner {
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 50;
    background: rgba(201,169,78,0.1); border: 1px solid rgba(201,169,78,0.2);
    padding: 4px 16px; border-radius: 20px; font-size: 12px;
    color: rgba(201,169,78,0.7); font-weight: 600;
  }
  .pk-theme-label { color: rgba(255,255,255,0.4); }
  .pk-theme-badge {
    background: rgba(201,169,78,0.1); border: 1px solid rgba(201,169,78,0.2);
    padding: 4px 14px; border-radius: 20px; font-size: 12px;
    color: rgba(201,169,78,0.7); font-weight: 600; margin-bottom: 12px; display: inline-block;
  }

  /* Music button */
  .pk-music-btn {
    position: fixed; top: 12px; left: 50px; z-index: 50;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.4); width: 36px; height: 36px;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s;
  }
  .pk-music-btn:hover { color: #C9A94E; background: rgba(201,169,78,0.1); }
  .pk-music-on { color: #C9A94E !important; background: rgba(201,169,78,0.15); border-color: rgba(201,169,78,0.3); }

  /* ─── Join Screen ─── */
  .pk-join { flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .pk-join-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 40px; max-width: 420px; width: 100%; text-align: center; }
  .pk-join-card h1 { font-size: 28px; font-weight: 800; margin-bottom: 4px; }
  .pk-join-card p { color: rgba(255,255,255,0.4); font-size: 14px; margin-bottom: 24px; }
  .pk-join-wide { max-width: 680px; }
  .pk-input { width: 100%; padding: 14px; border-radius: 12px; font-size: 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; text-align: center; outline: none; }
  .pk-input:focus { border-color: rgba(201,169,78,0.5); }

  .pk-char-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
  @media (max-width: 580px) { .pk-char-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; } }

  .pk-char-card { background: rgba(255,255,255,0.03); border: 2px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px 10px 12px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .pk-char-card:hover { border-color: rgba(201,169,78,0.3); background: rgba(201,169,78,0.05); transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
  .pk-char-selected { border-color: rgba(201,169,78,0.6) !important; background: rgba(201,169,78,0.1) !important; box-shadow: 0 0 30px rgba(201,169,78,0.2); transform: translateY(-4px); }
  .pk-char-returning { border-color: rgba(59,130,246,0.3); }
  .pk-char-returning .pk-char-img { border-color: rgba(59,130,246,0.4); }

  .pk-char-img { width: 90px; height: 90px; border-radius: 50%; overflow: hidden; border: 3px solid rgba(255,255,255,0.15); position: relative; box-shadow: 0 4px 16px rgba(0,0,0,0.4); transition: border-color 0.2s; }
  .pk-char-selected .pk-char-img { border-color: #C9A94E; box-shadow: 0 0 20px rgba(201,169,78,0.3), 0 4px 16px rgba(0,0,0,0.4); }
  .pk-char-img img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .pk-char-taken { position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%); background: rgba(59,130,246,0.8); font-size: 8px; font-weight: 800; color: white; letter-spacing: 1px; padding: 2px 8px; border-radius: 8px; white-space: nowrap; }
  .pk-char-name { font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.8); }
  .pk-char-nick { font-size: 11px; color: rgba(201,169,78,0.5); font-style: italic; }

  .pk-buyin-section { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px 0 8px; border-top: 1px solid rgba(255,255,255,0.06); animation: fadeIn 0.3s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .pk-selected-player { font-size: 14px; color: rgba(255,255,255,0.5); }
  .pk-selected-player strong { color: #C9A94E; }
  .pk-buyin-info { font-size: 12px; color: rgba(255,255,255,0.3); }
  .pk-custom-section { margin-top: 12px; text-align: center; }
  .pk-custom-toggle { font-size: 13px; color: rgba(255,255,255,0.3); background: none; border: none; cursor: pointer; text-decoration: underline; padding: 8px; }
  .pk-custom-form { display: flex; flex-direction: column; gap: 6px; }
  .pk-seated { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-items: center; }
  .pk-seated-label { font-size: 11px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 1px; }
  .pk-seated-name { font-size: 12px; padding: 4px 10px; border-radius: 20px; background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); }

  /* ─── Table ─── */
  .pk-table-wrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 12px 8px; }
  .pk-table { width: 100%; max-width: 700px; aspect-ratio: 16/10; position: relative; }
  .pk-felt {
    width: 100%; height: 100%;
    background:
      radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.04) 0%, transparent 60%),
      radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.02) 0%, transparent 40%),
      ${theme.feltGradient};
    border-radius: 50%; border: 10px solid #2a1a0a;
    box-shadow:
      inset 0 0 80px rgba(0,0,0,0.4), inset 0 -20px 60px rgba(0,0,0,0.15),
      0 0 0 3px #1a0f05, 0 0 0 6px rgba(201,169,78,0.15), 0 0 0 10px #2a1a0a,
      0 30px 80px rgba(0,0,0,0.7);
    position: relative; overflow: visible;
  }
  .pk-felt::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); opacity: 0.04; mix-blend-mode: overlay; pointer-events: none; }

  /* Table emoji decorations */
  .pk-deco {
    position: absolute; z-index: 4; font-size: 20px;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
    animation: decoFloat 6s ease-in-out infinite;
    opacity: 0.6;
  }
  .pk-deco-1 { bottom: 22%; left: 16%; animation-delay: 0s; }
  .pk-deco-2 { bottom: 24%; right: 14%; animation-delay: -2s; }
  .pk-deco-3 { top: 28%; right: 22%; animation-delay: -4s; font-size: 16px; }
  @keyframes decoFloat {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-4px) rotate(3deg); }
  }

  .pk-table-brand { position: absolute; bottom: 18%; left: 50%; transform: translateX(-50%); color: rgba(201,169,78,0.1); font-size: 14px; font-weight: 900; letter-spacing: 6px; pointer-events: none; }

  .pk-pot { position: absolute; top: 25%; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 5; }
  .pk-pot-chips { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #C9A94E, #8B6914); border: 2px dashed rgba(255,255,255,0.4); box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
  .pk-pot-amount { font-size: 14px; font-weight: 800; color: #C9A94E; text-shadow: 0 1px 4px rgba(0,0,0,0.6); }

  .pk-community { position: absolute; top: 38%; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 5; }
  .pk-card-deal { animation: cardDeal 0.3s ease-out both; }
  @keyframes cardDeal { from { opacity: 0; transform: translateY(-20px) scale(0.8); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .pk-card-slot { width: 56px; height: 80px; border-radius: 6px; border: 1px dashed rgba(255,255,255,0.08); }

  .pk-phase { position: absolute; top: 18%; left: 50%; transform: translateX(-50%); font-size: 11px; color: rgba(201,169,78,0.4); font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }

  /* ─── Seats ─── */
  .pk-seat { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all 0.3s; z-index: 10; }
  .pk-seat-active .pk-avatar { box-shadow: 0 0 0 3px rgba(201,169,78,0.6), 0 0 20px rgba(201,169,78,0.3); }
  .pk-seat-folded { opacity: 0.4; }
  .pk-seat-cards { display: flex; margin-bottom: 4px; }
  .pk-seat-card { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); }

  .pk-avatar { width: 52px; height: 52px; border-radius: 50%; background: rgba(139,26,43,0.6); border: 3px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.5); transition: box-shadow 0.3s; }
  .pk-avatar-me { background: linear-gradient(135deg, #C9A94E, #8B6914); }
  .pk-avatar-bot { background: linear-gradient(135deg, #374151, #1f2937); border-color: rgba(156,163,175,0.3); font-size: 22px; }
  .pk-avatar-img { overflow: hidden; padding: 0; background: none; border: 2px solid rgba(255,255,255,0.3); }
  .pk-avatar-img img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 50%; }
  .pk-avatar-me-ring { border-color: #C9A94E !important; box-shadow: 0 0 0 2px rgba(201,169,78,0.4), 0 2px 8px rgba(0,0,0,0.3); }

  .pk-seat-name { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.7); max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pk-seat-chips { font-size: 10px; color: rgba(201,169,78,0.7); font-weight: 700; }

  .pk-seat-timer {
    position: absolute; top: -26px; left: 50%; transform: translateX(-50%);
    font-size: 11px; font-weight: 800; color: #C9A94E;
    background: rgba(0,0,0,0.6); padding: 2px 8px; border-radius: 10px;
    border: 1px solid rgba(201,169,78,0.3);
  }
  .pk-seat-timer-urgent { color: #ef4444; border-color: rgba(239,68,68,0.4); animation: urgentPulse 0.5s ease-in-out infinite; }
  @keyframes urgentPulse { 0%, 100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.1); } }

  .pk-seat-bet { position: absolute; top: -8px; right: -28px; font-size: 11px; font-weight: 700; color: white; display: flex; align-items: center; gap: 3px; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 10px; }
  .pk-bet-chip { width: 12px; height: 12px; border-radius: 50%; background: linear-gradient(135deg, #C9A94E, #8B6914); border: 1px dashed rgba(255,255,255,0.4); }

  .pk-action-label { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 8px; text-transform: uppercase; letter-spacing: 1px; position: absolute; top: -20px; animation: actionPop 0.3s ease-out; }
  @keyframes actionPop { from { opacity: 0; transform: scale(0.8) translateY(4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  .pk-action-fold { background: rgba(239,68,68,0.2); color: #fca5a5; }
  .pk-action-check { background: rgba(34,197,94,0.2); color: #86efac; }
  .pk-action-call { background: rgba(59,130,246,0.2); color: #93c5fd; }
  .pk-action-raise { background: rgba(201,169,78,0.2); color: #C9A94E; }
  .pk-action-all-in { background: rgba(168,85,247,0.3); color: #c084fc; }

  .pk-dealer-chip { position: absolute; top: 50%; right: -22px; transform: translateY(-50%); width: 22px; height: 22px; border-radius: 50%; background: white; color: #1a1a2e; font-size: 11px; font-weight: 900; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }

  .pk-vibes { position: absolute; left: -18px; top: 8px; display: flex; flex-direction: column; gap: 2px; z-index: 12; }
  .pk-vibe { font-size: 18px; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.5)); animation: vibeFloat 2s ease-in-out infinite; }
  .pk-vibe:nth-child(2) { animation-delay: 0.5s; }
  @keyframes vibeFloat { 0%, 100% { transform: translateY(0) rotate(-5deg); } 50% { transform: translateY(-3px) rotate(5deg); } }

  .pk-vibe-toggles { display: flex; gap: 4px; }
  .pk-vibe-btn { font-size: 20px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 4px 8px; cursor: pointer; transition: all 0.2s; opacity: 0.5; }
  .pk-vibe-btn:hover { opacity: 0.8; background: rgba(255,255,255,0.1); }
  .pk-vibe-active { opacity: 1 !important; background: rgba(201,169,78,0.15); border-color: rgba(201,169,78,0.4); box-shadow: 0 0 8px rgba(201,169,78,0.2); }

  .pk-winners { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 20; display: flex; flex-direction: column; gap: 6px; }
  .pk-winner-banner { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); padding: 10px 20px; border-radius: 14px; text-align: center; font-size: 14px; color: #86efac; animation: winnerPop 0.5s ease-out; }
  @keyframes winnerPop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
  .pk-winner-hand { display: block; font-size: 11px; color: rgba(134,239,172,0.6); margin-top: 2px; }

  /* ─── Controls ─── */
  .pk-controls { padding: 8px 16px 24px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .pk-top-buttons { position: fixed; top: 12px; right: 12px; z-index: 50; display: flex; gap: 8px; }
  .pk-settings-btn, .pk-rules-btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
  .pk-settings-btn:hover, .pk-rules-btn:hover { color: white; background: rgba(255,255,255,0.12); }
  .pk-my-info { display: flex; align-items: center; gap: 12px; }
  .pk-my-chips { font-size: 22px; font-weight: 800; color: #C9A94E; font-variant-numeric: tabular-nums; }
  .pk-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

  .pk-btn { padding: 12px 24px; border-radius: 14px; font-size: 14px; font-weight: 700; border: none; cursor: pointer; transition: all 0.15s; text-transform: uppercase; letter-spacing: 1px; }
  .pk-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .pk-btn:hover:not(:disabled) { transform: translateY(-2px); }
  .pk-btn-primary { background: linear-gradient(135deg, #8B1A2B, #a62040); color: white; box-shadow: 0 4px 16px rgba(139,26,43,0.4); padding: 14px 36px; font-size: 16px; }
  .pk-btn-deal { background: linear-gradient(135deg, #C9A94E, #8B6914); color: #1a1a2e; box-shadow: 0 4px 16px rgba(201,169,78,0.3); padding: 14px 36px; font-size: 16px; }
  .pk-btn-fold { background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
  .pk-btn-check { background: rgba(34,197,94,0.15); color: #86efac; border: 1px solid rgba(34,197,94,0.3); }
  .pk-btn-call { background: rgba(59,130,246,0.15); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }
  .pk-btn-raise { background: rgba(201,169,78,0.15); color: #C9A94E; border: 1px solid rgba(201,169,78,0.3); }
  .pk-btn-allin { background: rgba(168,85,247,0.2); color: #c084fc; border: 1px solid rgba(168,85,247,0.3); }
  .pk-btn-rebuy { background: rgba(34,197,94,0.15); color: #86efac; border: 1px solid rgba(34,197,94,0.3); font-size: 12px; padding: 8px 16px; }
  .pk-btn-secondary { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.1); }
  .pk-btn-full { width: 100%; text-align: center; }
  .pk-btn-sm { padding: 8px 12px !important; font-size: 12px !important; border-radius: 8px !important; }
  .pk-broke-msg { font-size: 12px; color: rgba(239,68,68,0.6); }

  .pk-raise-controls { display: flex; gap: 6px; align-items: center; }
  .pk-raise-input { width: 100px; padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(201,169,78,0.3); color: white; font-size: 14px; text-align: center; outline: none; }
  .pk-btn-raise-confirm { background: linear-gradient(135deg, #C9A94E, #8B6914); color: #1a1a2e; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; }

  .pk-waiting-msg { font-size: 13px; color: rgba(255,255,255,0.3); animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
  .pk-folded-msg { color: rgba(239,68,68,0.4); }

  /* ─── Chat ─── */
  .pk-chat { display: flex; flex-direction: column; z-index: 40; }
  .pk-chat-open {
    width: 260px; flex-shrink: 0; height: 100dvh;
    background: rgba(10,10,20,0.92); border-left: 1px solid rgba(255,255,255,0.06);
    backdrop-filter: blur(12px);
  }
  .pk-chat-closed { position: fixed; bottom: 100px; right: 12px; }
  .pk-chat-toggle { width: 48px; height: 48px; border-radius: 50%; background: rgba(201,169,78,0.2); border: 1px solid rgba(201,169,78,0.4); color: #C9A94E; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; position: relative; }
  .pk-chat-toggle:hover { background: rgba(201,169,78,0.3); transform: scale(1.1); }
  .pk-chat-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .pk-chat-tabs { display: flex; gap: 4px; }
  .pk-chat-tab {
    padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700;
    background: none; border: 1px solid transparent; color: rgba(255,255,255,0.3);
    cursor: pointer; transition: all 0.15s;
  }
  .pk-chat-tab:hover { color: rgba(255,255,255,0.6); }
  .pk-chat-tab-active { color: #C9A94E; background: rgba(201,169,78,0.1); border-color: rgba(201,169,78,0.2); }
  .pk-chat-close { background: none; border: none; color: rgba(255,255,255,0.3); font-size: 22px; cursor: pointer; line-height: 1; }
  .pk-chat-close:hover { color: white; }
  /* Cheatsheet */
  .pk-cheat {
    padding: 8px 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(0,0,0,0.25); flex-shrink: 0;
  }
  .pk-cheat-title {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;
    color: rgba(201,169,78,0.5); margin-bottom: 5px; text-align: center;
  }
  .pk-cheat-row {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 11px; color: rgba(255,255,255,0.45); line-height: 1;
    padding: 3px 6px; border-radius: 4px;
  }
  .pk-cheat-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
  .pk-cheat-cards { font-size: 13px; font-weight: 700; letter-spacing: -0.5px; }
  .pk-cr { color: rgba(255,255,255,0.7); }
  .pk-cs { font-size: 12px; margin-right: 3px; color: rgba(255,255,255,0.5); }
  .pk-red { color: rgba(239,68,68,0.8) !important; }
  .pk-cheat-best { background: rgba(201,169,78,0.08) !important; }
  .pk-cheat-best span:last-child { color: rgba(201,169,78,0.8); font-weight: 700; }
  .pk-cheat-worst { color: rgba(255,255,255,0.25); }

  .pk-chat-messages { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
  .pk-chat-msg { font-size: 13px; line-height: 1.4; padding: 4px 0; animation: chatIn 0.2s ease-out; }
  @keyframes chatIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .pk-chat-name { font-weight: 700; color: #C9A94E; margin-right: 6px; font-size: 12px; }
  .pk-chat-text { color: rgba(255,255,255,0.7); }
  .pk-chat-reaction .pk-chat-emoji-big { font-size: 18px; }
  .pk-chat-reactions { display: flex; gap: 4px; padding: 6px 12px; border-top: 1px solid rgba(255,255,255,0.06); }
  .pk-react-btn { flex: 1; padding: 6px; border-radius: 8px; font-size: 18px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: all 0.15s; text-align: center; }
  .pk-react-btn:hover { background: rgba(255,255,255,0.1); transform: scale(1.15); }
  .pk-chat-input-row { display: flex; gap: 6px; padding: 8px 12px 12px; border-top: 1px solid rgba(255,255,255,0.06); }
  .pk-chat-input { flex: 1; padding: 8px 12px; border-radius: 10px; font-size: 13px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; outline: none; -webkit-text-fill-color: white; opacity: 1; }
  .pk-chat-input:focus { border-color: rgba(201,169,78,0.4); }
  .pk-chat-input::placeholder { color: rgba(255,255,255,0.2); }
  .pk-chat-send { width: 36px; height: 36px; border-radius: 10px; background: rgba(201,169,78,0.2); border: 1px solid rgba(201,169,78,0.3); color: #C9A94E; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .pk-chat-send:disabled { opacity: 0.3; }

  /* ─── Modals ─── */
  .pk-modal-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
  .pk-modal { background: #1a1a2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; max-width: 360px; width: 100%; display: flex; flex-direction: column; gap: 16px; }
  .pk-modal h3 { font-size: 18px; font-weight: 700; margin: 0; }
  .pk-modal-rules { max-width: 440px; max-height: 80vh; overflow-y: auto; }
  .pk-rules-content { display: flex; flex-direction: column; gap: 16px; }
  .pk-rules-section h4 { font-size: 14px; font-weight: 700; color: #C9A94E; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1px; }
  .pk-rules-section p { font-size: 13px; color: rgba(255,255,255,0.6); margin: 0; line-height: 1.5; }
  .pk-rules-section ul, .pk-rules-section ol { margin: 0; padding-left: 20px; font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.8; }
  .pk-rules-section strong { color: #C9A94E; }
  .pk-hands-list { display: flex; flex-direction: column; gap: 6px; }
  .pk-hand-row {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 5px 10px; border-radius: 8px; background: rgba(255,255,255,0.03);
    font-size: 13px; color: rgba(255,255,255,0.6);
  }
  .pk-hand-row:first-child { background: rgba(201,169,78,0.08); color: #C9A94E; }
  .pk-hand-cards { font-family: monospace; font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 1px; }
  .pk-setting-row { display: flex; align-items: center; gap: 8px; }
  .pk-setting-row label { font-size: 13px; color: rgba(255,255,255,0.6); flex-shrink: 0; }
  .pk-toggle { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); cursor: pointer; margin-left: auto; }
  .pk-toggle-on { background: rgba(201,169,78,0.15); border-color: rgba(201,169,78,0.4); color: #C9A94E; }
  .pk-input-sm { padding: 8px 12px !important; font-size: 13px !important; flex: 1; min-width: 0; }

  /* ─── Leaderboard ─── */
  .pk-leaderboard { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
  .pk-lb-row {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    border-radius: 10px; background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.04); transition: all 0.15s;
  }
  .pk-lb-row:first-child { background: rgba(201,169,78,0.06); border-color: rgba(201,169,78,0.15); }
  .pk-lb-me { border-color: rgba(201,169,78,0.3) !important; }
  .pk-lb-rank { font-size: 14px; width: 28px; text-align: center; flex-shrink: 0; }
  .pk-lb-player { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .pk-lb-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; object-position: top; flex-shrink: 0; }
  .pk-lb-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pk-lb-stats { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
  .pk-lb-chips { font-size: 13px; font-weight: 800; color: #C9A94E; }
  .pk-lb-wins { font-size: 10px; color: rgba(255,255,255,0.3); }
  .pk-lb-empty { padding: 20px; text-align: center; color: rgba(255,255,255,0.2); font-size: 13px; }
  .pk-lb-section-label { font-size: 10px; font-weight: 700; color: rgba(201,169,78,0.5); text-transform: uppercase; letter-spacing: 1.5px; padding: 8px 10px 4px; }
  .pk-lb-section-alltime { margin-top: 8px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); }
  .pk-lb-row-small { padding: 5px 10px; }
  .pk-lb-row-small .pk-lb-name { font-size: 12px; }
  .pk-lb-row-small .pk-lb-wins { font-size: 10px; color: rgba(255,255,255,0.3); }

  /* ─── Intro / How It Works ─── */
  .pk-intro {
    flex: 1; display: flex; align-items: flex-start; justify-content: center;
    padding: 60px 20px 40px; overflow-y: auto; position: relative; z-index: 1;
  }
  .pk-intro-card {
    max-width: 640px; width: 100%;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 24px; padding: 40px 36px; backdrop-filter: blur(12px);
  }
  .pk-intro-welcome { text-align: center; margin-bottom: 36px; padding: 8px 0; }
  .pk-welcome-line {
    width: 80px; height: 1px; margin: 0 auto;
    background: linear-gradient(90deg, transparent, rgba(201,169,78,0.5), transparent);
  }
  .pk-welcome-pre {
    font-size: 13px; text-transform: uppercase; letter-spacing: 6px;
    color: rgba(201,169,78,0.6); margin: 20px 0 8px;
    font-weight: 400; font-style: italic;
  }
  .pk-welcome-title {
    font-size: 38px; font-weight: 900; letter-spacing: -0.5px; margin: 0;
    line-height: 1.15; color: rgba(255,255,255,0.9);
  }
  .pk-welcome-title span {
    background: linear-gradient(135deg, #C9A94E 0%, #f0d78c 50%, #C9A94E 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text; font-size: 46px;
  }
  .pk-welcome-sub {
    font-size: 14px; color: rgba(255,255,255,0.4); margin: 14px 0 6px;
    font-style: italic; line-height: 1.4;
  }
  .pk-welcome-class {
    font-size: 11px; text-transform: uppercase; letter-spacing: 3px;
    color: rgba(201,169,78,0.35); margin: 0 0 20px; font-weight: 600;
  }

  .pk-intro-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px;
  }
  .pk-intro-block {
    background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px; padding: 20px 16px; text-align: center;
  }
  .pk-intro-block-icon { font-size: 28px; margin-bottom: 8px; }
  .pk-intro-block h3 {
    font-size: 15px; font-weight: 700; color: #C9A94E; margin: 0 0 6px;
    text-transform: uppercase; letter-spacing: 1px;
  }
  .pk-intro-block p { font-size: 13px; color: rgba(255,255,255,0.5); line-height: 1.5; margin: 0; }
  .pk-intro-block strong { color: rgba(255,255,255,0.8); }

  .pk-intro-how {
    background: rgba(201,169,78,0.04); border: 1px solid rgba(201,169,78,0.1);
    border-radius: 16px; padding: 20px 24px; margin-bottom: 24px;
  }
  .pk-intro-how h3 {
    font-size: 15px; font-weight: 700; color: #C9A94E; margin: 0 0 12px;
    text-transform: uppercase; letter-spacing: 1px;
  }
  .pk-intro-how ol {
    margin: 0; padding-left: 20px; font-size: 14px; color: rgba(255,255,255,0.55);
    line-height: 1.9; list-style: decimal;
  }
  .pk-intro-how strong { color: rgba(255,255,255,0.85); }

  .pk-intro-hands { margin-bottom: 28px; }
  .pk-intro-hands h3 {
    font-size: 15px; font-weight: 700; color: #C9A94E; margin: 0 0 12px;
    text-transform: uppercase; letter-spacing: 1px; text-align: center;
  }
  .pk-intro-hands-grid { display: flex; flex-direction: column; gap: 4px; }
  .pk-ih-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 14px; border-radius: 8px; background: rgba(255,255,255,0.025);
    font-size: 13px; color: rgba(255,255,255,0.55);
  }
  .pk-ih-top { background: rgba(201,169,78,0.08); color: #C9A94E; }
  .pk-ih-cards { font-family: monospace; font-size: 12px; color: rgba(255,255,255,0.35); letter-spacing: 1px; }
  .pk-ih-top .pk-ih-cards { color: rgba(201,169,78,0.6); }

  .pk-intro-cta {
    width: 100%; padding: 18px; font-size: 18px; border-radius: 16px;
    letter-spacing: 2px;
  }

  /* ─── Mobile ─── */
  @media (max-width: 768px) {
    .pk-chat-open {
      position: fixed; bottom: 0; right: 0; left: 0; top: auto;
      width: 100%; height: 50vh; border-left: none;
      border-top: 1px solid rgba(255,255,255,0.15);
      border-radius: 16px 16px 0 0; z-index: 50;
    }
    .pk-chat-closed { bottom: 16px; right: 12px; z-index: 45; }
    .pk-chat-input { font-size: 16px; }
    .pk-chat-input-row { padding: 8px 12px calc(12px + env(safe-area-inset-bottom)); }
    .pk-top-buttons { right: 8px; }
    .pk-table-wrap { padding: 48px 4px 4px; }
    .pk-felt { border-width: 5px; }
    .pk-avatar { width: 36px; height: 36px; font-size: 12px; }
    .pk-seat-name { font-size: 9px; }
    .pk-seat-chips { font-size: 9px; }
    .pk-community { gap: 3px; }
    .pk-card-slot { width: 42px; height: 60px; }
    .pk-pot-amount { font-size: 12px; }
    .pk-btn { padding: 10px 16px; font-size: 12px; }
    .pk-theme-banner { display: none; }
    .pk-intro-grid { grid-template-columns: 1fr; }
    .pk-intro-card { padding: 28px 20px; }
    .pk-intro-hero h1 { font-size: 26px; }
    .pk-cheat { display: none; }
  }
`;
