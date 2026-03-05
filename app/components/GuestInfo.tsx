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
  {
    name: 'The Logan Philadelphia',
    address: '1 Logan Square, Philadelphia, PA 19103',
    distance: '0.5 mi from Urban Saloon',
    price: '$$$$',
    url: 'https://www.hilton.com/en/hotels/phlcuqq-the-logan-philadelphia/',
  },
  {
    name: 'Sonesta Philadelphia Rittenhouse Square',
    address: '1800 Market St, Philadelphia, PA 19103',
    distance: '1 mi from Urban Saloon',
    price: '$$$',
    url: 'https://www.sonesta.com/sonesta-hotels-resorts/pa/philadelphia/sonesta-philadelphia-rittenhouse-square',
  },
  {
    name: 'Holiday Inn Express Philadelphia-Midtown',
    address: '1305 Walnut St, Philadelphia, PA 19107',
    distance: '1.5 mi from Urban Saloon',
    price: '$$',
    url: 'https://www.ihg.com/holidayinnexpress/hotels/us/en/philadelphia/phlwl/hoteldetail',
  },
  {
    name: 'Hampton Inn Philadelphia Center City',
    address: '1301 Race St, Philadelphia, PA 19107',
    distance: '1 mi from Urban Saloon',
    price: '$$',
    url: 'https://www.hilton.com/en/hotels/phlrchx-hampton-philadelphia-center-city-convention-center/',
  },
  {
    name: 'Courtyard by Marriott City Avenue',
    address: '4100 Presidential Blvd, Philadelphia, PA 19131',
    distance: '0.5 mi from PCOM campus',
    price: '$$',
    url: 'https://www.marriott.com/hotels/travel/phlav-courtyard-philadelphia-city-avenue/',
  },
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
          <a
            key={h.name}
            href={h.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors group block"
          >
            <div>
              <p className="text-white/80 text-sm font-medium group-hover:text-gold transition-colors">
                {h.name} <span className="text-white/20 group-hover:text-gold/50">&rarr;</span>
              </p>
              <p className="text-white/30 text-xs mt-0.5">{h.distance}</p>
              <p className="text-white/20 text-xs mt-0.5">{h.address}</p>
            </div>
            <span className="text-gold/50 text-sm shrink-0 ml-4">{h.price}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
