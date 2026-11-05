"""게시글 목록·작성·상세."""

from html import escape

from flask import Blueprint, abort, request

from .layout import page
from .store import create_post, get_post, list_posts

board = Blueprint("board", __name__)


@board.get("/board")
def board_list():
    posts = list_posts()
    rows = "".join(
        f'<tr><td><a class="post-title" href="/posts/{post["id"]}">{escape(post["title"])}</a></td>'
        f'<td><span class="count" title="댓글">{post["comment_count"]}</span></td>'
        f'<td>{post["created_at"]:%m-%d %H:%M}</td></tr>'
        for post in posts
    ) or '<tr><td colspan="3" class="empty">아직 게시글이 없습니다. 첫 글을 남겨 보세요.</td></tr>'
    table = ('<div class="card flush"><table class="posts"><thead><tr><th>제목</th><th>댓글</th><th>작성</th></tr></thead>'
             f'<tbody>{rows}</tbody></table></div>')
    return page("게시글 목록", table, lead=f"전체 {len(posts)}개의 글",
                action='<a class="button" href="/new">글 작성</a>')


@board.get("/new")
def new_post():
    form = ('<form method="post" action="/posts" class="card stack">'
            '<label>제목<input name="title" required maxlength="120" placeholder="제목을 입력하세요"></label>'
            '<label>본문<textarea name="body" required rows="10" placeholder="내용을 입력하세요"></textarea></label>'
            '<div class="form-actions"><button>게시글 저장</button></div></form>')
    return page("새 게시글 작성", form, lead="작성한 글은 바로 게시판에 올라갑니다.")


@board.post("/posts")
def save_post():
    title = request.form.get("title", "").strip()
    body = request.form.get("body", "")
    if not title or not body:
        abort(422)
    # 저장 확인 화면에서 상세로 이동한다. DAST는 이 링크로 저장된 글을 찾는다.
    post_id = create_post(title, body)
    return page("저장 완료", '<div class="card notice"><span class="check" aria-hidden="true">✓</span>'
                f'<div><p>게시글을 저장했습니다.</p><a id="saved-post" href="/posts/{post_id}">저장한 글 보기</a></div></div>')


@board.get("/posts/<post_id>")
def post_detail(post_id: str):
    post = get_post(post_id)
    if post is None:
        abort(404)
    # 본문은 HTML 텍스트 맥락에 맞게 인코딩한다.
    body = escape(post["body"])
    content = (f'<article class="card post"><h2>{escape(post["title"])}</h2>'
               f'<p class="meta">{post["created_at"]:%Y-%m-%d %H:%M}</p><div id="post-body">{body}</div></article>'
               f'<div class="post-nav"><a class="ghost" href="/board">← 목록</a>'
               f'<a id="comments-link" class="button" href="/posts/{post["id"]}/comments">댓글 보기·쓰기</a></div>')
    return page("게시글 상세", content)
