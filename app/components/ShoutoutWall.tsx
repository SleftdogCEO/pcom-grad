'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useName } from './Providers';

interface Shoutout {
  id: string;
  guest_name: string;
  message: string;
  category: string;
  created_at: string;
}

const CATEGORIES = [
  { id: 'hype', emoji: '\u{1F389}', label: 'Hype' },
  { id: 'superlative', emoji: '\u{1F3C6}', label: 'Superlative' },
  { id: 'shoutout', emoji: '\u{1F4AC}', label: 'Shoutout' },
  { id: 'memory', emoji: '\u{1F4F8}', label: 'Memory' },
];

const CATEGORY_STYLES: Record<string, string> = {
  hype: 'border-l-gold/40',
  superlative: 'border-l-amber-400/40',
  shoutout: 'border-l-blue-400/40',
  memory: 'border-l-pink-400/40',
};

export default function ShoutoutWall() {
  const { name, promptName } = useName();
  const [shoutouts, setShoutouts] = useState<Shoutout[]>([]);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('hype');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from('shoutouts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setShoutouts(data);
      });

    const channel = supabase
      .channel('shoutouts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shoutouts' },
        (payload) => {
          setShoutouts((prev) => [payload.new as Shoutout, ...prev]);
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
    if (!supabase || !message.trim()) return;

    setPosting(true);
    await supabase.from('shoutouts').insert({
      guest_name: currentName,
      message: message.trim(),
      category,
    });
    setMessage('');
    setPosting(false);
  };

  return (
    <section id="wall" className="py-20 px-4 max-w-5xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
        The Wall
      </h2>
      <p className="text-white/40 text-center mb-10 max-w-md mx-auto">
        Drop a shoutout, a superlative, a memory, or just hype up the class.
      </p>

      <form onSubmit={handleSubmit} className="glass-card p-4 md:p-6 mb-8">
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                category === c.id
                  ? 'bg-gold/20 text-gold border border-gold/30'
                  : 'bg-white/5 text-white/40 border border-transparent hover:text-white/60'
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              category === 'superlative'
                ? 'Most likely to...'
                : category === 'shoutout'
                  ? 'Shoutout to ____ for...'
                  : category === 'memory'
                    ? 'Remember when...'
                    : 'LET\'S GOOOOO'
            }
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-gold/40 transition-colors"
          />
          <button
            type="submit"
            disabled={!message.trim() || posting}
            className="bg-maroon hover:bg-maroon/80 disabled:opacity-30 text-white font-semibold px-6 py-3 rounded-xl transition-all shrink-0"
          >
            Post
          </button>
        </div>
      </form>

      {shoutouts.length === 0 && !supabase && (
        <div className="text-center py-12 glass-card">
          <p className="text-white/30">
            Connect Supabase to see the wall come alive.
          </p>
        </div>
      )}

      {shoutouts.length === 0 && supabase && (
        <div className="text-center py-12 glass-card">
          <p className="text-white/30">
            Be the first to post on the wall!
          </p>
        </div>
      )}

      <div className="columns-1 md:columns-2 lg:columns-3 gap-4">
        {shoutouts.map((s, i) => (
          <div
            key={s.id}
            className={`glass-card p-5 mb-4 break-inside-avoid border-l-2 ${
              CATEGORY_STYLES[s.category] || 'border-l-white/10'
            }`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-lg">
                {CATEGORIES.find((c) => c.id === s.category)?.emoji}
              </span>
              <span className="text-white/20 text-xs shrink-0">
                {formatTime(s.created_at)}
              </span>
            </div>
            <p className="text-white/85 leading-relaxed">{s.message}</p>
            <p className="text-white/30 text-sm mt-3">&mdash; {s.guest_name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
