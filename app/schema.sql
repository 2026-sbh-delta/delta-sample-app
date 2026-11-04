-- 여러 번 실행해도 결과가 같다. 논리 복제를 쓰므로 모든 테이블에 기본 키를 둔다.
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
    id BIGSERIAL PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_post_id_idx ON comments (post_id, id);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts (created_at DESC);
