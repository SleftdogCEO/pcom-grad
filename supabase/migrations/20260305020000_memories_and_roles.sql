-- Memories table for daily photo posts
create table memories (
  id uuid default gen_random_uuid() primary key,
  guest_name text not null,
  guest_role text not null default 'student' check (guest_role in ('student', 'family', 'friend')),
  caption text,
  photo_url text not null,
  created_at timestamptz default now()
);

alter table memories enable row level security;
create policy "Anyone can read memories" on memories for select using (true);
create policy "Anyone can insert memories" on memories for insert with check (true);
create policy "Anyone can delete own memories" on memories for delete using (true);

-- Enable realtime
alter publication supabase_realtime add table memories;

-- Create storage bucket for photos
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

-- Storage policies: anyone can upload and read
create policy "Anyone can upload photos" on storage.objects for insert with check (bucket_id = 'photos');
create policy "Anyone can read photos" on storage.objects for select using (bucket_id = 'photos');
