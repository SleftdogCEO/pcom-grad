'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

interface NameContextType {
  name: string | null;
  setName: (name: string) => void;
  promptName: () => Promise<string | null>;
}

const NameContext = createContext<NameContextType>({
  name: null,
  setName: () => {},
  promptName: async () => null,
});

export const useName = () => useContext(NameContext);

export function Providers({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [resolvePrompt, setResolvePrompt] = useState<
    ((name: string | null) => void) | null
  >(null);

  useEffect(() => {
    const stored = localStorage.getItem('guestName');
    if (stored) {
      setNameState(stored);
    } else {
      setShowModal(true);
    }
  }, []);

  const setName = useCallback((n: string) => {
    const trimmed = n.trim();
    if (!trimmed) return;
    localStorage.setItem('guestName', trimmed);
    setNameState(trimmed);
    setShowModal(false);
  }, []);

  const promptName = useCallback((): Promise<string | null> => {
    if (name) return Promise.resolve(name);
    return new Promise((resolve) => {
      setResolvePrompt(() => resolve);
      setShowModal(true);
    });
  }, [name]);

  const handleSubmit = (value: string) => {
    setName(value);
    if (resolvePrompt) {
      resolvePrompt(value);
      setResolvePrompt(null);
    }
  };

  const handleClose = () => {
    setShowModal(false);
    if (resolvePrompt) {
      resolvePrompt(null);
      setResolvePrompt(null);
    }
  };

  return (
    <NameContext.Provider value={{ name, setName, promptName }}>
      {children}
      {showModal && (
        <NameModal
          onSubmit={handleSubmit}
          onClose={name ? handleClose : undefined}
        />
      )}
    </NameContext.Provider>
  );
}

function NameModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (name: string) => void;
  onClose?: () => void;
}) {
  const [value, setValue] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="glass-card p-8 max-w-sm w-full text-center relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/30 hover:text-white/60 text-xl"
          >
            &times;
          </button>
        )}
        <div className="text-5xl mb-4">&#127891;</div>
        <h2 className="text-2xl font-bold mb-2">Welcome, future DO!</h2>
        <p className="text-white/50 mb-6 text-sm">
          Enter your name to RSVP, post shoutouts, and coordinate rides.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onSubmit(value.trim());
          }}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your name"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-lg placeholder:text-white/30 focus:outline-none focus:border-gold/50 transition-colors"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="w-full mt-4 bg-maroon hover:bg-maroon/80 disabled:opacity-30 text-white font-semibold py-3 rounded-xl transition-all"
          >
            Let&apos;s go
          </button>
        </form>
      </div>
    </div>
  );
}
