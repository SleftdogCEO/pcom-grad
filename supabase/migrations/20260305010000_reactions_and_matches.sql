-- Emoji reactions on wall posts
create table reactions (
  id uuid default gen_random_uuid() primary key,
  shoutout_id uuid not null references shoutouts(id) on delete cascade,
  guest_name text not null,
  emoji text not null check (emoji in ('fire', 'heart', 'laugh', 'hundred')),
  created_at timestamptz default now()
);
create unique index reactions_unique on reactions (shoutout_id, lower(guest_name), emoji);

-- Where We Matched
create table matches (
  id uuid default gen_random_uuid() primary key,
  guest_name text not null,
  specialty text not null,
  city text not null,
  state text not null,
  program text,
  created_at timestamptz default now()
);
create unique index matches_unique on matches (lower(guest_name));

-- Enable realtime
alter publication supabase_realtime add table reactions;
alter publication supabase_realtime add table matches;

-- RLS
alter table reactions enable row level security;
alter table matches enable row level security;

create policy "Allow all reads" on reactions for select using (true);
create policy "Allow all inserts" on reactions for insert with check (true);
create policy "Allow all deletes" on reactions for delete using (true);

create policy "Allow all reads" on matches for select using (true);
create policy "Allow all inserts" on matches for insert with check (true);
create policy "Allow all updates" on matches for update using (true);
