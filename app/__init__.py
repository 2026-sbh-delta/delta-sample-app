"""시연용 게시판. 일부러 취약하게 둔 곳이 있다(게시글 본문, 댓글 출력). 운영에 쓰지 않는다."""

import os
import socket

from flask import Flask, redirect

from . import db
from .board import board
from .comments import comments


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.update(
        SERVED_BY=f'{os.environ.get("SERVED_BY", "local")}/{socket.gethostname()}',
        APP_VERSION=os.environ.get("APP_VERSION", "dev"),
    )
    db.init(os.environ["DATABASE_URL"])
    app.register_blueprint(board)
    app.register_blueprint(comments)

    @app.get("/")
    def root():
        return redirect("/board", code=302)

    @app.get("/healthz")
    def healthz():
        with db.db() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "served_by": app.config["SERVED_BY"], "version": app.config["APP_VERSION"]}

    @app.after_request
    def served_by(response):
        # 어느 클라우드·인스턴스가 응답했는지 보여 준다.
        response.headers["X-Served-By"] = app.config["SERVED_BY"]
        response.headers["X-App-Version"] = app.config["APP_VERSION"]
        return response

    return app
