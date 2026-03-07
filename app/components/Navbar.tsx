'use client';

import { useName } from './Providers';

const ROLE_EMOJI: Record<string, string> = {
  student: '🩺',
  family: '❤️',
  friend: '🤝',
};

export default function Navbar() {
  const { name, role, promptName } = useName();

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 nav-blur">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        <span className="font-bold text-sm tracking-wide text-white/70">
          PCOM &apos;26
        </span>
        <div className="flex items-center gap-6 text-sm">
          <a href="#memories" className="text-white/50 hover:text-white transition-colors">
            Memories
          </a>
          <a href="#events" className="text-white/50 hover:text-white transition-colors hidden sm:block">
            Events
          </a>
          <a href="#matches" className="text-white/50 hover:text-white transition-colors hidden sm:block">
            Matches
          </a>
          <a href="#wall" className="text-white/50 hover:text-white transition-colors">
            Wall
          </a>
          <a href="#rides" className="text-white/50 hover:text-white transition-colors hidden sm:block">
            Rides
          </a>
          <a href="#info" className="text-white/50 hover:text-white transition-colors hidden sm:block">
            Info
          </a>
          <a href="/poker" className="text-gold/80 hover:text-gold transition-colors font-semibold">
            Poker
          </a>
          <a href="/blackjack" className="text-gold/80 hover:text-gold transition-colors font-semibold hidden sm:block">
            Blackjack
          </a>
          {name ? (
            <button
              onClick={() => promptName()}
              className="text-gold/70 hover:text-gold transition-colors flex items-center gap-1"
            >
              <span className="text-xs">{role ? ROLE_EMOJI[role] : ''}</span>
              {name}
            </button>
          ) : (
            <button
              onClick={() => promptName()}
              className="text-gold hover:text-gold/80 font-medium transition-colors"
            >
              Enter name
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
