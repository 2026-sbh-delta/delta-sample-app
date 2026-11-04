import os

import psycopg
import pytest

from app import create_app, db


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.fail("TEST_DATABASE_URL(테스트용 PostgreSQL 주소)을 설정해야 한다")
    db.migrate(url)
    return url


@pytest.fixture
def app(database_url, monkeypatch):
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("TRUNCATE comments, posts")
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("SERVED_BY", "test")
    return create_app()


@pytest.fixture
def client(app):
    return app.test_client()
