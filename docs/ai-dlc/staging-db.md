# 스테이징 DB 일관성

## Ideation

- 문제: 로컬 Compose는 PostgreSQL 17, GCP 스테이징 Cloud SQL은 16이었다. 스테이징 데이터 초기화 코드는 앱 저장소가 아니라 인프라(Terraform Job의 인라인 코드)에 있었고, 운영 DB에 잘못 붙어도 막는 장치가 없었다.
- 사용자: 파이프라인(SAST → 스테이징 → DAST)을 돌리는 팀, 시연을 보는 심사위원
- 성공 기준: 개발·스테이징이 같은 주요 버전과 같은 스키마·초기화 코드를 쓴다. 점검 회차마다 스테이징 데이터가 0건에서 시작한다. 운영 DB는 초기화되지 않는다.
- Scope: PostgreSQL 16 기준, 초기화 명령(`python -m app.reset`), Compose·CI 버전, 문서
- Non-goals: DB 복제·고가용성·추가 백업, 운영 DB 전환 방식(A/B) 결정, 세션 유지
- 승인: 2026-11-05 정준우 요청("스테이징 DB와 로컬 개발환경의 일관성을 맞춰줘", 방향·범위·완료 확인 항목 지정)

## Inception

### Functional Requirements

- AWS 스테이징 앱은 AWS 전용 스테이징 PostgreSQL, GCP 스테이징 앱은 GCP 전용 스테이징 PostgreSQL을 쓴다. 둘은 실시간 동기화하지 않는다.
- 스테이징 DB는 상시 유지한다. 새 점검 회차의 배포 전에 마이그레이션 → 게시글·댓글 초기화 → 남은 행 0 확인 → 앱 배포 순서로 진행한다.
- 초기화가 실패하면 배포·DAST를 하지 않는다.
- 스테이징에서는 글쓰기·댓글 등록이 된다(저장형 XSS 점검).

### Non-Functional Requirements

- 기준 버전: 확정된 운영 DB 버전이 없어 GCP 스테이징 설정(`POSTGRES_16`)을 개발·스테이징 공통 기준으로 잡았다. 운영 DB를 버전 맞추려고 올리거나 내리지 않는다.
- 클라우드별로 다른 것은 DB 주소·접속 설정·환경 식별값(`SERVED_BY`, `APP_ENV`)뿐이다. 이미지 digest, 마이그레이션, 초기화 코드는 같다.
- 초기 데이터(시드)는 두지 않는다. 초기화 뒤 0건이 계약이다.

### Architecture

```text
app/schema.sql ── app.migrate (Compose 시작 시)
              └─ app.reset   (스테이징 배포 직전, APP_ENV=staging 일 때만)
                    migrate → TRUNCATE comments, posts → 남은 행 0 확인(아니면 종료 코드 1)
```

- 운영 보호 두 겹: 운영에는 초기화 Job을 만들지 않고(스테이징 도구 설정은 staging 대상에만 초기화 Job을 허용), `app.reset`은 `APP_ENV=staging`이 아니면 종료 코드 2로 거부한다.
- 진행 중인 점검 보호: 스테이징 도구가 배포할 때 실행 ID로 점유를 잡고, 점유 중에는 다른 실행의 배포(=초기화)를 409로 거부한다(delta-network-gateway `services/delta-staging`).

## Construction

| 단위 | 상태 |
|---|---|
| `app/reset.py`, `tests/test_reset.py` | 구현, 로컬 테스트 통과 |
| `compose.yaml` `postgres:16-alpine`, 새 볼륨 `db-data-pg16` | 구현, 로컬 적용 |
| CI `postgres:16-alpine` | 구현, 원격 CI 미실행(푸시 전) |
| GCP 초기화 Job을 `python -m app.reset`으로 교체 | delta-network-gateway `terraform/staging-gcp`, Plan·Apply 전 |
| AWS 스테이징에 같은 계약 적용 | GCP 완주 뒤 진행(미착수) |

### 실제 검증 기록: 2026-11-05

- 테스트: 임시 `postgres:16-alpine`(16.15)에 `TEST_DATABASE_URL`을 주고 `pytest` → 12 passed(초기화 성공, 스테이징 아님 거부·데이터 유지, 빈 DB에서 스키마 적용 포함).
- 로컬 전환: 17 컨테이너에서 `pg_dump --data-only --column-inserts`로 덤프(`artifacts/pg17-data-20261105-124933.sql`, git 제외) → Compose를 16·새 볼륨으로 다시 올림 → 복원. 확인: 주요 버전 16, posts 1, comments 0, `/board` 200, `/healthz` ok.
- 옛 17 볼륨 `delta-sample_db-data`는 지우지 않았다.
- 커밋·푸시: 하지 않음(사용자가 수행).

## Operation

- Deployment: 스테이징 도구가 배포 이미지로 초기화 Job을 돌린 뒤 새 개정판을 띄운다.
- Rollback: 초기화가 실패하면 새 개정판을 띄우지 않으므로 이전 개정판이 그대로 남는다.
- Runbook: 남은 행이 0이 아니어서 실패하면 스테이징 DB에 다른 쓰기(다른 실행의 점검 등)가 있었는지 점유 기록부터 본다.
