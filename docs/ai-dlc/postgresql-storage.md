# PostgreSQL 저장과 AWS 배포 연계

기준일: 2026-11-05 (Asia/Seoul).

## 승인과 현재 상태

- 사용자 요청: Frontend EC2 1대, Backend EC2 1대, RDS PostgreSQL 1개로 배포한다. FE는 인터넷 공개다.
- Ideation: 사용자 `ㄱㄱ`으로 공개 ALB와 사설 FE/BE/RDS 및 DB 연동 방향 승인.
- Inception과 Unit별 Design/Implementation Plan: 후속 사용자 `승인`으로 구현/테스트 승인. 추가 요청으로 AWS 인스턴스는 x86 아키텍처 사용.
- 전체 인프라 설계: `delta-network-gateway:docs/ai-dlc/aws-sample-app.md`. 인프라/배포 도구는 해당 저장소에서 관리한다.
- 기존 원격 커밋 `e29af544...`를 기준으로 별도 작업 복제본에서 구현한다. OTel은 추가하지 않는다.
- 현재 AWS 인프라 Apply와 FE/BE 실제 배포, 외부 HTTP/BE 재시작 후 데이터 보존/TLS/IAM/로그 검증 완료. Git 게시와 원격 CI 상태는 Git 이력을 따른다.

## Ideation

- 문제: 메모리 저장은 BE 재시작 시 사라지며 요청한 RDS를 사용하지 않는다.
- 사용자: Delta 팀과 공개 데모 접속자.
- 성공 기준: API 계약을 유지하고 BE 프로세스 재시작 후에도 DB 메모가 남는다.
- Scope: 저장 어댑터, DB 설정/TLS/스키마/앱 계정 초기화, 독립 패키징, 실제 DB 검증과 운영 문서.
- Non-goals: 로그인, OTel, FE 화면 변경, 기존 memory 데이터 이전, AWS SDK와 클라우드 자원 관리.

## Inception

- Functional Requirements: memory를 기본값으로 유지하고 명시적 postgres 모드에서 PG 환경변수로 연결한다. 기존 CRUD/입력/오류 계약과 동시 메모 수 제한을 유지한다.
- Non-Functional Requirements: Node.js 24, BE 내부의 고정 pg/lockfile, SQL 매개변수 바인딩, CA/호스트 검증 TLS, 비밀값 미노출과 FE/BE 독립 빌드.
- Architecture: Browser -> ALB -> FE /api proxy -> BE -> PostgreSQL. 로컬 memory 모드는 기존 동작을 유지한다.
- Acceptance Criteria: 기존 회귀, 실제 PostgreSQL CRUD/전체 BE 프로세스 재시작 후 보존, 앱 계정의 DDL 거부, 동시 생성 제한, DB 장애 503, 독립 산출물의 production 의존성 설치/실행 확인.

## Construction

- Design: 저장 인터페이스와 memory/postgres 어댑터를 분리하고 서버 시작 시 스키마를 생성하지 않는다. 앱은 최소 DB 계정을 사용한다.
- Implementation Plan: PG 설정/어댑터, 명시적 초기화 SQL/도구, health/오류 처리, 독립 dist와 Docker/CI, 실제 PostgreSQL 및 기존 HTTP 검증 순서로 진행한다.
- Approval: 2026-11-05 위 Inception 및 전체 U1~U4 계획 승인으로 이 저장소의 U2 구현을 승인받았다.
- Implementation: 저장 어댑터, advisory lock을 사용한 count/insert 트랜잭션, 앱 최소 권한 초기화, DB-aware health와 안전한 실패, BE package/lockfile 및 CI DB 서비스 추가.
- Review: FE와 상위 소스 의존성, AWS SDK와 OTel 추가가 없다. PostgreSQL 실패 시 memory fallback을 하지 않고 DB 암호/SQL을 응답에 넣지 않는다.

## Operation

- Deployment: 인프라 저장소의 S3/커밋/해시 기반 개별 산출물 배포와 EC2 secret wrapper를 사용한다. 2026-11-05 실제 AWS 배포와 외부 검증을 완료했다.
- Observability: 기존 JSON 요청 로그와 storage를 포함한 health를 사용한다.
- Rollback: 이전 FE/BE 산출물로 복귀하며 DB를 삭제하지 않는다. 스키마 변경은 별도로 검토한다.
- Runbook: backend/README의 PG 설정과 운영자 초기화 절차, 인프라 저장소 deploy/workload 안내를 따른다.

## 검증 기록

| 날짜 | 명령 | 결과 |
| --- | --- | --- |
| 2026-11-05 | `npm run check` | 종료0, FE/BE 및 기존 실행/테스트 문법 검사 |
| 2026-11-05 | `PG_INTEGRATION=1 PGHOST=127.0.0.1 PGPORT=54341 PGDATABASE=delta_notes PGUSER=one393 PGPASSWORD=<local-test> PGTLS_TEST_CERT=<test-ca> npm test` | 전용 임시 PostgreSQL 18.6에서 27개 통과, 실패/skip 0. 기존 회귀와 DB CRUD/전체 BE 프로세스 재시작/최소 권한/동시 제한/DB 장애, 독립 production 산출물 DB 실행, 실제 TLS/잘못된 호스트 거부 포함 |
| 2026-11-05 | Docker/새 원격 CI | 미실행. 실제 RDS와 AWS 배포 결과는 아래 후속 기록을 따름 |

첫 PostgreSQL 테스트는 테스트 코드에서 CJS 모듈을 직접 가져와 Client 생성에 실패했다. BE package 기준의 모듈 해석으로 고쳐 실제 DB 포함 25개를 재실행했다. 기존 테스트 결과를 새 검증으로 재사용하지 않았다.

독립 production 산출물 검사에서 심볼릭 링크/정규화 전 경로로 실행할 때 CLI가 시작 파일을 인식하지 못하는 기존 문제를 발견했다. FE/BE의 isMain을 realpath로 판별하도록 고쳤고 전체 27개를 다시 실행했다. FE 화면과 프록시 동작은 변경하지 않았다.

## 실제 AWS 배포와 검증 (2026-11-05)

공개 URL: [Delta Notes](http://delta-lab-notes-alb-1242820262.ap-northeast-2.elb.amazonaws.com). HTTP 데모 주소이며 커스텀 도메인/HTTPS는 미구성이다. FE/BE는 사설 x86_64 t3.small 각 1대, DB는 사설 db.t3.micro PostgreSQL18.3이다.

- 인프라: 검토한 Terraform Plan Apply 종료0, 추가59개/기존 변경과 삭제0. 기존 네트워크를 유지하고 최종 Plan No changes/종료0.
- 배포: FE/BE를 독립 빌드해 전용 비공개 S3에 게시하고 systemd로 개별 설치/health 검증. 산출물은 source_dirty=true의 미커밋 스냅샷이며 기준 커밋 e29af544와 전체 SHA-256을 기록했다. 원격 게시 완료를 뜻하지 않는다.
- DB 초기화: 운영자 인증과 EIC BE SSH 터널, 실제 RDS CA/hostname 검증으로 스키마/최소 계정 준비. 앱/마스터 secret을 분리하고 비밀번호를 출력하지 않았다.
- HTTP: 공개 화면/API200, storage=postgres, 검증 메모 POST201/조회 성공. `release.py restart --service backend` 후 uptime86초에서12초로 재시작을 관찰하고 같은 메모를 확인한 뒤 그 한 건만 DELETE204로 정리했다.
- DB 보안: 앱 계정의 TLS1.3/ssl=true, superuser/createdb/createrole/스키마 CREATE=false, 필요한 SELECT/INSERT/DELETE=true를 SQL로 확인했다. 별도 비TLS 연결은 SQLSTATE28000으로 거부됐다.
- IAM/로그: FE의 앱 secret과 BE의 마스터 secret 읽기를 실제 AccessDenied로 확인했다. 동일 검증 request ID가 FE CloudWatch9건/BE7건에 수신됐다.
- 운영 한계: 첫 릴리스여서 실제 이전 버전 rollback은 미실행이다. 실패/복귀 동작은 인프라 저장소의 로컬 Python6개로 검증했다. Docker와 새 원격 CI도 미실행이다.

로컬 Python의 CA 신뢰 문제로 최초 인증서 다운로드가 실패해 OS trust store의 curl로 보완했고 실제 DB 초기화를 다시 실행해 성공했다. RDS 기본 SSL 파라미터의 적용 방식 metadata 차이는 인프라 코드를 실제 API 표현에 맞춰 정리했다. 추가 DB 재부팅 없이 평문 거부와 최종 No changes를 확인했다.

## 2026-11-05 게시 준비 검증

- 최신 원격 main `e29af544`을 기준으로 분리한 작업 영역에서 `npm ci --prefix backend --ignore-scripts --no-audit --no-fund`, `npm run check`, `npm run build`를 실제 실행했다. 모두 종료0이다.
- 임시 PostgreSQL 18과 localhost 전용 CA를 준비하고 `PG_INTEGRATION=1 ... PGTLS_TEST_CERT=<test-ca> npm test`를 다시 실행했다. 27개 통과, 실패/skip0이며 테스트 DB는 종료하고 제거했다.
- 배포된 기존 S3용 FE/BE tar.gz의 SHA-256을 확인하고 각 파일을 게시 후보의 독립 dist와 바이트 단위로 비교했다. FE7개/BE6개 파일이 모두 일치했다. 운영 manifest는 배포 당시 `source_dirty=true`인 이력을 유지하며 그 자체가 당시 커밋 빌드였음을 뜻하지 않는다.
- Docker와 새 원격 CI 실행 결과는 별도로 확인한다.

### 2026-11-05 원격 CI 후속

- 최초 게시 커밋의 [CI 42016064978](https://github.com/2026-sbh-delta/delta-sample-app/actions/runs/42016064978)은 Node 문법/독립 빌드와 PostgreSQL 통합 테스트 26개를 통과했고 로컬 CA가 필요한 TLS 테스트 1개는 건너뛰었다. Docker 빌드 단계는 실패했다.
- 원인: Backend `.dockerignore`의 기본 전체 제외 규칙에 신규 `package-lock.json` 허용이 빠져 Dockerfile의 COPY가 실패했다. 해당 파일만 추가 허용했다. PostgreSQL 의존성의 잠금 파일과 독립 Docker build context는 유지한다.
- 새 CI의 실제 실행과 결과는 해당 수정 커밋의 GitHub Actions 상태를 따른다. 로컬 환경에는 Docker가 없어 Docker 빌드는 로컬에서 실행하지 않았다.

- 게시 후보의 기능 커밋 `82908b67c1bde7bd4fa695c0c61b198a2451051d`에서 생성한 FE/BE dist 파일 내용이 기존 운영 산출물과 각각 7개/6개 모두 동일하다. 실제 운영 manifest의 기준 커밋과 source_dirty 값은 이전 배포 당시 기록을 유지한다.
