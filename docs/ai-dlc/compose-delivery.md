# 운영 Compose·스테이징 reset 구현 기록

2026-11-06 KST · trace `compose-delivery-20261106` · `tdd mode=IMPLEMENTATION_ONLY`, `pre_gate=REVISED`.

## 승인·범위

사용자가 승인한 [배포 도구 명세 v1](../../../자료/배포도구_명세_v1.md)과 이번 독립 implementation 지시를 기준으로 구현했다. 지정한 `delta-sample-app-compose` detached worktree의 기준은 `0a028eb04b193078d023d4db253eb11660e595d8`이다. 원본 앱 checkout·공개 `frontend/public/app.js`·테스트를 수정하지 않았다. 다른 에이전트·스킬·Claude 호출 없이 구현했다.

## 구현

- `resetDatabase({ env, createClient })`: staging·postgres·DB 이름 allowlist를 연결 생성 전에 검증. 실제 연결 DB와 PG18 확인 후 앱 스키마 migration → 앱 테이블만 identity 초기화 → 같은 트랜잭션에서0행 → commit. 실패/잔존 행은 rollback, 안전한 JSON과 nonzero CLI 종료.
- BE storage health: 실제 SHOW 응답을 숫자로 반환하고 앱 필수 열 조회. staging/production에서는 postgres·PG18만 허용하고 서버 시작 시 DDL/reset은 실행하지 않음. 기존 local memory와 로컬 PG 버전 계약 보존.
- FE/BE health: 기존 version을 유지하고 commit·digest·cloudProvider·servedBy 진단 추가. 배포 환경은 full40 SHA 요구. FE HTTP health의 기존 독립성을 유지하며 운영 FE 컨테이너 healthcheck는 BE까지 확인.
- BE build/Dockerfile: scripts·migrations를 dist에 포함하고 Docker build context에 migration 허용. Docker는 `--require-migrations` 사용. migration 없는 기존 독립 memory 빌드는 유지하고 reset 불가를 출력.
- 운영 Compose: build 없는 FE/BE 이미지 쌍, 외부 FE3000·비공개 BE, BE만 비밀번호 파일, 운영 reset 설정 없음. AWS TLS/CA·awslogs와 GCP loopback Proxy·gcplogs를 분리하고 non-blocking 사용.
- 공통 파일의 동적 `extends.file`로 클라우드 companion을 선택하므로 서로 호환되지 않는 logging options가 섞이지 않음. 배포 호스트는 세 Compose 파일을 같은 디렉터리에 함께 배치해야 함.

## 로컬 RED → GREEN

Node binary: `/Users/joonwoojung/.nvm/versions/node/v24.13.0/bin/node`.

```sh
export PATH=/Users/joonwoojung/.nvm/versions/node/v24.13.0/bin:$PATH
node --test test/*.test.mjs
npm run check
npm run build
npm --prefix backend run build -- --require-migrations
sh -n backend/scripts/backend-entrypoint.sh
git diff --check
```

| 검증 | 실제 결과 |
| --- | --- |
| 변경 전 RED | 53개 중 기존22 통과, 신규30 실패, 기존 실제 DB 통합1 skip |
| 최종 GREEN | 53개 중52 통과, 실패0, 기존 실제 DB 통합1 skip |
| 신규 시험 | health7·reset19·Compose4, 합계30 통과 |
| 기존 회귀 | 기존22개 통과 보존 |
| check/build/strict BE build/shell 문법 | 각각 종료0 |
| AWS/GCP Compose config | Docker Compose v5.4.0으로 두 파일 선택 경로 렌더링 통과. BE 비공개·FE 공개·파일 secret·non-blocking·클라우드별 옵션 분리 확인 |
| GCP 전송 설정 | loopback5432·PGSSLMODE disable·RDS CA 미마운트 확인 |
| AWS 전송 설정 | verify-full·읽기 전용 CA 확인 |
| 보호 파일 | 테스트9개 파일과 공개 app.js, 합계10개 SHA-256가 구현 전후 동일 |

최초 구현에서 migration 없는 기존 memory 독립 빌드 시험이 실패했다. 테스트를 수정하지 않고 일반 빌드의 기존 계약을 유지하고 실제 Docker 빌드를 strict로 분리한 뒤 전체 시험을 다시 실행했다.

로그는 로컬 `/tmp/tracecompose-delivery-20261106-{red,final,check,build,strict-build}.log`에 남겼다. 주입한 pg double과 Compose config는 실제 DB·컨테이너·클라우드 실행 증거가 아니다.

## production 변경 파일

| 범위 | 파일 |
| --- | --- |
| reset·secret wrapper | `backend/scripts/reset-db.mjs`, `backend/scripts/backend-entrypoint.sh` |
| BE 설정·헬스 | `backend/lib/config.mjs`, `backend/lib/storage.mjs`, `backend/server.mjs` |
| BE 산출물 | `backend/scripts/build.mjs`, `backend/package.json`, `backend/Dockerfile`, `backend/.dockerignore` |
| FE 설정·헬스 | `frontend/lib/config.mjs`, `frontend/server.mjs` |
| 운영 Compose | `compose.production.yaml`, `compose.production.aws.yaml`, `compose.production.gcp.yaml` |
| 운영·검증 문서 | `README.md`, `backend/README.md`, `frontend/README.md`, `docs/README.md`, 본 기록 |

## 인계·미실행 범위

새 실제 PostgreSQL 통합과 PG16/PG18 실측은 메인 담당이다. 이 구현 작업에서는 PG_INTEGRATION 설정을 주입하지 않아 기존 실제 DB 통합1개를 건너뛰었다. 테스트가 통과했다는 이유로 새 실제 DB 확인을 완료했다고 주장하지 않는다.

배포 호스트는 digest 고정 참조 형식과 묶음·실행 이미지 관측을 검증해야 한다. Compose 자체의 변수 치환은 이미지 참조 정규식을 검증하지 않는다. `FE_IMAGE_DIGEST`·`BE_IMAGE_DIGEST`는 진단 환경값일 뿐 실행 증거가 아니다.

호스트가 비밀번호 한 개 파일의 조회·UID1000 읽기 권한을 준비한다. GCP는 기존 SQL Proxy를 BE의 namespace에 연결하고 앱 DB 인증을 유지한다. Proxy 생성·재생성·로그·권한·PSC 설정은 호스트 담당이다. BE wrapper는 loopback 준비를 제한된 시간 기다리고 서버가 실제 DB 버전/스키마를 확인한다. 이전 DAST 종료·진행 쓰기 drain·교체 후 최종 행0 확인은 스테이징 도구가 책임진다.

Docker 이미지 빌드, 새 DB 통합, 클라우드 조회/변경/배포, Terraform Plan/Apply, commit/push/PR은 실행하지 않았다. 실제 배포·중앙 로그 수신·운영 readiness와 데이터 보존은 이 로컬 결과로 대체하지 않는다.
