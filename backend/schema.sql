CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  content text NOT NULL CHECK (length(content) <= 2000),
  created_at timestamptz NOT NULL
);
