'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useName } from './Providers';
import { fireConfetti } from '@/lib/confetti';

interface Match {
  id: string;
  guest_name: string;
  specialty: string;
  city: string;
  state: string;
  program: string | null;
  created_at: string;
}

const SPECIALTIES = [
  'Anesthesiology', 'Dermatology', 'Emergency Medicine', 'Family Medicine',
  'General Surgery', 'Internal Medicine', 'Neurology', 'OB/GYN',
  'Ophthalmology', 'Orthopedics', 'Pathology', 'Pediatrics',
  'Physical Medicine & Rehab', 'Psychiatry', 'Radiology', 'Urology',
  'Other',
];

const SPECIALTY_COLORS: Record<string, string> = {
  'Anesthesiology': 'bg-blue-500/20 text-blue-300',
  'Dermatology': 'bg-pink-500/20 text-pink-300',
  'Emergency Medicine': 'bg-red-500/20 text-red-300',
  'Family Medicine': 'bg-green-500/20 text-green-300',
  'General Surgery': 'bg-orange-500/20 text-orange-300',
  'Internal Medicine': 'bg-indigo-500/20 text-indigo-300',
  'Neurology': 'bg-purple-500/20 text-purple-300',
  'OB/GYN': 'bg-rose-500/20 text-rose-300',
  'Ophthalmology': 'bg-cyan-500/20 text-cyan-300',
  'Orthopedics': 'bg-amber-500/20 text-amber-300',
  'Pathology': 'bg-teal-500/20 text-teal-300',
  'Pediatrics': 'bg-yellow-500/20 text-yellow-300',
  'Physical Medicine & Rehab': 'bg-lime-500/20 text-lime-300',
  'Psychiatry': 'bg-violet-500/20 text-violet-300',
  'Radiology': 'bg-sky-500/20 text-sky-300',
  'Urology': 'bg-emerald-500/20 text-emerald-300',
};

const UNLOCK_DATE = new Date('2026-03-20T00:00:00-04:00');

export default function MatchMap() {
  const { name, promptName } = useName();
  const [matches, setMatches] = useState<Match[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [hasPosted, setHasPosted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [form, setForm] = useState({
    specialty: '',
    city: '',
    state: '',
    program: '',
  });

  const isLocked = now < UNLOCK_DATE;

  useEffect(() => {
    if (!isLocked) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [isLocked]);

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from('matches')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setMatches(data);
          if (name) {
            setHasPosted(data.some((m) => m.guest_name.toLowerCase() === name.toLowerCase()));
          }
        }
      });

    const channel = supabase
      .channel('matches')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          setMatches((prev) => [payload.new as Match, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [name]);

  useEffect(() => {
    if (name && matches.length > 0) {
      setHasPosted(matches.some((m) => m.guest_name.toLowerCase() === name.toLowerCase()));
    }
  }, [name, matches]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let currentName = name;
    if (!currentName) {
      currentName = await promptName();
      if (!currentName) return;
    }
    if (!supabase || !form.specialty || !form.city || !form.state) return;

    setPosting(true);
    const { error } = await supabase.from('matches').insert({
      guest_name: currentName,
      specialty: form.specialty,
      city: form.city,
      state: form.state,
      program: form.program || null,
    });
    setPosting(false);

    if (!error) {
      setHasPosted(true);
      setFormOpen(false);
      setForm({ specialty: '', city: '', state: '', program: '' });
      fireConfetti();
    }
  };

  // Group by specialty for fun stats
  const specialtyCounts: Record<string, number> = {};
  matches.forEach((m) => {
    specialtyCounts[m.specialty] = (specialtyCounts[m.specialty] || 0) + 1;
  });
  const topSpecialties = Object.entries(specialtyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <section id="matches" className="py-20 px-4 max-w-5xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-2">
        Where We Matched
      </h2>
      <p className="text-white/40 text-center mb-4 max-w-md mx-auto">
        We&apos;re spreading out. Drop your match so everyone can see where the class is headed.
      </p>

      {isLocked ? (
        <LockedState unlockDate={UNLOCK_DATE} now={now} />
      ) : (
      <>

      {matches.length > 0 && (
        <div className="flex justify-center gap-6 mb-10 text-center">
          <div>
            <p className="text-3xl font-bold text-gold">{matches.length}</p>
            <p className="text-white/30 text-xs uppercase tracking-wider">Matched</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gold">
              {new Set(matches.map((m) => m.state)).size}
            </p>
            <p className="text-white/30 text-xs uppercase tracking-wider">States</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gold">
              {Object.keys(specialtyCounts).length}
            </p>
            <p className="text-white/30 text-xs uppercase tracking-wider">Specialties</p>
          </div>
        </div>
      )}

      {topSpecialties.length > 0 && (
        <div className="glass-card p-4 mb-8 max-w-lg mx-auto">
          <p className="text-white/30 text-xs uppercase tracking-wider mb-3 text-center">Top Specialties</p>
          <div className="space-y-2">
            {topSpecialties.map(([spec, count]) => (
              <div key={spec} className="flex items-center gap-3">
                <span className="text-white/60 text-sm flex-1">{spec}</span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-maroon to-gold rounded-full transition-all duration-500"
                    style={{ width: `${(count / matches.length) * 100}%` }}
                  />
                </div>
                <span className="text-white/40 text-xs w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasPosted && (
        <div className="flex justify-center mb-8">
          <button
            onClick={async () => {
              if (!name) {
                const n = await promptName();
                if (!n) return;
              }
              setFormOpen(!formOpen);
            }}
            className="bg-maroon hover:bg-maroon/80 text-white font-semibold px-6 py-3 rounded-xl transition-all text-sm"
          >
            Share Your Match
          </button>
        </div>
      )}

      {formOpen && !hasPosted && (
        <form onSubmit={handleSubmit} className="glass-card p-5 md:p-6 mb-8 max-w-lg mx-auto">
          <div className="mb-4">
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              Specialty
            </label>
            <select
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/40"
            >
              <option value="">Select...</option>
              {SPECIALTIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Philadelphia"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-gold/40"
              />
            </div>
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="PA"
                maxLength={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-gold/40 uppercase"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              Program (optional)
            </label>
            <input
              type="text"
              value={form.program}
              onChange={(e) => setForm({ ...form, program: e.target.value })}
              placeholder="Hospital / program name"
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
              disabled={posting || !form.specialty || !form.city || !form.state}
              className="flex-1 bg-maroon hover:bg-maroon/80 text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50"
            >
              {posting ? 'Saving...' : 'I Matched!'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {matches.map((m) => (
          <div
            key={m.id}
            className="glass-card p-4 hover:scale-[1.02] transition-transform"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-white/90">{m.guest_name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${SPECIALTY_COLORS[m.specialty] || 'bg-white/10 text-white/50'}`}>
                {m.specialty}
              </span>
            </div>
            <p className="text-white/50 text-sm mt-1.5">
              {m.city}, {m.state}
            </p>
            {m.program && (
              <p className="text-white/30 text-xs mt-1">{m.program}</p>
            )}
          </div>
        ))}
      </div>

      {matches.length === 0 && (
        <div className="text-center py-12 glass-card">
          <p className="text-white/30">
            {supabase ? 'No matches shared yet. Be the first!' : 'Connect Supabase to enable this feature.'}
          </p>
        </div>
      )}

      </>
      )}
    </section>
  );
}

function LockedState({ unlockDate, now }: { unlockDate: Date; now: Date }) {
  const diff = unlockDate.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return (
    <div className="glass-card p-10 md:p-14 text-center max-w-lg mx-auto">
      <div className="text-6xl mb-5">{'\u{1F512}'}</div>
      <h3 className="text-2xl font-bold mb-2">Locked Until Match Day</h3>
      <p className="text-white/40 text-sm mb-8">
        This section unlocks on March 20, 2026 when matches are revealed.
      </p>
      <div className="flex items-center justify-center gap-3">
        <div className="flex flex-col items-center">
          <span className="text-2xl md:text-3xl font-mono font-bold tabular-nums text-gold">{String(days).padStart(2, '0')}</span>
          <span className="text-white/30 text-xs mt-1 uppercase tracking-wider">Days</span>
        </div>
        <span className="text-white/20 text-xl -mt-5">:</span>
        <div className="flex flex-col items-center">
          <span className="text-2xl md:text-3xl font-mono font-bold tabular-nums text-gold">{String(hours).padStart(2, '0')}</span>
          <span className="text-white/30 text-xs mt-1 uppercase tracking-wider">Hrs</span>
        </div>
        <span className="text-white/20 text-xl -mt-5">:</span>
        <div className="flex flex-col items-center">
          <span className="text-2xl md:text-3xl font-mono font-bold tabular-nums text-gold">{String(minutes).padStart(2, '0')}</span>
          <span className="text-white/30 text-xs mt-1 uppercase tracking-wider">Min</span>
        </div>
        <span className="text-white/20 text-xl -mt-5">:</span>
        <div className="flex flex-col items-center">
          <span className="text-2xl md:text-3xl font-mono font-bold tabular-nums text-gold">{String(seconds).padStart(2, '0')}</span>
          <span className="text-white/30 text-xs mt-1 uppercase tracking-wider">Sec</span>
        </div>
      </div>
    </div>
  );
}
