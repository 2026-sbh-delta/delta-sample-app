"""스키마 적용. 쓰기 DB에 한 번 실행한다. 여러 번 실행해도 결과가 같다."""

import os

from .db import migrate

if __name__ == "__main__":
    migrate(os.environ["DATABASE_URL"])
    print("schema applied", flush=True)
