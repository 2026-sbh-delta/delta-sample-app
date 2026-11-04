# FE/BE 샘플 앱

## Ideation

- 문제: 환경별 API 주소와 포트를 코드에 넣으면 배포할 때 소스 수정과 재빌드가 필요하다.
- 사용자: 샘플 앱으로 CI/CD 및 FE와 BE 사이의 연결을 확인하는 팀원
- 성공 기준: 컴파일과 외부 패키지 설치 없이 실행하고, 환경변수만 바꿔 동일 이미지로 다른 BE에 연결한다.
- Scope: 메모 조회/추가/삭제, 연결 상태, FE/BE 서버, 환경변수 예제, Docker Compose, CI
- Non-goals: DB, 영속 저장, 로그인, 클라우드 인프라 생성 및 실제 운영 배포
- 승인: 2026-11-04 사용자 "DB는 일단 보류 FE/BE만 구현 ㄱㄱ". 제안한 FE/BE의 설계와 구현 진행을 승인했고 DB는 제외했다.
- 추가 요청: 2026-11-04 "front는 frontend에서, back은 backend에서 작업", "각각 빌드는 따로 할 수 있게". 서비스별 독립 프로젝트와 독립 빌드 컨텍스트를 적용한다.

## Inception

### Functional Requirements

- FE에서 메모를 추가하고 목록을 조회하며 개별 메모를 삭제한다.
- BE 연결 여부와 FE/BE 버전을 확인한다.
- FE는 실행 시 생성하는 공개 설정만 브라우저에 전달한다.
- FE의 서버 프록시는 환경변수로 지정한 BE에 요청을 전달한다.
- BE는 메모리에 데이터를 저장하며 프로세스마다 독립적이다.

### Non-Functional Requirements

- Node.js 24 기본 모듈과 HTML/CSS/JS만 사용하며 런타임 외부 의존성과 컴파일 단계를 두지 않는다.
- FE/BE를 독립적으로 실행하고 동일 이미지를 환경마다 재사용한다.
- 각 서비스가 자체 `package.json`, 빌드 스크립트, 라이브러리와 Dockerfile을 가진다. 서비스 폴더 밖 소스를 참조하지 않는다.
- 모바일 화면, 키보드 조작, 오류 및 로딩 상태를 제공한다.
- JSON 입력 크기와 길이를 제한하고 오류에 내부 연결 정보를 노출하지 않는다.
- 헬스체크, JSON 요청 로그, SIGTERM 종료를 제공한다.

### Architecture

```text
Browser -> FE Node.js server -> BE Node.js server -> process memory
              |
              +-- HTML / CSS / JS / runtime-config.json
```

- 브라우저의 API 경로는 FE와 같은 Origin을 사용한다.
- `API_HOST`, `API_PORT`, `API_PROTOCOL`은 FE 서버가 사용하는 BE 연결값이다.
- `API_ENDPOINT`는 FE/BE에 동일하게 설정한다. 기본값은 `/api`이다.
- `PORT`, `HOST`, `APP_ENV`, `APP_VERSION`은 서비스별로 주입한다.
- DB 관련 패키지, 환경변수, 컨테이너를 추가하지 않는다.
- `frontend/`와 `backend/`는 독립 프로젝트다. 각 폴더에서 `npm run build`로 `dist/`를 만들며, Docker 빌드 컨텍스트도 각각의 폴더다.
- 루트에는 전체 실행 편의 명령, Compose 및 서비스 사이 통합 테스트만 둔다.

### Unit of Work, Design, Implementation Plan

| Unit | 설계 및 구현 순서 | Acceptance Criteria |
| --- | --- | --- |
| BE | 환경변수 검증, HTTP API, 메모리 저장, 입력 검증, 헬스체크 및 로그 | 메모 CRUD와 오류 응답을 실제 HTTP 테스트로 확인 |
| FE | 정적 화면, 공개 런타임 설정, BE 프록시, 폼 및 목록 상호작용 | FE를 통한 CRUD, 비공개 설정 미노출, 연결 실패 표시 |
| Delivery | 서비스별 Dockerfile, Compose, 환경변수 예제, CI 및 운영 안내 | Node 테스트 실행, 변경된 환경변수로 연결 확인, Docker 검증 상태 구분 |

각 Unit은 위 사용자 승인 범위에서 구현한다. 설계, 구현, 실제 테스트 결과와 리뷰를 같은 문서에 기록한다.

## Construction

- 진행 상태: BE, FE, Delivery Unit 구현 완료
- 독립 빌드: 서비스별 소스, `package.json`, 빌드 스크립트, `dist/`, `.dockerignore`, Dockerfile 구성 완료
- 런타임 설정: FE 공개 설정은 허용한 4개 필드만 반환. API 연결값과 서비스 포트는 시작 시 환경변수에서 읽는다.
- CI: 전체 검증 및 Compose smoke test 구성. 이미지 워크플로는 FE/BE/전체 중 선택해서 빌드 및 GHCR 푸시 가능
- 리뷰: 다른 서비스 및 루트 소스 의존성 없음, 입력 제한 및 오류 응답, 공개 설정 범위, 문서 링크를 확인했다.

### 실제 검증 기록: 2026-11-04

| 위치 | 실행한 명령 또는 검증 | 결과 |
| --- | --- | --- |
| 루트 | `npm run check` | PASS. FE/BE 및 루트 실행/테스트 파일 문법 검사 |
| `frontend/` | `npm run build` | PASS. FE 전용 `dist/` 생성 |
| `backend/` | `npm run build` | PASS. BE 전용 `dist/` 생성 |
| 루트 | `npm test` | PASS. 19개 HTTP/독립 빌드 테스트, 실패 0개 |
| 루트 | 아래 Ruby YAML 파싱 명령 | PASS. Compose 및 워크플로 2개 문법 파싱. Docker 의미 검증을 뜻하지 않음 |
| 루트 | `HOST=127.0.0.1 npm run dev` 및 Chrome UI 조작 | PASS. 서비스 연결, 메모 생성, 새로고침 후 유지, 삭제 및 0개 목록 확인 |
| 루트 | Python 소스/설정 정적 검사 | PASS. 35개 파일 포맷, 로컬 문서 링크, 외부 패키지 없음 및 프로젝트 분리 확인 |
| 루트 | `docker compose config`, `docker build`, 컨테이너 실행 | 미실행. Docker CLI가 설치되지 않음 |
| GitHub | CI 및 이미지 워크플로 실행 | 미실행. 파일만 작성 |
| Cloud | 실제 배포 | 미실행 |

YAML 파싱에 실행한 명령:

```sh
ruby -e 'require "yaml"; ARGV.each { |path| YAML.parse_file(path); puts "Parsed #{path}" }' compose.yaml .github/workflows/ci.yml .github/workflows/images.yml
```

첫 HTTP 테스트는 샌드박스의 localhost 바인딩 제한으로 `listen EPERM`이 발생했다. localhost 접근을 허용한 환경에서 다시 실행해 최종 19개가 모두 통과했다. Docker 실행이나 클라우드 배포 결과로 해석하지 않는다.

독립 빌드 테스트는 각 서비스 폴더의 파일만 별도 임시 디렉터리에 복사해 빌드하고, 원본 소스 디렉터리를 삭제한 뒤 `dist/` 산출물만으로 실제 HTTP 요청을 처리하는지 확인했다. 빌드 시 환경과 다른 런타임 버전/환경값을 주입해 재빌드 없이 설정이 바뀌는 것도 확인했다.

반응형 CSS와 모바일용 레이아웃을 구현했다. 데스크톱 렌더링과 폼 조작은 확인했으며, 390px 모바일 화면의 최종 렌더 검증은 완료하지 않았다.

## Operation

- 실제 배포: 미실행
- 관측: `/healthz` 및 API 헬스체크, 요청별 JSON 로그
- 롤백: 이전 FE/BE 이미지 태그 및 환경변수로 재시작. 메모리 데이터는 복구하지 않는다.
- Runbook: 프로젝트 및 서비스별 README에 실행, 개별 빌드, 연결 진단, 이미지 배포 및 롤백 방법을 기록했다.
- 실제 배포: 미실행. 코드와 배포 설정 준비를 완료했으며 Git 게시를 진행 중이다.

### Git 게시: 2026-11-04

- 승인: 사용자 "커밋 단위 쪼개서 커밋 푸시 ㄱㄱ"
- 원격: `2026-sbh-delta/delta-sample-app`, 대상 브랜치 `main`
- 게시 전 `git ls-remote --heads origin` 결과 원격 브랜치가 비어 있음을 확인했다.
- SSH 인증에 실패해 기존 GitHub CLI의 HTTPS 인증을 사용한다. 원격 URL과 전역 Git 설정은 변경하지 않는다.
- 저장소 설정, BE, FE, 통합 검증, CI 및 배포 설정, 운영 문서로 커밋을 나눈다.
- 기존 `AGENTS.MD` 내용과 CRLF 줄바꿈은 그대로 보존했다.
- 작성한 커밋의 SSH 서명 헤더를 실제 Git 객체에서 확인했다.
- 원격 푸시 및 로컬/원격 SHA 대조: 아직 실행하지 않음
