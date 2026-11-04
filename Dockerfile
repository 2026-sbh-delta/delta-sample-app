# 시연용 게시판(의도적으로 취약). 운영에 배포하지 않는다.
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY wsgi.py ./
RUN useradd --uid 10001 app
USER app
EXPOSE 8080
# 스키마는 쓰기 DB에 한 번만 적용한다. 단독 실행(Compose 등)에서만 MIGRATE_ON_START=1로 켠다.
CMD ["sh", "-c", "if [ \"${MIGRATE_ON_START:-0}\" = 1 ]; then python -m app.migrate || exit 1; fi; exec gunicorn --bind 0.0.0.0:8080 --workers 2 --threads 4 --graceful-timeout 20 --access-logfile - wsgi:app"]
