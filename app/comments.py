"""게시글 댓글 등록·표시."""

from flask import Blueprint, abort, redirect, request

from .layout import page
from .store import add_comment, get_post, list_comments

comments = Blueprint("comments", __name__)

# 댓글 화면은 인라인 스크립트를 막는 CSP 아래에서 보여 준다.
CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'"


def render_comments(post_id: str, items: list[str]) -> str:
    # 저장된 댓글을 그대로 목록에 넣는다.
    rows = "".join(f"<li>{text}</li>" for text in items) or "<li>아직 댓글이 없습니다.</li>"
    form = (f'<form method="post" action="/posts/{post_id}/comments" class="stack">'
            '<textarea name="comment" required rows="3"></textarea><button>댓글 등록</button></form>')
    return f'<section class="comments"><ul id="comment-list">{rows}</ul>{form}</section>'


@comments.get("/posts/<post_id>/comments")
def comment_list(post_id: str):
    post = get_post(post_id)
    if post is None:
        abort(404)
    content = f'<a href="/posts/{post["id"]}">본문으로</a>{render_comments(post["id"], list_comments(post["id"]))}'
    return page("댓글", content), 200, {"Content-Security-Policy": CSP}


@comments.post("/posts/<post_id>/comments")
def comment_add(post_id: str):
    post = get_post(post_id)
    text = request.form.get("comment", "")
    if post is None:
        abort(404)
    if not text.strip():
        abort(422)
    add_comment(post["id"], text)
    return redirect(f"/posts/{post['id']}/comments", code=303)
