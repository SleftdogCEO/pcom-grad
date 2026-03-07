CREATE TABLE IF NOT EXISTS poker_rooms (
  id text primary key,
  game_state jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE poker_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poker_rooms_select" ON poker_rooms FOR SELECT USING (true);
CREATE POLICY "poker_rooms_insert" ON poker_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "poker_rooms_update" ON poker_rooms FOR UPDATE USING (true);
CREATE POLICY "poker_rooms_delete" ON poker_rooms FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE poker_rooms;
