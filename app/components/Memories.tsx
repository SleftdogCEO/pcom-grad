'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useName } from './Providers';

interface Memory {
  id: string;
  guest_name: string;
  guest_role: string;
  caption: string | null;
  photo_url: string;
  created_at: string;
}

interface MemoryReactionCounts {
  [memoryId: string]: {
    fire: number;
    heart: number;
    laugh: number;
    hundred: number;
    myReactions: string[];
  };
}

type EmojiKey = 'fire' | 'heart' | 'laugh' | 'hundred';

const REACTION_EMOJIS: { id: EmojiKey; emoji: string }[] = [
  { id: 'fire', emoji: '\u{1F525}' },
  { id: 'heart', emoji: '\u{2764}\u{FE0F}' },
  { id: 'laugh', emoji: '\u{1F602}' },
  { id: 'hundred', emoji: '\u{1F4AF}' },
];

const ROLE_BADGES: Record<string, { label: string; emoji: string; color: string }> = {
  student: { label: 'Student', emoji: '🩺', color: 'text-maroon' },
  family: { label: 'Family', emoji: '❤️', color: 'text-red-400' },
  friend: { label: 'Friend', emoji: '🤝', color: 'text-gold' },
};

function groupByDay(memories: Memory[]): Record<string, Memory[]> {
  const groups: Record<string, Memory[]> = {};
  for (const m of memories) {
    const day = new Date(m.created_at).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    if (!groups[day]) groups[day] = [];
    groups[day].push(m);
  }
  return groups;
}

function daysUntil(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function Memories() {
  const { name, role, promptName } = useName();
  const nameRef = useRef(name);
  nameRef.current = name;
  const [memories, setMemories] = useState<Memory[]>([]);
  const [reactions, setReactions] = useState<MemoryReactionCounts>({});
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Memory | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MATCH_DAY = new Date('2026-03-20T12:00:00-04:00');
  const GRADUATION = new Date('2026-04-28T10:00:00-04:00');
  const matchDays = daysUntil(MATCH_DAY);
  const gradDays = daysUntil(GRADUATION);

  const loadMemories = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('memories')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setMemories(data);
  }, []);

  const loadReactions = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('memory_reactions').select('*');
    if (!data) return;
    const counts: MemoryReactionCounts = {};
    const currentName = nameRef.current;
    for (const r of data) {
      if (!counts[r.memory_id]) {
        counts[r.memory_id] = { fire: 0, heart: 0, laugh: 0, hundred: 0, myReactions: [] };
      }
      counts[r.memory_id][r.emoji as EmojiKey]++;
      if (currentName && r.guest_name.toLowerCase() === currentName.toLowerCase()) {
        counts[r.memory_id].myReactions.push(r.emoji);
      }
    }
    setReactions(counts);
  }, []);

  useEffect(() => {
    loadReactions();
  }, [name, loadReactions]);

  useEffect(() => {
    loadMemories();
    loadReactions();
    if (!supabase) return;
    const channel = supabase
      .channel('memories-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memories' }, (payload) => {
        setMemories((prev) => [payload.new as Memory, ...prev]);
      })
      .subscribe();
    const reactChannel = supabase
      .channel('memory-reactions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_reactions' }, () => {
        loadReactions();
      })
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
      supabase!.removeChannel(reactChannel);
    };
  }, [loadMemories, loadReactions]);

  const toggleReaction = async (memoryId: string, emoji: string) => {
    let currentName = name;
    if (!currentName) {
      currentName = await promptName();
      if (!currentName) return;
    }
    if (!supabase) return;

    const existing = reactions[memoryId] || { fire: 0, heart: 0, laugh: 0, hundred: 0, myReactions: [] };
    const isRemoving = existing.myReactions.includes(emoji);

    // Optimistic update
    setReactions((prev) => {
      const current = prev[memoryId] || { fire: 0, heart: 0, laugh: 0, hundred: 0, myReactions: [] };
      return {
        ...prev,
        [memoryId]: {
          ...current,
          [emoji]: current[emoji as EmojiKey] + (isRemoving ? -1 : 1),
          myReactions: isRemoving
            ? current.myReactions.filter((e) => e !== emoji)
            : [...current.myReactions, emoji],
        },
      };
    });

    if (isRemoving) {
      await supabase
        .from('memory_reactions')
        .delete()
        .eq('memory_id', memoryId)
        .eq('emoji', emoji)
        .ilike('guest_name', currentName);
    } else {
      await supabase.from('memory_reactions').insert({
        memory_id: memoryId,
        guest_name: currentName,
        emoji,
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!supabase || !selectedFile) return;
    let currentName = name;
    if (!currentName) {
      currentName = await promptName();
      if (!currentName) return;
    }

    setUploading(true);
    try {
      const ext = selectedFile.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, selectedFile, { contentType: selectedFile.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      await supabase.from('memories').insert({
        guest_name: currentName,
        guest_role: role || 'student',
        caption: caption.trim() || null,
        photo_url: urlData.publicUrl,
      });

      setCaption('');
      setSelectedFile(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const grouped = groupByDay(memories);
  const days = Object.keys(grouped);

  return (
    <section id="memories" className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-black mb-2">
            <span className="text-shimmer">Our Journey</span>
          </h2>
          <p className="text-white/40 text-sm max-w-md mx-auto">
            Share photos and memories as we count down to the big days.
          </p>
          <div className="flex justify-center gap-6 mt-4">
            {matchDays > 0 && (
              <div className="glass-card px-4 py-2 text-sm">
                <span className="text-gold font-bold">{matchDays}</span>
                <span className="text-white/40 ml-1">days to Match</span>
              </div>
            )}
            {gradDays > 0 && (
              <div className="glass-card px-4 py-2 text-sm">
                <span className="text-gold font-bold">{gradDays}</span>
                <span className="text-white/40 ml-1">days to Graduation</span>
              </div>
            )}
          </div>
        </div>

        {/* Upload form */}
        <div className="glass-card p-6 mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📸</span>
            <h3 className="font-semibold text-sm">Share a Memory</h3>
          </div>

          {preview ? (
            <div className="relative mb-4">
              <img
                src={preview}
                alt="Preview"
                className="w-full max-h-64 object-cover rounded-xl"
              />
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="absolute top-2 right-2 bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/80"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-white/10 rounded-xl py-10 flex flex-col items-center gap-2 hover:border-white/20 transition-colors mb-4"
            >
              <span className="text-3xl">📷</span>
              <span className="text-white/40 text-sm">Tap to add a photo</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption (optional)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-gold/50 transition-colors"
          />

          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="w-full mt-3 bg-maroon hover:bg-maroon/80 disabled:opacity-30 text-white font-semibold py-3 rounded-xl transition-all text-sm"
          >
            {uploading ? 'Uploading...' : 'Post Memory'}
          </button>
        </div>

        {/* Timeline */}
        {days.length === 0 ? (
          <div className="text-center py-12 text-white/20">
            <p className="text-4xl mb-3">📸</p>
            <p className="text-sm">No memories yet. Be the first to share!</p>
          </div>
        ) : (
          <div className="space-y-8">
            {days.map((day) => (
              <div key={day}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="text-xs font-semibold text-gold/70 uppercase tracking-wider">{day}</span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {grouped[day].map((memory) => {
                    const badge = ROLE_BADGES[memory.guest_role] || ROLE_BADGES.student;
                    return (
                      <div
                        key={memory.id}
                        className="glass-card overflow-hidden text-left group"
                      >
                        <button
                          onClick={() => setLightbox(memory)}
                          className="w-full cursor-pointer"
                        >
                          <div className="aspect-square overflow-hidden">
                            <img
                              src={memory.photo_url}
                              alt={memory.caption || 'Memory'}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-3 pb-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs">{badge.emoji}</span>
                              <span className="text-xs font-medium text-white/70 truncate">{memory.guest_name}</span>
                            </div>
                            {memory.caption && (
                              <p className="text-xs text-white/40 line-clamp-2">{memory.caption}</p>
                            )}
                          </div>
                        </button>
                        <div className="flex gap-1 px-3 pb-3">
                          {REACTION_EMOJIS.map((r) => {
                            const count = reactions[memory.id]?.[r.id] || 0;
                            const isMine = reactions[memory.id]?.myReactions?.includes(r.id);
                            return (
                              <button
                                key={r.id}
                                onClick={() => toggleReaction(memory.id, r.id)}
                                className={`text-xs px-1.5 py-0.5 rounded-full transition-all hover:scale-110 active:scale-95 ${
                                  isMine
                                    ? 'bg-gold/20 border border-gold/30'
                                    : 'bg-white/5 border border-transparent hover:bg-white/10'
                                }`}
                              >
                                {r.emoji}{count > 0 && <span className="ml-0.5 text-white/40">{count}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Lightbox */}
        {lightbox && (
          <div
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            <div
              className="max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightbox.photo_url}
                alt={lightbox.caption || 'Memory'}
                className="w-full rounded-2xl mb-4"
              />
              <div className="flex items-center gap-2 mb-2">
                <span>{ROLE_BADGES[lightbox.guest_role]?.emoji || '🩺'}</span>
                <span className="font-semibold text-sm">{lightbox.guest_name}</span>
                <span className="text-white/20 text-xs ml-auto">
                  {new Date(lightbox.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {lightbox.caption && (
                <p className="text-white/60 text-sm">{lightbox.caption}</p>
              )}
              <div className="flex gap-2 mt-4">
                {REACTION_EMOJIS.map((r) => {
                  const count = reactions[lightbox.id]?.[r.id] || 0;
                  const isMine = reactions[lightbox.id]?.myReactions?.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleReaction(lightbox.id, r.id)}
                      className={`text-sm px-3 py-1.5 rounded-full transition-all hover:scale-110 active:scale-95 ${
                        isMine
                          ? 'bg-gold/20 border border-gold/30'
                          : 'bg-white/10 border border-transparent hover:bg-white/15'
                      }`}
                    >
                      {r.emoji}{count > 0 && <span className="ml-1 text-white/50">{count}</span>}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setLightbox(null)}
                className="mt-4 w-full text-center text-white/30 hover:text-white/60 text-sm py-2"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
