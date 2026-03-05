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
  const [memories, setMemories] = useState<Memory[]>([]);
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

  useEffect(() => {
    loadMemories();
    if (!supabase) return;
    const channel = supabase
      .channel('memories-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memories' }, (payload) => {
        setMemories((prev) => [payload.new as Memory, ...prev]);
      })
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [loadMemories]);

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
                      <button
                        key={memory.id}
                        onClick={() => setLightbox(memory)}
                        className="glass-card overflow-hidden text-left group cursor-pointer"
                      >
                        <div className="aspect-square overflow-hidden">
                          <img
                            src={memory.photo_url}
                            alt={memory.caption || 'Memory'}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs">{badge.emoji}</span>
                            <span className="text-xs font-medium text-white/70 truncate">{memory.guest_name}</span>
                          </div>
                          {memory.caption && (
                            <p className="text-xs text-white/40 line-clamp-2">{memory.caption}</p>
                          )}
                        </div>
                      </button>
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
