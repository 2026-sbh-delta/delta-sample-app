"""공통 페이지 틀."""

from html import escape

from flask import current_app

PAGE = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{title} · 델타 커뮤니티</title>
<link rel="stylesheet" href="/static/style.css"></head>
<body><header class="topbar"><div class="wrap">
<a class="brand" href="/board"><span class="mark" aria-hidden="true">Δ</span><span>델타 커뮤니티</span></a>
<nav><a href="/board">게시판</a></nav></div></header>
<main class="wrap"><div class="page-head"><div><h1>{title}</h1>{lead}</div>{action}</div>{content}</main>
<footer class="wrap">{footer}</footer></body></html>"""


def served_badge() -> str:
    # SERVED_BY 는 "클라우드/호스트". 어느 클라우드가 응답했는지 한눈에 보이게 클라우드별 색을 붙인다.
    served = current_app.config["SERVED_BY"]
    cloud, _, host = served.partition("/")
    tone = cloud if cloud in ("aws", "gcp") else "local"
    return (f'<span class="served cloud-{tone}"><b>{escape(cloud.upper())}</b>'
            f'<span>{escape(host)}</span></span>')


def page(title: str, content: str, *, lead: str = "", action: str = "") -> str:
    """lead: 제목 아래 한 줄 설명(이미 이스케이프한 HTML), action: 제목 오른쪽 버튼(HTML)."""
    footer = (f'<span class="served-wrap">응답 {served_badge()}</span>'
              f'<span>v{escape(current_app.config["APP_VERSION"])}</span>')
    return PAGE.format(title=escape(title), content=content, footer=footer,
                       lead=f'<p class="lead">{lead}</p>' if lead else "", action=action)
