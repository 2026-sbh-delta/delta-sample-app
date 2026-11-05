"""스테이징 데이터 초기화. 점검 회차마다 배포 직전에 한 번 실행한다.

순서: 스키마 적용(app.migrate 와 같은 코드) → 게시글·댓글 비우기 → 남은 행 수 확인.
APP_ENV=staging 일 때만 실행한다. 운영 DB에 잘못 연결돼도 지우지 않는다.

종료 코드: 0 초기화 완료(남은 행 0), 1 남은 행이 있음, 2 스테이징이 아니라 거부
"""

import os
import sys

import psycopg

from .db import migrate


def reset(url: str) -> int:
    """스키마를 적용하고 데이터를 비운 뒤 남은 행 수를 돌려준다."""
    migrate(url)
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("TRUNCATE comments, posts RESTART IDENTITY CASCADE")
        return conn.execute("SELECT (SELECT count(*) FROM posts) + (SELECT count(*) FROM comments)").fetchone()[0]


def main() -> int:
    if os.environ.get("APP_ENV") != "staging":
        print("reset refused: APP_ENV=staging 이 아니다", file=sys.stderr, flush=True)
        return 2
    left = reset(os.environ["DATABASE_URL"])
    print(f"reset rows_remaining={left}", flush=True)
    return 1 if left else 0


if __name__ == "__main__":
    raise SystemExit(main())
