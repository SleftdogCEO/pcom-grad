'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

type Role = 'student' | 'family' | 'friend';

interface NameContextType {
  name: string | null;
  role: Role | null;
  setName: (name: string) => void;
  setRole: (role: Role) => void;
  promptName: () => Promise<string | null>;
}

const NameContext = createContext<NameContextType>({
  name: null,
  role: null,
  setName: () => {},
  setRole: () => {},
  promptName: async () => null,
});

export const useName = () => useContext(NameContext);

const ROLE_OPTIONS: { value: Role; label: string; emoji: string }[] = [
  { value: 'student', label: 'Student', emoji: '🩺' },
  { value: 'family', label: 'Family', emoji: '❤️' },
  { value: 'friend', label: 'Friend', emoji: '🤝' },
];

const SITE_PASSWORD = 'DO2026PCOM!';

export function Providers({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [name, setNameState] = useState<string | null>(null);
  const [role, setRoleState] = useState<Role | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [resolvePrompt, setResolvePrompt] = useState<
    ((name: string | null) => void) | null
  >(null);

  useEffect(() => {
    if (localStorage.getItem('siteAuthed') === 'DO2026PCOM!') {
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    const storedName = localStorage.getItem('guestName');
    const storedRole = localStorage.getItem('guestRole') as Role | null;
    if (storedName) {
      setNameState(storedName);
      setRoleState(storedRole || 'student');
    } else {
      setShowModal(true);
    }
  }, [authed]);

  if (!authed) {
    return <PasswordGate onSuccess={() => { localStorage.setItem('siteAuthed', 'DO2026PCOM!'); setAuthed(true); }} />;
  }

  const setName = useCallback((n: string) => {
    const trimmed = n.trim();
    if (!trimmed) return;
    localStorage.setItem('guestName', trimmed);
    setNameState(trimmed);
  }, []);

  const setRole = useCallback((r: Role) => {
    localStorage.setItem('guestRole', r);
    setRoleState(r);
  }, []);

  const promptName = useCallback((): Promise<string | null> => {
    if (name) return Promise.resolve(name);
    return new Promise((resolve) => {
      setResolvePrompt(() => resolve);
      setShowModal(true);
    });
  }, [name]);

  const handleSubmit = (value: string, selectedRole: Role) => {
    setName(value);
    setRole(selectedRole);
    setShowModal(false);
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
    <NameContext.Provider value={{ name, role, setName, setRole, promptName }}>
      {children}
      {showModal && (
        <NameModal
          onSubmit={handleSubmit}
          onClose={name ? handleClose : undefined}
          currentRole={role}
        />
      )}
    </NameContext.Provider>
  );
}

function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.trim().toUpperCase() === SITE_PASSWORD) {
      onSuccess();
    } else {
      setError(true);
      setPw('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f] px-4">
      <div className="glass-card p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">&#128274;</div>
        <h2 className="text-2xl font-bold mb-2">Private Site</h2>
        <p className="text-white/50 mb-6 text-sm">
          Enter the password to access the PCOM Class of 2026 page.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(false); }}
            placeholder="Password"
            autoFocus
            className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white text-center text-lg placeholder:text-white/30 focus:outline-none transition-colors ${
              error ? 'border-red-500/50 focus:border-red-500/50' : 'border-white/10 focus:border-gold/50'
            }`}
          />
          {error && (
            <p className="text-red-400 text-xs mt-2">Wrong password. Try again.</p>
          )}
          <button
            type="submit"
            disabled={!pw.trim()}
            className="w-full mt-4 bg-maroon hover:bg-maroon/80 disabled:opacity-30 text-white font-semibold py-3 rounded-xl transition-all"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

function NameModal({
  onSubmit,
  onClose,
  currentRole,
}: {
  onSubmit: (name: string, role: Role) => void;
  onClose?: () => void;
  currentRole: Role | null;
}) {
  const [value, setValue] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>(currentRole || 'student');

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
        <h2 className="text-2xl font-bold mb-2">Welcome!</h2>
        <p className="text-white/50 mb-6 text-sm">
          Enter your name and tell us who you are.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onSubmit(value.trim(), selectedRole);
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

          {/* Role picker */}
          <div className="flex gap-2 mt-4">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedRole(opt.value)}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                  selectedRole === opt.value
                    ? 'bg-maroon text-white border border-maroon'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/20'
                }`}
              >
                <span className="block text-lg mb-0.5">{opt.emoji}</span>
                {opt.label}
              </button>
            ))}
          </div>

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
