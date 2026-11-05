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

DB는 **PostgreSQL 16**이다(개발·스테이징 공통 기준, GCP 스테이징 Cloud SQL `POSTGRES_16`과 같은 주요 버전). 운영 DB 버전은 아직 정하지 않았다. 데이터는 `db-data-pg16` 볼륨에 둔다.

17로 쓰던 로컬 볼륨(`db-data`)은 16 컨테이너에 연결하지 않는다(주요 버전이 다른 데이터 디렉터리는 열 수 없다). 남길 데이터가 있으면 17 컨테이너가 떠 있을 때 덤프하고, 16 컨테이너에서 스키마를 적용한 뒤 복원한다. 옛 볼륨은 지우지 않고 그대로 둔다.

```bash
docker exec <17 DB 컨테이너> pg_dump -U board -d board --data-only --column-inserts > artifacts/pg17-data.sql
docker exec -i <16 DB 컨테이너> psql -U board -d board -v ON_ERROR_STOP=1 < artifacts/pg17-data.sql
```

## 환경변수

| 이름 | 필수 | 뜻 |
|---|---|---|
| `DATABASE_URL` | 예 | 이 환경의 DB 주소. 스테이징은 클라우드마다 전용 DB(AWS 스테이징 → AWS 스테이징 DB, GCP 스테이징 → GCP 스테이징 DB)를 쓰고 서로 동기화하지 않는다. 운영 DB와도 나눈다 |
| `APP_ENV` | 아니오 | 환경 이름. `staging`일 때만 `python -m app.reset`이 데이터를 지운다 |
| `SERVED_BY` | 아니오(`local`) | 응답한 클라우드 이름. 뒤에 호스트명이 붙는다 |
| `APP_VERSION` | 아니오(`dev`) | 화면·헤더에 보이는 버전 |
| `MIGRATE_ON_START` | 아니오(`0`) | `1`이면 시작할 때 스키마를 적용한다. Compose에서만 켠다 |

## 스키마 적용

배포 파이프라인에서는 쓰기 DB에 한 번만 실행한다. 여러 번 실행해도 결과가 같다.

```bash
docker run --rm -e DATABASE_URL=<쓰기 DB 주소> <이미지> python -m app.migrate
```

스키마를 바꿀 때는 교체 중 옛 버전과 새 버전이 함께 돌아도 깨지지 않게 한다(컬럼 추가 먼저, 삭제는 다음 버전). 모든 테이블에 기본 키를 둔다(논리 복제 조건).

## 스테이징 데이터 초기화

점검 회차마다 스테이징 배포 직전에 같은 이미지로 한 번 실행한다. 순서는 스키마 적용(`app.migrate`와 같은 코드) → 게시글·댓글 비우기 → 남은 행 수 확인이다. 초기 데이터(시드)는 없다. 빈 게시판에서 시작한다.

```bash
docker run --rm -e APP_ENV=staging -e DATABASE_URL=<스테이징 DB 주소> <이미지> python -m app.reset
```

- 종료 코드 0: 남은 행 0(`reset rows_remaining=0` 출력). 1: 남은 행이 있음. 2: `APP_ENV=staging`이 아니라 거부(데이터를 건드리지 않음).
- 0이 아니면 배포와 DAST를 진행하지 않는다(스테이징 도구가 막는다).
- 운영에는 이 명령을 실행하는 Job을 만들지 않는다. 운영 대상 설정에는 초기화 Job을 둘 수 없다.

클라우드별로 다른 것은 DB 주소·접속 설정과 환경 식별값(`SERVED_BY`, `APP_ENV`)뿐이다. 이미지 digest, 마이그레이션, 초기화 코드는 같다. PostgreSQL을 띄우는 방식(Cloud SQL, RDS, 컨테이너)은 달라도 된다.

## 테스트

```bash
pip install -r requirements-dev.txt
TEST_DATABASE_URL=postgresql://postgres:<비밀번호>@localhost:5432/postgres pytest
```

테스트는 시작할 때 `comments`, `posts`를 비우므로 전용 DB를 쓴다. CI와 같은 PostgreSQL 16을 쓴다.

## 이미지

GitHub Actions `Build image`를 수동 실행하면 `ghcr.io/2026-sbh-delta/delta-sample-app-web:<tag>`로 올린다.

상세 설계와 검증 기록: [docs/ai-dlc/sample-app.md](docs/ai-dlc/sample-app.md)
