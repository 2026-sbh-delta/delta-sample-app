import pg from 'pg';
import { HttpError } from './http.mjs';

export function createStore(env) {
  if (!env.DATABASE_URL) {
    const notes = new Map();
    return {
      kind: 'memory', health: async () => {}, close: async () => {},
      list: async () => [...notes.values()].reverse(),
      add: async (note) => {
        if (notes.size >= 1000) throw new HttpError(409, 'NOTE_LIMIT_REACHED', '메모 한도에 도달했어요.');
        notes.set(note.id, note);
      },
      remove: async (id) => notes.delete(id),
    };
  }
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3,
    connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 5000 });
  pool.on('error', () => console.error(JSON.stringify({ event: 'db_connection_error' })));
  return {
    kind: 'postgresql', health: async () => { await pool.query('SELECT 1 FROM notes LIMIT 1'); },
    close: () => pool.end(),
    list: async () => (await pool.query('SELECT id, title, content, created_at AS "createdAt" FROM notes ORDER BY created_at DESC, id DESC')).rows,
    add: async (note) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(240511)');
        const { rows } = await client.query('SELECT count(*)::int AS n FROM notes');
        if (rows[0].n >= 1000) throw new HttpError(409, 'NOTE_LIMIT_REACHED', '메모 한도에 도달했어요.');
        await client.query('INSERT INTO notes(id,title,content,created_at) VALUES($1,$2,$3,$4)', [note.id,note.title,note.content,note.createdAt]);
        await client.query('COMMIT');
      } catch (err) { await client.query('ROLLBACK'); throw err; }
      finally { client.release(); }
    },
    remove: async (id) => /^[a-f0-9-]{36}$/i.test(id)
      && (await pool.query('DELETE FROM notes WHERE id=$1', [id])).rowCount > 0,
  };
}
