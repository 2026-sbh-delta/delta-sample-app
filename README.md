# delta-sample-app

Delta 파이프라인 시연용 게시판이다. **일부러 취약하게 만든 코드가 있어 운영에 쓰지 않는다.**

Flask가 HTML까지 서버에서 만들고(화면·API 한 컨테이너), 글과 댓글은 PostgreSQL에 저장한다. 로그인은 없다.

```text
Browser -> web (Flask + gunicorn) -> PostgreSQL
```

## 화면과 경로

| 경로 | 내용 |
|---|---|
| `GET /board` | 게시글 목록 |
| `GET /new`, `POST /posts` | 글 작성, 저장 확인(`#saved-post` 링크) |
| `GET /posts/<id>` | 게시글 상세(`#post-body`, `#comments-link`) |
| `GET·POST /posts/<id>/comments` | 댓글 목록·등록(CSP 적용) |
| `GET /healthz` | DB까지 확인하는 헬스 체크 |

모든 응답에 `X-Served-By`(클라우드/인스턴스)와 `X-App-Version` 헤더를 붙인다. 화면 아래에도 같은 값을 보여 준다.

## 시연용 취약점

| 위치 | 취약점 | SAST | DAST |
|---|---|---|---|
| `app/board.py` `post_detail` | 게시글 본문을 escape 없이 출력(저장형 XSS) | 후보로 탐지. 폼 입력 → `posts` INSERT → SELECT → HTML 흐름 | 실제 스크립트 실행으로 검증, AI 수정 대상 |
| `app/comments.py` `render_comments` | 댓글을 escape 없이 출력(저장형 XSS) | 후보로 탐지 | CSP(`script-src 'self'`) 때문에 인라인 실행이 막혀 실제 악용 불가로 판정 |

DAST가 쓰는 HTML id(`#saved-post`, `#post-body`, `#comments-link`)와 폼 이름(`title`, `body`, `comment`)은 바꾸지 않는다. 바꾸면 DAST 대상 설정도 같이 바꿔야 한다.

## 실행

```bash
export POSTGRES_PASSWORD="$(openssl rand -hex 16)"
docker compose up -d --build --wait
```

`http://localhost:8080/board`로 들어간다. 포트는 `WEB_PORT`, 응답 표시는 `SERVED_BY`(예: `aws`, `gcp`), 버전은 `APP_VERSION`으로 바꾼다.

## 환경변수

| 이름 | 필수 | 뜻 |
|---|---|---|
| `DATABASE_URL` | 예 | 쓰기 DB 주소. 모든 클라우드가 같은 쓰기 DB를 본다 |
| `SERVED_BY` | 아니오(`local`) | 응답한 클라우드 이름. 뒤에 호스트명이 붙는다 |
| `APP_VERSION` | 아니오(`dev`) | 화면·헤더에 보이는 버전 |
| `MIGRATE_ON_START` | 아니오(`0`) | `1`이면 시작할 때 스키마를 적용한다. Compose에서만 켠다 |

## 스키마 적용

배포 파이프라인에서는 쓰기 DB에 한 번만 실행한다. 여러 번 실행해도 결과가 같다.

```bash
docker run --rm -e DATABASE_URL=<쓰기 DB 주소> <이미지> python -m app.migrate
```

스키마를 바꿀 때는 교체 중 옛 버전과 새 버전이 함께 돌아도 깨지지 않게 한다(컬럼 추가 먼저, 삭제는 다음 버전). 모든 테이블에 기본 키를 둔다(논리 복제 조건).

## 테스트

```bash
pip install -r requirements-dev.txt
TEST_DATABASE_URL=postgresql://postgres:<비밀번호>@localhost:5432/postgres pytest
```

테스트는 시작할 때 `comments`, `posts`를 비우므로 전용 DB를 쓴다.

## 이미지

GitHub Actions `Build image`를 수동 실행하면 `ghcr.io/2026-sbh-delta/delta-sample-app-web:<tag>`로 올린다.

상세 설계와 검증 기록: [docs/ai-dlc/sample-app.md](docs/ai-dlc/sample-app.md)
