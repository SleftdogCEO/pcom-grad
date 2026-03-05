'use client';

import { useName } from './Providers';

export default function Navbar() {
  const { name, promptName } = useName();

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 nav-blur">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        <span className="font-bold text-sm tracking-wide text-white/70">
          PCOM &apos;26
        </span>
        <div className="flex items-center gap-6 text-sm">
          <a href="#events" className="text-white/50 hover:text-white transition-colors">
            Events
          </a>
          <a href="#wall" className="text-white/50 hover:text-white transition-colors">
            Wall
          </a>
          <a href="#rides" className="text-white/50 hover:text-white transition-colors">
            Rides
          </a>
          {name ? (
            <button
              onClick={() => promptName()}
              className="text-gold/70 hover:text-gold transition-colors"
            >
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
