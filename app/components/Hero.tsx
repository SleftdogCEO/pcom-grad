'use client';

import { useEffect, useState } from 'react';

const GRAD_DATE = new Date('2026-03-20T10:00:00-04:00');

function getTimeLeft() {
  const now = new Date();
  const diff = GRAD_DATE.getTime() - now.getTime();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, passed: true };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    passed: false,
  };
}

export default function Hero() {
  const [time, setTime] = useState(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="hero-gradient min-h-screen flex flex-col items-center justify-center text-center px-4 pt-16">
      <div className="stagger">
        <div className="text-7xl mb-6">&#127891;</div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
          PCOM <span className="text-shimmer">Class of 2026</span>
        </h1>
        <p className="text-white/50 text-lg md:text-xl mt-4 max-w-md mx-auto">
          We made it. Time to celebrate.
        </p>

        {!time.passed ? (
          <div className="mt-12">
            <p className="text-white/30 text-sm uppercase tracking-widest mb-4">
              Countdown to Graduation
            </p>
            <div className="flex items-center justify-center gap-3 md:gap-5">
              <CountdownUnit value={time.days} label="Days" />
              <span className="text-white/20 text-2xl font-light -mt-6">:</span>
              <CountdownUnit value={time.hours} label="Hrs" />
              <span className="text-white/20 text-2xl font-light -mt-6">:</span>
              <CountdownUnit value={time.minutes} label="Min" />
              <span className="text-white/20 text-2xl font-light -mt-6">:</span>
              <CountdownUnit value={time.seconds} label="Sec" />
            </div>
          </div>
        ) : (
          <p className="mt-12 text-3xl font-bold text-gold">
            Congratulations, Doctors!
          </p>
        )}

        <div className="mt-16">
          <a
            href="#events"
            className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            See the plans
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-bounce">
              <path d="M8 3v10M4 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="glass-card px-4 py-3 md:px-6 md:py-4 min-w-[60px] md:min-w-[80px]">
        <span className="text-3xl md:text-5xl font-mono font-bold tabular-nums">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-white/30 text-xs mt-2 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
