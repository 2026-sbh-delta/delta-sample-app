# 게시판 전환과 UI 개선

기준일: 2026-11-05 (Asia/Seoul).

## 승인과 현재 상태

- 사용자 요청: 노트 앱을 게시판으로 전환한다. 게시글 생성과 조회를 제공하고 댓글은 제외하며 UI를 깔끔하고 현대적으로 정리한다.
- Ideation: 게시글 목록 -> 상세 조회 -> 글쓰기 흐름과 기존 저장/독립 빌드 유지 제안에 사용자 `진행 ㄱㄱ`으로 승인받았다.
- Inception과 아래 U1~U3 Design/Implementation Plan: 사용자 `ㄱㄱㄱ`으로 구현과 테스트를 승인받았다.
- 추가 승인 범위: 사용자가 CSP에 따라 AWS는 주황, GCP는 파랑, 온프레미스는 초록 배경을 요청했다. U2에 실행 시 테마 설정을 포함한다.
- 추가 요청: Provider를 OS에서 알 수 있는지 질문했다. Linux DMI 기반 AWS/GCP 자동 감지를 기본값으로 두고 환경변수로 재정의한다. 미감지는 온프레미스로 추정하지 않고 기본 테마로 처리한다.
- 구현: U1~U3 코드와 문서 변경 완료. 단건 조회 API, 게시판 UI, OS 감지/테마, 회귀 테스트를 추가했다.
- 자동 검증: 최종 문법 검사/FE와 BE 개별 빌드/전용 임시 PostgreSQL 포함 테스트 29개 통과, 실패와 skip 0. 아래 실제 검증 기록을 따른다.
- 브라우저: 데스크톱의 빈 목록/등록/상세/상세 새로고침과 HTML 문자열의 텍스트 표시, 뒤로/앞으로 이동의 주소/제목, CSP별 배지 확인. 390px 모바일과 등록 실패 후 최종 상태의 브라우저 검증은 도구 연결 문제로 미완료다.
- 중지 전 배포 이력: 사용자 후속 요청으로 기존 AWS/GCP의 단일 호스트 Compose에 게시판을 배포하고 재개했다. 외부 기능 검증과 실제 AWS 주황/GCP 파랑 화면을 확인했다. 자세한 식별자와 명령은 후속 Operation 기록을 따른다.
- 현재 운영: 사용자 후속 요청으로 두 클라우드 앱 Compose만 중지하고 자동 시작을 해제했다. VM/DB/이미지/설정은 유지하며 최신 상태는 마지막 중지 기록을 따른다.
- Terraform Plan/Apply/원본 작업 폴더 커밋/원격 푸시: 게시판 배포 당시 미실행이었다. 배포 버전은 별도 로컬 스냅샷 커밋이며 원격 Git 게시 완료를 뜻하지 않는다. 이후 게시 상태는 원격 저장소에서 확인한다.

## Ideation

- 문제: 현재 노트 카드와 상시 작성 폼 대신 게시글 목록과 상세 화면을 제공해야 취약점 테스트 시연에 사용할 수 있다.
- 사용자: 취약점 테스트를 진행하고 시연하는 Delta 팀과 데모 접속자.
- 성공 기준: 제목과 본문으로 글을 등록하고 최신순 목록에서 선택해 상세 내용을 조회한다. 모바일에서도 같은 흐름을 사용할 수 있다.
- Scope: 게시글 목록, 작성일, 별도 글쓰기/상세 화면, 등록 후 상세 이동, 반응형 UI. 기존 memory/PostgreSQL 저장과 FE/BE 독립 실행/빌드를 유지한다.
- Non-goals: 댓글, 회원가입/로그인, 첨부파일, 게시글 수정, 검색/페이지 나누기, 신규 DB 또는 스키마 이전, 클라우드 인프라 변경.

## Inception

### Functional Requirements

1. 기본 화면은 최신순 게시글 목록이다. 제목과 작성일을 보여 주고 제목으로 상세 화면에 진입한다. 빈 목록에는 안내와 글쓰기 동작을 제공한다.
2. 글쓰기 화면은 제목 필수 1~120자, 본문 선택 최대 2,000자를 받는다. 기존 JSON 16 KiB 및 최대 1,000개 저장 제한을 유지한다.
3. 등록 중에는 중복 제출을 막는다. 성공한 글의 상세 화면으로 이동하고 실패하면 입력값을 유지한다.
4. 상세 화면은 제목, 작성일, 본문, 목록으로 돌아가는 동작을 제공한다. 본문 줄바꿈과 긴 문자열을 읽을 수 있게 표시한다.
5. 상세 화면 주소로 직접 접속하거나 새로고침해도 같은 글을 조회한다. 존재하지 않는 글에는 안내와 목록 복귀 동작을 제공한다.
6. 브라우저 뒤로/앞으로 이동으로 목록, 글쓰기, 상세 화면을 오갈 수 있다.
7. 화면 명칭의 기본값을 `Delta Board`로 바꾸되 명시한 `APP_NAME` 환경변수가 우선한다. 기존 배포에서 APP_NAME을 따로 지정했다면 다음 배포 시 설정도 확인해야 한다.
8. 기존 연결 상태와 FE/BE 버전은 하단의 보조 정보로 제공한다. 로딩, 조회 실패, 등록 실패, 재시도 상태를 구분한다.
9. 기존 메모는 게시글로 그대로 표시한다. 삭제 UI는 게시판 흐름에 포함하지 않으며 기존 삭제 API는 호환성을 위해 유지한다.
10. FE 실행 시 CLOUD_PROVIDER 미설정/빈 값/`auto`는 Linux DMI로 AWS/GCP를 자동 감지한다. `aws|gcp|onprem|default`를 명시하면 감지보다 우선한다. 미감지 또는 DMI 접근 실패는 기본 테마를 사용한다. AWS 주황, GCP 파랑, 온프레미스 초록으로 구분하고 본문은 흰색으로 읽기 쉽게 유지한다.

### Non-Functional Requirements

- Node.js 24와 기존 HTML/CSS/JavaScript를 사용한다. UI 프레임워크, 외부 폰트, 런타임 의존성을 추가하지 않는다.
- FE와 BE는 각 서비스 폴더만으로 독립 실행/빌드/Docker 빌드할 수 있어야 한다.
- 테마는 허용한 공개 런타임 필드 `cloudProvider`로 전달하고 소스 수정이나 재빌드 없이 FE 재시작으로 바꾼다. 잘못된 CLOUD_PROVIDER 값은 FE 시작 시 거부한다.
- 기존 API 접두사 런타임 설정, FE 프록시, 헬스체크, JSON 요청 로그, PostgreSQL TLS와 최소 권한을 유지한다.
- 입력한 제목과 본문은 일반 텍스트로 표시한다. DB 조회는 매개변수 바인딩을 사용한다.
- 키보드로 목록/글쓰기/상세 이동이 가능하고 포커스가 표시되어야 한다. 화면 전환과 오류는 적절한 제목/상태 안내를 제공한다.
- 데스크톱과 390px 모바일에서 가로 넘침 없이 표시한다. 긴 제목과 본문, 빈 본문도 처리한다.
- 이전 화면의 느린 응답이 현재 화면을 덮지 않도록 화면 전환과 비동기 응답을 관리한다.

### Architecture

```text
Browser: hash route + list / write / detail views
    -> FE: existing static assets, runtime config, API proxy
    -> BE: existing collection API + new single-item GET
    -> existing memory or PostgreSQL storage
```

- 화면 주소는 `#/posts`, `#/posts/new`, `#/posts/:id`를 사용한다. 루트와 빈 hash는 목록으로 연결한다. FE 서버의 정적 경로와 ALB 라우팅을 변경할 필요가 없다.
- API와 DB의 `notes` 명칭은 호환성을 위해 유지한다. 새 posts 테이블이나 중복 API 별칭을 만들지 않는다.
- 기존 `GET /api/notes`와 `POST /api/notes`를 목록/등록에 사용한다. `/api`는 실제 API_ENDPOINT 설정을 따른다.
- `GET /api/notes/:id`를 추가하고 `{ note: { id, title, content, createdAt } }`를 반환한다.
- 없는 ID와 잘못된 형식은 기존 `NOTE_NOT_FOUND` 코드로 404를 반환한다. PostgreSQL 장애는 기존 `STORAGE_UNAVAILABLE` 503으로 처리한다.
- 저장 인터페이스에 `get(id)`를 추가한다. memory는 Map 조회, PostgreSQL은 UUID 형식 확인 후 `WHERE id = $1` 단건 조회를 사용한다.
- 기존 스키마, 계정 권한, 목록/생성/삭제 API 응답은 유지한다. 오류의 사용자 안내 문구는 게시글 용어로 정리한다.

### Unit of Work

| Unit | 작업 | Acceptance Criteria |
| --- | --- | --- |
| U1 | 단건 조회 API와 저장 어댑터 | memory/PostgreSQL 단건 조회, 없는 ID 404, 기존 CRUD와 API_ENDPOINT 회귀 확인 |
| U2 | 게시판 화면과 기본 명칭, CSP 테마 | 목록/글쓰기/상세, 직접 접속/새로고침/뒤로 가기, 등록 후 상세 이동, 모바일/키보드 사용, AWS/GCP/온프레미스 색상 |
| U3 | 통합 검증과 운영 문서 | 문법 검사/개별 빌드/HTTP 회귀 실행, 가능한 DB 및 브라우저 검증, 실제 실행 결과와 한계 기록 |

### Acceptance Criteria

- 목록 -> 글쓰기 -> 등록 -> 상세 -> 목록 흐름이 실제 FE 프록시를 통해 동작한다.
- 작성한 글은 상세 주소 새로고침과 직접 접속으로 다시 읽을 수 있다.
- 기존 글과 PostgreSQL 저장을 유지하며 DB 스키마 변경 없이 단건 조회한다.
- 없는 글, API 장애, 빈 목록, 입력 오류를 사용자가 구분하고 복귀/재시도할 수 있다.
- 제목/본문의 HTML처럼 보이는 문자열을 텍스트로 표시한다.
- 기본 memory 모드 회귀와 FE/BE 독립 빌드를 실제 실행한다. DB/브라우저 검증은 실행 여부와 결과를 따로 기록한다.

## Construction

### U1: 단건 조회 API

- Design: `storage.get(id)`와 기존 단건 경로의 GET 분기를 추가한다. 기존 DELETE는 유지하고 단건 경로의 Allow를 GET/DELETE로 확장한다.
- Implementation Plan: memory/PG 어댑터에 get 추가 -> 서버 단건 GET와 404 처리 -> 프록시/변경 API_ENDPOINT/없는 ID HTTP 테스트 -> 실제 DB 조회 검증.
- Approval: 2026-11-05 사용자 `ㄱㄱㄱ`으로 구현과 테스트 승인.
- Implementation: memory/PG get과 단건 GET을 구현했다. 기존 목록/등록/삭제 API와 PG 스키마를 유지했다.
- Test: 실제 HTTP/독립 산출물/PG 단건 조회, 없는 ID, API 접두사 변경, 재시작 보존, DB 장애 503을 아래 최종 실행에서 확인했다.
- Review: SQL 매개변수 바인딩, 기존 권한으로 조회, 응답의 기존 note 구조와 내부 정보 미노출을 확인했다.

### U2: 게시판 UI

- Design: 기본 회색 배경 위에 흰색 목록/본문 영역, 짙은 글자, CSP에 따른 주요 버튼을 사용한다. AWS는 주황, GCP는 파랑, 온프레미스는 초록으로 배경/강조색을 구분한다. 넓은 여백과 얇은 경계선으로 목록을 정리한다.
- 목록: 상단에 게시판 이름과 글쓰기 버튼, 본문에 제목/작성일 중심의 행 목록, 빈 상태와 새로고침을 제공한다. 모바일에서는 작성일을 제목 아래에 배치한다.
- 글쓰기: 독립된 단일 열 폼에 제목/본문, 글자 수, 등록/취소 동작을 제공한다. 등록 실패 시 내용을 보존하고 처리 중에는 상태를 표시한다.
- 상세: 목록으로 돌아가기, 큰 제목, 작성일, 읽기 편한 본문 영역을 제공한다. 생성 시각 외에 작성자/조회 수 등의 가상 데이터는 표시하지 않는다.
- 테마: CSS 사용자 정의 속성과 `data-cloud-provider`로 배경/강조색을 선택한다. FE 공개 설정에 검증한 cloudProvider만 추가한다. Linux DMI의 제조사/제품명/EC2 장비 태그만 시작 시 읽고 원본 정보는 공개하지 않는다. 네트워크 metadata 접근이나 추가 패키지는 사용하지 않는다. DMI는 테마용 단서이며 인증된 인스턴스 식별을 뜻하지 않는다.
- Implementation Plan: index/CSS 재구성 -> hash 라우팅과 목록/상세 조회 -> 등록과 오류/재시도 -> 기본 APP_NAME/CLOUD_PROVIDER/환경변수 예제/Compose 정리 -> 데스크톱/모바일/키보드와 CSP 테마 검증.
- Approval: 2026-11-05 사용자 `ㄱㄱㄱ` 및 AWS/GCP/온프레미스 테마 요청으로 구현과 테스트 승인.
- Implementation: 목록/글쓰기/상세 hash 라우팅, 등록 후 상세 이동, 새로고침/재시도, 일반 텍스트 표시, 입력 보존, 중복 제출 방지, 화면 전환 시 요청 취소/응답 순서 제어를 구현했다. 공개 설정에 cloudProvider만 추가하고 테마와 기본 명칭을 적용했다.
- Test: CSP별 동일 정적 산출물과 공개 설정, DMI 값/읽기 실패/명시 설정 우선순위/비Linux 기본 테마를 테스트했다. 브라우저로 확인한 범위와 미완료 범위는 아래 기록을 따른다.
- Review: 허용한 설정값만 공개하고 원본 DMI 값/인스턴스 ID를 노출하지 않는다. 외부 UI 의존성/폰트/metadata 네트워크 접근은 추가하지 않았다. 사용자 제목/본문은 textContent로 표시하며 이전 화면의 조회 응답과 등록 결과 알림이 다른 화면을 덮지 않게 했다.

### U3: 통합 검증과 문서

- Design: 기존 HTTP/독립 빌드/PG 통합 검증을 확장하고 이번 실행 결과만 기록한다. 테스트를 실행하지 못한 환경은 그 이유를 남긴다.
- Implementation Plan: 단건 API와 독립 산출물 검증 확장 -> `npm run check` -> `npm run build:fe`와 `npm run build:be` -> `npm test` -> 가능한 전용 로컬 PostgreSQL/브라우저 검증 -> README/서비스 README/AI-DLC 상태 갱신과 diff 리뷰.
- Approval: 2026-11-05 사용자 `ㄱㄱㄱ`으로 구현과 테스트 승인.
- Implementation: 기존 HTTP/독립 빌드/PG 테스트 확장, 환경변수 예제/Compose와 프로젝트/서비스 README, AI-DLC 상태 갱신 완료.
- Test: 최종 문법 검사, 개별 빌드, 실제 PG/TLS 포함 29개 테스트를 실행했다. Docker는 미설치로 로컬 실행하지 않았고 원격 CI는 미실행이다.
- Review: FE/BE의 상위 소스 의존성 없음, 신규 런타임 패키지 없음, 기존 PG 데이터/스키마 유지, 문서 링크와 검증 상태 구분을 확인했다. 미완료 브라우저 검증을 통과로 표시하지 않았다.

## Operation

- Deployment 승인: 사용자 `aws, gcp에 compose 올려서 보여줘` 요청으로 기존 두 Compose 호스트의 새 게시판 배포와 재개를 승인받았다. 신규 인프라 생성이나 DB 초기화 없이 기존 운영 Compose와 DB를 사용한다.
- Deployment 검증 당시: AWS 계정616723161368의 기존 i-0637ad326681c7480과 GCP term2-delta의 delta-board-gcp-frontend를 유지해 새 버전을 배포했다. 두 delta-compose가 active/enabled이며 실제 공개 설정의 cloudProvider가 각각 aws/gcp다. 원본 앱 작업 트리를 보존한 별도 로컬 배포 스냅샷을 사용했다.
- Deployment 설정: 새 단건 조회 API를 제공하는 BE를 먼저 준비한 뒤 FE를 의존성에 따라 기동한다. 기존 배포 Compose의 APP_NAME을 Delta Board, CLOUD_PROVIDER를 auto로 맞춘다. 실제 컨테이너의 감지 결과와 외부 API를 검증한다.
- Observability: 기존 health와 X-Request-Id JSON 로그를 사용한다. 작성한 제목/본문을 로그에 추가하지 않는다.
- Rollback: FE -> BE 순서로 이전 산출물과 환경변수에 복귀한다. DB 스키마 변경이 없어 기존 데이터를 이전하지 않는다. 실제 rollback은 미실행이다.
- Runbook: 프로젝트/서비스 README에 게시판 사용법, 단건 API, APP_NAME/CLOUD_PROVIDER, 자동 감지의 조건과 실패 시 기본값을 기록했다. 테마 변경은 같은 산출물에 환경변수를 바꾸고 FE를 재시작한다.

## 검증 기록

| 날짜 | 명령 또는 확인 | 결과 |
| --- | --- | --- |
| 2026-11-05 | `git status --short --branch` | 문서 작성 전 main 작업 트리의 변경 없음. 원격 최신 여부는 조회하지 않음 |
| 2026-11-05 | 관련 docs/README와 AI-DLC, 서버/저장소/화면/테스트 소스 조회 | 현재 notes 목록/등록/삭제, memory/PG 저장, 해시 없는 단일 화면 구조 확인 |
| 2026-11-05 | 문법 검사/빌드/테스트/브라우저/실제 DB | 미실행. 상세 설계와 구현 계획의 승인 전 단계 |

### 구현 후 실제 검증: 2026-11-05

| 명령 또는 확인 | 결과 |
| --- | --- |
| `npm run check` | 최종 실행 종료 0. FE/BE와 루트 실행/테스트 문법 검사 |
| `npm run build:fe` / `npm run build:be` | 최종 실행 각각 종료 0. 독립 dist 생성 |
| 최초 `npm test` | localhost listen EPERM으로 HTTP/독립 실행 검증 중단. 테스트 통과로 취급하지 않음 |
| `python3 artifacts/board-qa/postgres-check.py` | localhost 접근 허용 환경에서 전용 임시 PostgreSQL 18.6, localhost CA와 SSL을 준비해 아래 npm test 실행. 최종 종료 0. DB 종료와 임시 디렉터리 제거 완료 |
| `PG_INTEGRATION=1 PGHOST=127.0.0.1 PGPORT=<임시 포트> PGDATABASE=delta_board_test PGUSER=postgres PGPASSWORD=<전용 로컬 테스트값> PGTLS_TEST_CERT=<임시 CA> npm test` | 최종 29개 통과, 실패/skip 0. 단건 조회 포함 기존 회귀, API_ENDPOINT/공개 설정, 테마와 DMI 감지 fixture, 독립 산출물, 실제 PG 단건/생성/삭제/BE 프로세스 재시작/동시 제한/최소 권한/DB 장애/실제 TLS와 호스트 검증 |
| `python3` 정적 검사 (HTMLParser, ElementTree, 정규식, 상대 휘도 계산) | HTML id 44개 중복 없음, JS 참조 43개 대상 존재, SVG와 로컬 문서 링크 확인. 기본/AWS/GCP/온프레미스 주요 버튼의 흰색 글자 대비 각각 7.42/5.66/6.23/5.84:1 |
| `git diff --check` | 종료 0 |
| `ruby -e 'require "yaml"; YAML.parse_file(ARGV.fetch(0)); puts "Compose YAML parsed"' compose.yaml` | 종료 0. CLOUD_PROVIDER를 추가한 Compose YAML 파싱 확인. Docker 의미 검증이나 컨테이너 실행을 뜻하지 않음 |
| `node artifacts/board-qa/serve.mjs`와 Chrome native UI 조작 | 데스크톱에서 빈 목록, 글쓰기, 등록 후 상세 이동, 직접 상세 주소 새로고침, 본문 HTML 문자열의 일반 텍스트 표시 확인. 뒤로/앞으로 이동에 따른 주소와 페이지 제목 확인. AWS/GCP/ON-PREMISES 배지 확인. 검증 서버 종료 완료 |
| 390px 모바일/나머지 테마 최종 캡처/등록 실패 후 UI | 미완료. browser access host unavailable, ScreenCaptureKit -3811, native UI timeout이 발생했다. 등록 중 상태와 입력은 관찰했으나 최종 오류 상태는 관찰하지 못했으며 입력 보존 검증 통과로 표시하지 않음 |
| 실제 EC2/GCE의 DMI 자동 감지 | 미실행. 로컬 테스트는 주입한 Linux DMI fixture와 읽기 실패/권한 거부 경로를 검증했으며 실제 클라우드에서의 감지 완료를 뜻하지 않음 |
| 로컬 Docker / 원격 CI / 실제 AWS 배포 / 커밋 / 푸시 | 이번 변경은 미실행. Docker CLI 미설치 |

### Git 게시 전 재검증: 2026-11-05 KST

| 명령 | 결과 |
| --- | --- |
| `npm run check` | 종료 0 |
| `npm run build:fe` / `npm run build:be` | 각각 종료 0 |
| `python3 artifacts/board-qa/postgres-check.py` | 전용 임시 PostgreSQL과 TLS를 사용한 `npm test` 종료 0. 29개 통과, 실패/skip 0. DB 종료와 임시 디렉터리 제거 완료 |
| `git ls-remote --heads origin main` | 게시 전 원격 main은 로컬 기준 `fd9a661`과 일치 |

최초 실패는 localhost 바인딩 권한 제한이었다. localhost 접근을 허용한 환경에서 실제 DB를 포함해 다시 실행한 결과만 최종 통과로 기록했다. 마지막 UI 응답 순서 처리 수정 후 문법 검사/개별 빌드/29개 테스트를 재실행했다. 수동 UI 관찰은 해당 알림 처리 수정 전이며 새 코드의 브라우저 최종 검증을 의미하지 않는다.

초기 로컬 검증에서 남았던 실제 클라우드 DMI 감지와 배포는 아래 후속 Operation에서 확인했다. 390px 모바일 레이아웃과 등록 실패/입력 보존/재시도의 최종 UI는 미완료 범위를 유지한다. 실제 배포 완료를 원격 Git/CI와 전체 브라우저 검증 완료로 해석하지 않는다. 로컬 검증 스크립트와 로그는 Git에서 제외한 artifacts/board-qa에 남긴다.

### 후속 Operation: AWS/GCP Compose 게시판 배포 (2026-11-05 KST)

- 승인: 사용자 `aws, gcp에 compose 올려서 보여줘` 지시. 기존 운영 호스트/DB를 사용하고 Terraform과 DB 초기화는 실행하지 않았다.
- 접속: [AWS](http://delta-lab-notes-alb-1242820262.ap-northeast-2.elb.amazonaws.com/#/posts), [GCP](http://34.64.134.28/#/posts). 기존 HTTP ALB 주소를 유지했다.
- 소스: 원본 HEAD fd9a661fdef4d24c5ae7d969677a1daa0c229e88과 미커밋 변경을 보존했다. 서비스 파일27개의 SHA-256을 대조한 배포 전용 clean 스냅샷의 로컬 커밋은 547265cbb0ce5cfdb0816716cb3334adfbfbdef5다. 이 커밋은 원격에 게시하지 않았다. 운영 manifest의 source_dirty=false는 해당 스냅샷 저장소의 상태다.
- AWS: 기존 i-0637ad326681c7480/10.10.1.211에서 frontend/backend healthy. 일반 Dockerfile로 개별 amd64 이미지를 빌드했다. bundle SHA-256은 14fdf13ef70416a8157a61bbb3dcae3a65f953b333d91e2d639b1f9e68bb8116이다.
- GCP: 기존 delta-board-gcp-frontend/ID5224499913819284415/10.32.1.20에서 frontend/backend healthy와 Proxy running. 기존 방식대로 검증한 Node x64 산출물을 offline 이미지로 import했으며 일반 Dockerfile 빌드와 같은 이미지라고 주장하지 않는다. bundle SHA-256은 80b9db817755a94ca63f2675a655c5ef3c4a2a9b9595810ab3519ba7aea52561이다.
- 배포 설정: 인프라 저장소의 AWS Compose와 GCP host 생성 설정에 APP_NAME=Delta Board/CLOUD_PROVIDER=auto를 반영했다. 실제 컨테이너 환경에서 각각 aws/gcp 감지와 동일한 공개 정적 파일 해시를 확인했다.
- 기존 데이터: DB를 재초기화하지 않았다. 외부 검증 전 게시글은 각0개였으며 생성한 검증 글만 삭제한 뒤 각각0개임을 확인했다. DB 스키마/네트워크/VM 생성 또는 삭제는 이 작업에서 실행하지 않았다.
- 복귀 준비: AWS 배포 도구의 이전 릴리스 포인터와 이미지 보존 절차를 사용한다. GCP 이전 host/config/images/compose/unit 파일은 /opt/delta-compose/backups/board-547265cbb0ce에 보관했다. 실제 rollback은 실행하지 않았다.

| 명령 또는 확인 | 실제 결과 |
| --- | --- |
| `python3 artifacts/cloud-deploy/preflight.py aws` / `gcp` | 대상 계정/프로젝트, 기존 호스트, Docker/Compose, 디스크 여유와 초기 inactive/disabled 상태 확인. host DMI는 Amazon EC2/Google Compute Engine |
| `python3 -m unittest discover -s deploy/workload/tests -v` | AWS 배포 도구14개 통과 |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s deploy/workload-gcp -p 'test_*.py' -v` | GCP 배포 도구5개 통과 |
| `python3 artifacts/cloud-deploy/snapshot.py` | 원본 작업 트리 변경 없이27개 서비스 파일 대조, 별도 로컬 clean 스냅샷 생성 |
| `deploy/workload/compose.py --inventory <조회한 AWS application> deploy --sample-root <로컬 스냅샷> --output <검증 폴더>` | 종료0. AWS 두 이미지 빌드/배포와 Compose 재개 |
| `python3 artifacts/cloud-deploy/gcp-deploy.py` | 이전 설정 백업과 FE/BE 산출물 및 bundle 준비 성공. 최초 publish는 gcloud ADC 토큰 조회45초 timeout으로 업로드 전 중단 |
| `python3 artifacts/cloud-deploy/gcp-resume.py` | 토큰 재조회 후 프로세스 메모리에서 재사용. 같은 bundle의 GCS 게시/prepare/activate 모두 종료0. 새 IAM 권한 부여나 VM/SQL 변경 없음 |
| `python3 artifacts/cloud-deploy/verify-http.py aws` / `gcp` | 양쪽 공개 runtime config/health200, FE/BE 버전 일치, cloudProvider aws/gcp, storage=postgres. 생성201/목록/단건 조회200/없는 글404/자체 검증 글 삭제204 및 삭제 후404, 정적 파일4개 SHA-256 대조 성공 |
| 두 인프라 `compose.py status` | AWS FE/BE healthy, GCP FE/BE healthy와 Proxy running |
| `python3 artifacts/cloud-deploy/preflight.py aws --stage after` / `gcp --stage after` | 같은 VM ID와 주소 보존, 두 delta-compose active/enabled, Cloud SQL RUNNABLE 확인 |
| Chrome에서 두 공개 URL을 새 탭으로 열고 AX/화면 캡처 | AWS 주황/GCP 파랑 배경과 배지, 게시판, 서비스 정상 연결과 같은 FE/BE 버전 확인 |

배포/검증 결과와 소스/이미지 식별자는 ignored artifacts/cloud-deploy에 보관한다. 원본 앱과 인프라 저장소의 기존 다른 작업은 보존하며, 이 배포에서 Git 푸시나 Terraform Plan/Apply는 실행하지 않았다.

자동 감지 설계 참고: [AWS EC2 식별](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/identify_ec2_instances.html), [GCP OS 기반 감지](https://docs.cloud.google.com/compute/docs/instances/detect-compute-engine). 2026-11-05 공식 문서 확인.


## 후속 Operation: 게시판 Compose만 중지 (2026-11-05 KST)

- 승인: 사용자 `이제 compose만 내려도 돼`. 두 클라우드의 앱 Compose만 중지하고 자동 시작을 해제했다.
- AWS (2026-11-05T23:13:47.231621+09:00): 앱 컨테이너2개를 내리고 프로젝트 컨테이너/네트워크 잔여0개, delta-compose inactive/disabled를 확인했다. VM running, DB available, 디스크/DB 식별자 동일과 호스트 이미지9개/설정 해시 보존을 확인했다. 공개 API는 HTTP502다.
- GCP (2026-11-05T23:14:38.311275+09:00): 앱 컨테이너3개를 내리고 프로젝트 컨테이너/네트워크 잔여0개, delta-compose inactive/disabled를 확인했다. VM RUNNING, DB RUNNABLE, 디스크/DB 식별자 동일과 호스트 이미지9개/설정 해시 보존을 확인했다. 공개 API는 HTTP503다.

| 날짜 | 명령 또는 확인 | 결과 |
| --- | --- | --- |
| 2026-11-05 KST | `python3 artifacts/cloud-stop/stop-compose.py aws` | 종료0. AWS FE/BE2개 중지와 보존 검증 |
| 2026-11-05 KST | `python3 artifacts/cloud-stop/stop-compose.py gcp` | 종료0. GCP FE/BE/Proxy3개 중지와 보존 검증 |
| 2026-11-05 KST | 양쪽 `systemctl disable --now delta-compose` 및 대상 프로젝트의 `docker compose down` | inactive/disabled와 프로젝트 컨테이너/네트워크0개 |
| 2026-11-05 KST | Docker 이미지 ID 집합/설정 SHA-256, VM/디스크/DB ID 재조회 | 이미지와 설정 및 기존 VM/DB 보존. Docker daemon과 다른 컨테이너는 유지 |

중지 명령에는 volumes/image 삭제나 prune을 포함하지 않았다. Terraform Plan/Apply, DB 초기화/데이터 변경, VM/DB 중지/삭제, Git 커밋/푸시는 실행하지 않았다. 다시 실행할 때는 각 호스트에서 `sudo systemctl enable --now delta-compose`를 사용한다. 이번 작업에서는 재개하지 않았으며 상세 결과는 ignored artifacts/cloud-stop에 보관했다.
