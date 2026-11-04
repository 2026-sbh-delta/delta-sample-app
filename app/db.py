"""PostgreSQL 연결 풀. 쓰기 DB 주소는 DATABASE_URL로 받는다."""

from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

SCHEMA = Path(__file__).with_name("schema.sql")

_pool: ConnectionPool | None = None
_url: str | None = None


def init(url: str) -> None:
    global _pool, _url
    if _pool is not None and _url == url:
        return
    if _pool is not None:
        _pool.close()
    _pool = ConnectionPool(url, min_size=1, max_size=8, timeout=5, open=True,
                           kwargs={"autocommit": True, "row_factory": dict_row})
    _url = url


def db():
    """`with db() as conn:` 형태로 쓴다. 블록이 끝나면 연결을 풀에 돌려준다."""
    if _pool is None:
        raise RuntimeError("db.init()을 먼저 호출해야 한다")
    return _pool.connection()


def migrate(url: str) -> None:
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(SCHEMA.read_text(encoding="utf-8"))
