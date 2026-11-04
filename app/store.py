"""게시글·댓글 저장소(PostgreSQL)."""

from uuid import uuid4

from .db import db


def create_post(title: str, body: str) -> str:
    post_id = uuid4().hex
    with db() as conn:
        conn.execute("INSERT INTO posts (id, title, body) VALUES (%s, %s, %s)", (post_id, title, body))
    return post_id


def list_posts() -> list[dict]:
    with db() as conn:
        return conn.execute(
            "SELECT p.id, p.title, p.created_at, count(c.id) AS comment_count FROM posts p "
            "LEFT JOIN comments c ON c.post_id = p.id GROUP BY p.id ORDER BY p.created_at DESC LIMIT 100"
        ).fetchall()


def get_post(post_id: str) -> dict | None:
    with db() as conn:
        return conn.execute("SELECT id, title, body, created_at FROM posts WHERE id = %s",
                            (post_id,)).fetchone()


def add_comment(post_id: str, body: str) -> None:
    with db() as conn:
        conn.execute("INSERT INTO comments (post_id, body) VALUES (%s, %s)", (post_id, body))


def list_comments(post_id: str) -> list[str]:
    with db() as conn:
        rows = conn.execute("SELECT body FROM comments WHERE post_id = %s ORDER BY id",
                            (post_id,)).fetchall()
    return [row["body"] for row in rows]

