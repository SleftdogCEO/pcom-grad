import { Providers } from './components/Providers';
import Hero from './components/Hero';
import EventCards from './components/EventCards';
import ShoutoutWall from './components/ShoutoutWall';
import RideBoard from './components/RideBoard';
import Navbar from './components/Navbar';

export default function Home() {
  return (
    <Providers>
      <Navbar />
      <main>
        <Hero />
        <EventCards />
        <ShoutoutWall />
        <RideBoard />
      </main>
      <footer className="text-center py-12 text-white/20 text-sm border-t border-white/5">
        PCOM DO Class of 2026 &mdash; Philadelphia, PA
      </footer>
    </Providers>
  );
}
