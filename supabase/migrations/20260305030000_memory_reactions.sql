CREATE TABLE IF NOT EXISTS memory_reactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  memory_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint: one reaction type per person per memory
CREATE UNIQUE INDEX IF NOT EXISTS memory_reactions_unique
  ON memory_reactions(memory_id, guest_name, emoji);

-- Enable RLS
ALTER TABLE memory_reactions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read
CREATE POLICY "Anyone can read memory reactions" ON memory_reactions
  FOR SELECT USING (true);

-- Allow anyone to insert
CREATE POLICY "Anyone can insert memory reactions" ON memory_reactions
  FOR INSERT WITH CHECK (true);

-- Allow anyone to delete their own reactions
CREATE POLICY "Anyone can delete own memory reactions" ON memory_reactions
  FOR DELETE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE memory_reactions;
