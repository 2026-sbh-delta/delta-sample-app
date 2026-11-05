CREATE SCHEMA IF NOT EXISTS delta_notes;
CREATE TABLE IF NOT EXISTS delta_notes.notes (
    position bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id uuid NOT NULL UNIQUE,
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
    content text NOT NULL DEFAULT '' CHECK (length(content) <= 2000),
    created_at timestamptz NOT NULL
);
