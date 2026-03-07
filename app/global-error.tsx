'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: 40, color: 'white', background: '#0a0a12', fontFamily: 'monospace' }}>
        <h1 style={{ color: '#ef4444', fontSize: 24 }}>Something broke (global)</h1>
        <pre style={{ color: '#fca5a5', whiteSpace: 'pre-wrap', marginTop: 16, fontSize: 14 }}>
          {error.message}
        </pre>
        <pre style={{ color: '#666', whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 12 }}>
          {error.stack}
        </pre>
        <button
          onClick={reset}
          style={{ marginTop: 24, padding: '12px 24px', background: '#8B1A2B', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
