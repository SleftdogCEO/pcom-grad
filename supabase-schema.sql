-- Run this in your Supabase SQL editor (supabase.com → project → SQL Editor)

-- RSVPs
create table rsvps (
  id uuid default gen_random_uuid() primary key,
  guest_name text not null,
  event text not null check (event in ('march20', 'april28')),
  created_at timestamptz default now()
);
create unique index rsvps_unique on rsvps (lower(guest_name), event);

-- Shoutouts / Wall posts
create table shoutouts (
  id uuid default gen_random_uuid() primary key,
  guest_name text not null,
  message text not null,
  category text not null default 'hype',
  created_at timestamptz default now()
);

-- Ride board
create table rides (
  id uuid default gen_random_uuid() primary key,
  guest_name text not null,
  ride_type text not null check (ride_type in ('offer', 'request')),
  event text not null check (event in ('march20', 'april28')),
  seats int default 1,
  area text,
  message text,
  created_at timestamptz default now()
);

-- Enable realtime
alter publication supabase_realtime add table rsvps;
alter publication supabase_realtime add table shoutouts;
alter publication supabase_realtime add table rides;

-- Row level security (open access for event guests)
alter table rsvps enable row level security;
alter table shoutouts enable row level security;
alter table rides enable row level security;

create policy "Allow all reads" on rsvps for select using (true);
create policy "Allow all inserts" on rsvps for insert with check (true);

create policy "Allow all reads" on shoutouts for select using (true);
create policy "Allow all inserts" on shoutouts for insert with check (true);

create policy "Allow all reads" on rides for select using (true);
create policy "Allow all inserts" on rides for insert with check (true);
create policy "Allow all deletes" on rides for delete using (true);
