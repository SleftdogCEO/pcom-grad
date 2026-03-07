'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fireConfetti } from '@/lib/confetti';
import { useName } from './Providers';

interface Rsvp {
  guest_name: string;
}

interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  description: string;
  emoji: string;
  gradient: string;
  address?: string;
  link?: string;
}

const EVENTS: Event[] = [
  {
    id: 'fridaynight',
    title: 'Friday Night Blackjack',
    date: 'Tonight',
    time: 'Right Now',
    venue: 'pcom-grad.vercel.app/blackjack',
    description:
      'Grab a drink, open the table, and see who can stack the most PCOM Bucks. No real money, just bragging rights. Hit or stand, Doctor?',
    emoji: '\u{1F0CF}',
    gradient: 'from-green-600/20 to-transparent',
    link: '/blackjack',
  },
  {
    id: 'march20',
    title: 'Match Day Celebration',
    date: 'March 20, 2026',
    time: '7:00 PM',
    venue: 'University City, Philadelphia',
    description:
      'We matched. Time to celebrate. Location in University City - details coming soon.',
    emoji: '\u{1F37E}',
    gradient: 'from-maroon/20 to-transparent',
  },
  {
    id: 'march21',
    title: 'Dinner at Bistro La Baia',
    date: 'March 21, 2026',
    time: '8:00 PM',
    venue: 'Bistro La Baia (BYOB Italian)',
    address: '1700 Lombard St, Philadelphia, PA 19146',
    description:
      'Post-match dinner at one of Philly\'s best Italian BYOBs. Homemade pasta, fresh bread, and vibes. BYOB so bring the good stuff. Also — Bistro La Baia is a Sleft Payments merchant, so pay with a card and help Uncle Grant eat too.',
    emoji: '\u{1F35D}',
    gradient: 'from-amber-500/15 to-transparent',
  },
  {
    id: 'april28',
    title: 'Graduation - Urban Saloon',
    date: 'April 28, 2026',
    time: '7:30 PM',
    venue: 'Urban Saloon, Philadelphia',
    address: '2120 Fairmount Ave, Philadelphia, PA 19130',
    description:
      'We did it. Doctors officially. One last night together at Urban Saloon before we all scatter.',
    emoji: '\u{1F393}',
    gradient: 'from-gold/10 to-transparent',
  },
];

export default function EventCards() {
  return (
    <section id="events" className="py-20 px-4 max-w-5xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
        The Events
      </h2>
      <p className="text-white/40 text-center mb-12 max-w-md mx-auto">
        Three events you don&apos;t want to miss. RSVP so we know who&apos;s pulling up.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {EVENTS.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}

function EventCard({
  event,
}: {
  event: Event;
}) {
  const { name, promptName } = useName();
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [hasRsvpd, setHasRsvpd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const loadRsvps = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('rsvps')
      .select('guest_name')
      .eq('event', event.id)
      .order('created_at', { ascending: true });
    if (data) {
      setRsvps(data);
      if (name) {
        setHasRsvpd(
          data.some(
            (r) => r.guest_name.toLowerCase() === name.toLowerCase()
          )
        );
      }
    }
  }, [event.id, name]);

  useEffect(() => {
    loadRsvps();

    if (!supabase) return;
    const channel = supabase
      .channel(`rsvps-${event.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rsvps',
          filter: `event=eq.${event.id}`,
        },
        (payload) => {
          const newRsvp = payload.new as Rsvp;
          setRsvps((prev) => {
            if (prev.some((r) => r.guest_name === newRsvp.guest_name))
              return prev;
            return [...prev, newRsvp];
          });
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [event.id, loadRsvps]);

  useEffect(() => {
    if (name) {
      setHasRsvpd(
        rsvps.some(
          (r) => r.guest_name.toLowerCase() === name.toLowerCase()
        )
      );
    }
  }, [name, rsvps]);

  const handleRsvp = async () => {
    let currentName = name;
    if (!currentName) {
      currentName = await promptName();
      if (!currentName) return;
    }
    if (!supabase || hasRsvpd) return;

    setLoading(true);
    const { error } = await supabase
      .from('rsvps')
      .insert({ guest_name: currentName, event: event.id });
    setLoading(false);

    if (!error) {
      setHasRsvpd(true);
      fireConfetti();
    }
  };

  const displayRsvps = showAll ? rsvps : rsvps.slice(0, 8);

  return (
    <div
      className={`glass-card p-6 md:p-8 bg-gradient-to-b ${event.gradient} flex flex-col`}
    >
      <div className="text-4xl mb-3">{event.emoji}</div>
      <p className="text-gold font-mono text-sm tracking-wide">{event.date}</p>
      <h3 className="text-2xl font-bold mt-1">{event.title}</h3>
      <p className="text-white/50 mt-2 text-sm">
        {event.time} &bull; {event.venue}
      </p>
      {event.address && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(event.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold/60 hover:text-gold text-xs mt-1 transition-colors"
        >
          {event.address} &rarr;
        </a>
      )}
      <p className="text-white/40 mt-4 text-sm leading-relaxed flex-1">
        {event.description}
      </p>

      {event.link ? (
        <a
          href={event.link}
          className="mt-6 w-full py-3 rounded-xl font-semibold text-sm transition-all bg-green-600 hover:bg-green-500 text-white active:scale-[0.98] text-center block"
        >
          PLAY NOW
        </a>
      ) : (
        <button
          onClick={handleRsvp}
          disabled={hasRsvpd || loading}
          className={`mt-6 w-full py-3 rounded-xl font-semibold text-sm transition-all ${
            hasRsvpd
              ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default'
              : 'bg-maroon hover:bg-maroon/80 text-white active:scale-[0.98]'
          } disabled:opacity-60`}
        >
          {hasRsvpd ? "YOU'RE IN \u2713" : loading ? 'Saving...' : "I'M IN \u{1F389}"}
        </button>
      )}

      <div className="mt-5">
        <p className="text-white/30 text-xs font-medium uppercase tracking-wider">
          {rsvps.length} {rsvps.length === 1 ? 'person' : 'people'} going
        </p>
        {rsvps.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {displayRsvps.map((r) => (
              <span
                key={r.guest_name}
                className={`text-xs px-2.5 py-1 rounded-full ${
                  name && r.guest_name.toLowerCase() === name.toLowerCase()
                    ? 'bg-gold/20 text-gold'
                    : 'bg-white/5 text-white/50'
                }`}
              >
                {r.guest_name}
              </span>
            ))}
            {rsvps.length > 8 && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="text-xs text-white/30 hover:text-white/50 px-2 py-1"
              >
                +{rsvps.length - 8} more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
