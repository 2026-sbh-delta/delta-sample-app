import re

from app import create_app

SAVED_LINK = re.compile(r'id="saved-post" href="(/posts/[a-f0-9]{32})"')


def write_post(client, title="첫 글", body="본문"):
    res = client.post("/posts", data={"title": title, "body": body})
    assert res.status_code == 200
    return SAVED_LINK.search(res.get_data(as_text=True)).group(1)


def test_board_lists_saved_post(client):
    write_post(client, title="목록에 보일 글")
    html = client.get("/board").get_data(as_text=True)
    assert 'href="/new"' in html
    assert "목록에 보일 글" in html


def test_new_form_keeps_dast_selectors(client):
    html = client.get("/new").get_data(as_text=True)
    assert 'name="title"' in html and 'name="body"' in html
    assert html.count("<form") == 1


def test_post_body_is_rendered_raw(client):
    # 시연용 취약점: 본문을 escape하지 않는다.
    path = write_post(client, body="<b>굵게</b>")
    html = client.get(path).get_data(as_text=True)
    assert '<div id="post-body"><b>굵게</b></div>' in html
    assert 'id="comments-link"' in html


def test_title_is_escaped(client):
    path = write_post(client, title="<i>제목</i>")
    assert "&lt;i&gt;제목&lt;/i&gt;" in client.get(path).get_data(as_text=True)


def test_empty_post_is_rejected(client):
    assert client.post("/posts", data={"title": "", "body": "x"}).status_code == 422


def test_comments_are_stored_under_csp(client):
    path = write_post(client)
    res = client.post(f"{path}/comments", data={"comment": "<em>댓글</em>"})
    assert res.status_code == 303
    page = client.get(f"{path}/comments")
    assert "script-src 'self'" in page.headers["Content-Security-Policy"]
    assert "<li><em>댓글</em></li>" in page.get_data(as_text=True)


def test_unknown_post_is_404(client):
    assert client.get("/posts/" + "0" * 32).status_code == 404
    assert client.post("/posts/" + "0" * 32 + "/comments", data={"comment": "x"}).status_code == 404


def test_posts_survive_new_instance(client, database_url, monkeypatch):
    # 다른 인스턴스(다른 클라우드)가 같은 DB를 보면 같은 글이 보여야 한다.
    path = write_post(client, title="다른 인스턴스에서도")
    monkeypatch.setenv("SERVED_BY", "other")
    other = create_app().test_client()
    res = other.get(path)
    assert res.status_code == 200
    assert res.headers["X-Served-By"].startswith("other/")


def test_health_and_served_by(client):
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.get_json()["status"] == "ok"
    assert res.headers["X-Served-By"].startswith("test/")
