"""공통 페이지 틀."""

from html import escape

from flask import current_app

PAGE = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{title} · 델타 게시판</title>
<link rel="stylesheet" href="/static/style.css"></head>
<body><header><a class="brand" href="/board">델타 게시판</a></header>
<main><h1>{title}</h1>{content}</main><footer>{footer}</footer></body></html>"""


def page(title: str, content: str) -> str:
    footer = (f'<span class="served">응답 {escape(current_app.config["SERVED_BY"])}</span>'
              f'<span>v{escape(current_app.config["APP_VERSION"])}</span>')
    return PAGE.format(title=escape(title), content=content, footer=footer)
