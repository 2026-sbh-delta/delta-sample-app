# 시연용 게시판

## Ideation

- 문제: 시연 시나리오(SAST 탐지 → DAST 실증 → AI 수정 → 멀티클라우드 배포)에 쓸 앱이 SAST·DAST와 같은 코드여야 한다. 11/4 초판(Node.js FE/BE 메모 앱)은 SAST(Python 전용)와 DAST(Flask 게시판 기준)가 둘 다 적용되지 않았다.
- 사용자: 시연을 보는 심사위원, 파이프라인을 붙이는 팀원
- 성공 기준: SAST가 저장형 XSS 2건을 DB를 거치는 코드 흐름으로 찾고, DAST 대상 설정이 그대로 동작하며, AWS·GCP가 같은 DB를 볼 때 어느 쪽이 응답했는지 보인다.
- Scope: 게시글 목록·작성·상세, 댓글, PostgreSQL 저장, 응답 클라우드 표시, Docker Compose, CI
- Non-goals: 로그인·세션, 수정·삭제, 운영 수준 보안
- 승인: 2026-11-04 정준우 "1안으로"(저장소 내용을 Flask 게시판 + PostgreSQL로 교체), "로그인도 필요없어 빼"

## Inception

### Functional Requirements

- 글을 작성하면 저장 확인 화면에 `#saved-post` 링크를 보여 주고, 상세 화면 `#post-body`에 본문을 출력한다.
- 댓글 화면은 CSP(`script-src 'self'`)를 붙여 보여 준다.
- 모든 응답에 `X-Served-By`, `X-App-Version` 헤더를 붙이고 화면 아래에도 표시한다.
- `/healthz`는 DB 쿼리까지 확인한다.

### Non-Functional Requirements

- Python 3.12, Flask, gunicorn, psycopg 3. 이미지 하나.
- 스키마 적용은 별도 명령(`python -m app.migrate`)이며 여러 번 실행해도 같다. 모든 테이블에 기본 키를 둔다.
- SQL은 파라미터 바인딩만 쓴다. `conn.execute(...).fetchone()`처럼 실행 결과를 이어 써서 SAST가 DB 저장소 흐름을 추적하게 한다.
- 의도한 취약점은 본문·댓글 출력 두 곳뿐이다. 제목은 escape한다.

### Architecture

```text
Browser -> web (Flask + gunicorn, 화면·API 한 컨테이너) -> PostgreSQL (쓰기 DB 하나)
```

## Construction

- 진행 상태: 구현 완료, 로컬 검증 완료. 커밋·푸시 전
- 작업 브랜치: `feat/flask-board`

### 실제 검증 기록: 2026-11-04

| 위치 | 실행한 명령 또는 검증 | 결과 |
| --- | --- | --- |
| 로컬 | PostgreSQL 17 컨테이너 + `pytest` | PASS. 9개 통과 |
| 로컬 | `delta_sast scan <소스> --no-llm` (delta-network-gateway `services/delta-sast`) | 후보 2건(본문·댓글 저장형 XSS), 양호 2건(escape한 제목). 코드 흐름은 폼 입력 → `posts`/`comments` INSERT → SELECT → HTML |
| 로컬 | `docker compose up -d --build --wait`, `/healthz` | PASS. 두 컨테이너 healthy, `X-Served-By` 확인 |
| 로컬 | 브라우저로 글 작성 → 저장 확인 → 상세 → 목록 | PASS. 본문 HTML이 그대로 렌더링됨(의도한 취약점) |
| GitHub | CI | 미실행(푸시 전) |
| Cloud | 실제 배포 | 미실행 |

## Operation

- 배포: 이미지 하나를 클라우드별로 배포하고 `DATABASE_URL`은 같은 쓰기 DB를 가리킨다. `SERVED_BY`만 클라우드별로 다르게 준다.
- 관측: `/healthz`, gunicorn 접근 로그(표준 출력), `X-Served-By`
- 롤백: 이전 이미지 태그로 재배포. 스키마는 하위 호환으로만 바꾸므로 DB는 되돌리지 않는다.
