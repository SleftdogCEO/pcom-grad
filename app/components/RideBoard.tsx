'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useName } from './Providers';

interface Ride {
  id: string;
  guest_name: string;
  ride_type: 'offer' | 'request';
  event: string;
  seats: number;
  area: string;
  message: string;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  march20: 'March 20',
  april28: 'April 28',
};

export default function RideBoard() {
  const { name, promptName } = useName();
  const [rides, setRides] = useState<Ride[]>([]);
  const [tab, setTab] = useState<'offer' | 'request'>('offer');
  const [formOpen, setFormOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [form, setForm] = useState({
    event: 'march20',
    seats: 3,
    area: '',
    message: '',
  });

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from('rides')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setRides(data as Ride[]);
      });

    const channel = supabase
      .channel('rides')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rides' },
        (payload) => {
          setRides((prev) => [payload.new as Ride, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let currentName = name;
    if (!currentName) {
      currentName = await promptName();
      if (!currentName) return;
    }
    if (!supabase) return;

    setPosting(true);
    await supabase.from('rides').insert({
      guest_name: currentName,
      ride_type: tab,
      event: form.event,
      seats: form.seats,
      area: form.area || null,
      message: form.message || null,
    });
    setForm({ event: 'march20', seats: 3, area: '', message: '' });
    setFormOpen(false);
    setPosting(false);
  };

  const filtered = rides.filter((r) => r.ride_type === tab);

  return (
    <section id="rides" className="py-20 px-4 max-w-5xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
        Rides
      </h2>
      <p className="text-white/40 text-center mb-10 max-w-md mx-auto">
        Need a ride? Have extra seats? Coordinate here.
      </p>

      <div className="flex items-center justify-center gap-3 mb-8">
        <button
          onClick={() => setTab('offer')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'offer'
              ? 'bg-gold/20 text-gold border border-gold/30'
              : 'bg-white/5 text-white/40 border border-transparent'
          }`}
        >
          Offering ({rides.filter((r) => r.ride_type === 'offer').length})
        </button>
        <button
          onClick={() => setTab('request')}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'request'
              ? 'bg-gold/20 text-gold border border-gold/30'
              : 'bg-white/5 text-white/40 border border-transparent'
          }`}
        >
          Requesting ({rides.filter((r) => r.ride_type === 'request').length})
        </button>
      </div>

      <div className="flex justify-center mb-6">
        <button
          onClick={async () => {
            if (!name) {
              const n = await promptName();
              if (!n) return;
            }
            setFormOpen(!formOpen);
          }}
          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white px-5 py-2.5 rounded-xl text-sm transition-all"
        >
          + {tab === 'offer' ? 'Offer a Ride' : 'Request a Ride'}
        </button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="glass-card p-5 md:p-6 mb-8 max-w-lg mx-auto"
        >
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                Event
              </label>
              <select
                value={form.event}
                onChange={(e) => setForm({ ...form, event: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/40"
              >
                <option value="march20">March 20 - Afterparty</option>
                <option value="april28">April 28 - Urban Saloon</option>
              </select>
            </div>
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                {tab === 'offer' ? 'Open seats' : 'People'}
              </label>
              <select
                value={form.seats}
                onChange={(e) =>
                  setForm({ ...form, seats: parseInt(e.target.value) })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/40"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              Coming from / area
            </label>
            <input
              type="text"
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="e.g. Center City, Main Line, South Philly"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-gold/40"
            />
          </div>
          <div className="mb-4">
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              Note (optional)
            </label>
            <input
              type="text"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Any details..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-gold/40"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="flex-1 bg-white/5 text-white/50 py-2.5 rounded-xl text-sm hover:bg-white/10 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={posting}
              className="flex-1 bg-maroon hover:bg-maroon/80 text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50"
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 glass-card">
          <p className="text-white/30 text-sm">
            {supabase
              ? `No ${tab === 'offer' ? 'rides offered' : 'ride requests'} yet. Be the first!`
              : 'Connect Supabase to enable ride coordination.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((r) => (
          <div key={r.id} className="glass-card p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-white/90">{r.guest_name}</p>
                <p className="text-white/30 text-xs mt-0.5">
                  {EVENT_LABELS[r.event]}
                </p>
              </div>
              <span className="text-xs bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-white/50">
                {r.ride_type === 'offer'
                  ? `${r.seats} seat${r.seats !== 1 ? 's' : ''}`
                  : `${r.seats} person${r.seats !== 1 ? 's' : ''}`}
              </span>
            </div>
            {r.area && (
              <p className="text-white/50 text-sm mt-3">
                &#128205; {r.area}
              </p>
            )}
            {r.message && (
              <p className="text-white/40 text-sm mt-1">{r.message}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
