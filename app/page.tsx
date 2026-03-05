import { Providers } from './components/Providers';
import Hero from './components/Hero';
import EventCards from './components/EventCards';
import ShoutoutWall from './components/ShoutoutWall';
import RideBoard from './components/RideBoard';
import MatchMap from './components/MatchMap';
import GuestInfo from './components/GuestInfo';
import Memories from './components/Memories';
import Navbar from './components/Navbar';
import Particles from './components/Particles';

export default function Home() {
  return (
    <Providers>
      <Particles />
      <Navbar />
      <main className="relative z-10">
        <Hero />
        <Memories />
        <EventCards />
        <MatchMap />
        <ShoutoutWall />
        <RideBoard />
        <GuestInfo />
      </main>
      <footer className="relative z-10 text-center py-12 text-white/20 text-sm border-t border-white/5">
        PCOM DO Class of 2026 &mdash; Philadelphia, PA
      </footer>
    </Providers>
  );
}
