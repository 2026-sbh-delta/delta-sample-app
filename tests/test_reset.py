import psycopg

from app import reset


def _seed(url):
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("INSERT INTO posts (id, title, body) VALUES ('p1', 't', '<script>alert(1)</script>')")
        conn.execute("INSERT INTO comments (post_id, body) VALUES ('p1', 'c')")


def _rows(url):
    with psycopg.connect(url, autocommit=True) as conn:
        return conn.execute("SELECT (SELECT count(*) FROM posts) + (SELECT count(*) FROM comments)").fetchone()[0]


def test_staging_reset_empties_posts_and_comments(app, database_url, monkeypatch, capsys):
    _seed(database_url)
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("DATABASE_URL", database_url)

    assert reset.main() == 0
    assert _rows(database_url) == 0
    assert "reset rows_remaining=0" in capsys.readouterr().out


def test_reset_refuses_outside_staging_and_keeps_data(app, database_url, monkeypatch):
    _seed(database_url)
    for env in (None, "production", "local"):
        if env is None:
            monkeypatch.delenv("APP_ENV", raising=False)
        else:
            monkeypatch.setenv("APP_ENV", env)
        assert reset.main() == 2
    assert _rows(database_url) == 2


def test_reset_applies_schema_on_an_empty_database(database_url, monkeypatch):
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS comments, posts")
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("DATABASE_URL", database_url)

    assert reset.main() == 0
    assert _rows(database_url) == 0
