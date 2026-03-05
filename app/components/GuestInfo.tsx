'use client';

const VENUES = [
  {
    event: 'Match Day Celebration',
    date: 'March 20, 2026',
    venue: 'University City, Philadelphia',
    address: null,
    note: 'Exact location TBD - check back for updates!',
  },
  {
    event: 'Graduation Party',
    date: 'April 28, 2026',
    venue: 'Urban Saloon',
    address: '2120 Fairmount Ave, Philadelphia, PA 19130',
    note: 'Street parking available. Uber/Lyft recommended.',
  },
];

const HOTELS = [
  { name: 'The Logan Hotel', distance: '0.5 mi from Urban Saloon', price: '$$$$' },
  { name: 'Sonesta Philadelphia', distance: '1 mi from Urban Saloon', price: '$$$' },
  { name: 'Holiday Inn Express Midtown', distance: '0.8 mi from Urban Saloon', price: '$$' },
  { name: 'Hilton Garden Inn Center City', distance: '1.2 mi from PCOM campus', price: '$$' },
];

const TIPS = [
  { emoji: '\u{1F697}', title: 'Getting Around', text: 'Uber/Lyft is easiest. SEPTA regional rail goes everywhere. Street parking is free after 10pm and on Sundays.' },
  { emoji: '\u{1F37D}\u{FE0F}', title: 'Food Near Urban Saloon', text: 'Sabrina\'s Cafe (brunch), Zorba\'s Tavern (Greek), Osteria (upscale Italian) - all walking distance.' },
  { emoji: '\u{1F393}', title: 'Commencement', text: 'PCOM commencement is on April 27 at the Kimmel Center. This party is the night AFTER graduation.' },
  { emoji: '\u{2600}\u{FE0F}', title: 'Weather', text: 'Late April in Philly is usually 55-70\u00B0F. Bring a light jacket for the evening.' },
];

export default function GuestInfo() {
  return (
    <section id="info" className="py-20 px-4 max-w-5xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-2">
        Info for Family & Friends
      </h2>
      <p className="text-white/40 text-center mb-12 max-w-lg mx-auto">
        Coming to Philly to celebrate? Here&apos;s everything you need to know.
      </p>

      {/* Venue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        {VENUES.map((v) => (
          <div key={v.event} className="glass-card p-6">
            <p className="text-gold font-mono text-sm tracking-wide">{v.date}</p>
            <h3 className="text-xl font-bold mt-1">{v.event}</h3>
            <p className="text-white/60 text-sm mt-2">{v.venue}</p>
            {v.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(v.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-gold/60 hover:text-gold text-xs mt-1 transition-colors"
              >
                {v.address} &rarr;
              </a>
            )}
            <p className="text-white/30 text-xs mt-3">{v.note}</p>
          </div>
        ))}
      </div>

      {/* Tips */}
      <h3 className="text-xl font-bold text-center mb-6">Philly Tips</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
        {TIPS.map((t) => (
          <div key={t.title} className="glass-card p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">{t.emoji}</span>
              <div>
                <p className="font-semibold text-white/90 text-sm">{t.title}</p>
                <p className="text-white/40 text-sm mt-1 leading-relaxed">{t.text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Hotels */}
      <h3 className="text-xl font-bold text-center mb-6">Nearby Hotels</h3>
      <div className="glass-card divide-y divide-white/5">
        {HOTELS.map((h) => (
          <div key={h.name} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-white/80 text-sm font-medium">{h.name}</p>
              <p className="text-white/30 text-xs mt-0.5">{h.distance}</p>
            </div>
            <span className="text-gold/50 text-sm">{h.price}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
