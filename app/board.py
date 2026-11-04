"""게시글 목록·작성·상세."""

from html import escape

from flask import Blueprint, abort, request

from .layout import page
from .store import create_post, get_post, list_posts

board = Blueprint("board", __name__)


@board.get("/board")
def board_list():
    rows = "".join(
        f'<tr><td><a href="/posts/{post["id"]}">{escape(post["title"])}</a></td>'
        f'<td>{post["comment_count"]}</td>'
        f'<td>{post["created_at"]:%m-%d %H:%M}</td></tr>'
        for post in list_posts()
    ) or '<tr><td colspan="3" class="empty">아직 게시글이 없습니다.</td></tr>'
    table = ('<table class="posts"><thead><tr><th>제목</th><th>댓글</th><th>작성</th></tr></thead>'
             f'<tbody>{rows}</tbody></table>')
    return page("게시글 목록", f'<p class="actions"><a class="button" href="/new">글 작성</a></p>{table}')


@board.get("/new")
def new_post():
    form = ('<form method="post" action="/posts" class="stack">'
            '<label>제목<input name="title" required maxlength="120"></label>'
            '<label>본문<textarea name="body" required rows="8"></textarea></label>'
            '<button>게시글 저장</button></form>')
    return page("새 게시글 작성", form)


@board.post("/posts")
def save_post():
    title = request.form.get("title", "").strip()
    body = request.form.get("body", "")
    if not title or not body:
        abort(422)
    # 저장 확인 화면에서 상세로 이동한다. DAST는 이 링크로 저장된 글을 찾는다.
    post_id = create_post(title, body)
    return page("저장 완료", f'<p>저장했습니다.</p><a id="saved-post" href="/posts/{post_id}">저장한 글 보기</a>')


@board.get("/posts/<post_id>")
def post_detail(post_id: str):
    post = get_post(post_id)
    if post is None:
        abort(404)
    # 본문을 그대로 HTML에 넣는다.
    body = post["body"]
    content = (f'<article><p class="meta">{post["created_at"]:%Y-%m-%d %H:%M}</p>'
               f'<h2>{escape(post["title"])}</h2><div id="post-body">{body}</div></article>'
               f'<a id="comments-link" href="/posts/{post["id"]}/comments">댓글 보기·쓰기</a>')
    return page("게시글 상세", content)
