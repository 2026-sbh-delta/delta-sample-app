# Delta Board

게시글을 등록하고 목록과 상세 화면에서 조회하는 게시판 샘플 앱입니다. 댓글 없이 글쓰기와 읽기에 집중하며 AWS, GCP, 온프레미스에 따라 화면 테마를 구분합니다.

- FE: HTML/CSS/JavaScript와 Node.js 정적 서버 및 API 프록시
- BE: Node.js HTTP API와 memory/PostgreSQL 저장 선택
- memory 모드는 Node.js 24만으로 실행. PostgreSQL 모드는 BE에서 `npm ci`로 의존성 설치
- 배포용 빌드는 각 프로젝트에서 별도 패키징
- FE/BE 별도 이미지, 실행 시 환경변수 주입

기본 memory 모드는 BE 재시작 시 게시글이 사라집니다. `STORAGE_BACKEND=postgres`를 지정하면 PostgreSQL에 저장해 재시작 후에도 유지합니다. 초기 배포는 BE 1개이며 로그인은 포함하지 않습니다. [DB 설정과 초기화](backend/README.md#postgresql-저장)를 확인하세요.

## 배포 주소와 현재 상태

- [AWS 게시판](http://delta-lab-notes-alb-1242820262.ap-northeast-2.elb.amazonaws.com/#/posts): 주황 테마
- [GCP 게시판](http://34.64.134.28/#/posts): 파랑 테마

2026-11-05에 기존 각 호스트의 Compose로 배포해 OS 자동 감지와 PostgreSQL 저장, 게시글 생성/상세 조회를 확인했습니다. 이후 사용자 요청으로 두 Compose를 내리고 자동 시작을 해제했습니다. 현재 앱 접속은 중지 상태이며 VM/DB/이미지/설정은 보존합니다. 배포 소스의 Git 게시 상태와 최신 운영 기록은 [게시판 기록](docs/ai-dlc/bulletin-board.md)을 확인하세요.

## 게시판 사용

1. 목록의 `글쓰기`를 누르고 제목과 본문을 입력합니다. 제목만 입력해도 등록할 수 있습니다.
2. `게시글 등록`을 누르면 등록한 글의 상세 화면으로 이동합니다.
3. `목록으로`에서 최신순 게시글을 확인하고 제목을 눌러 다시 읽습니다.

목록은 `/#/posts`, 글쓰기는 `/#/posts/new`, 상세는 `/#/posts/:id`입니다. 상세 주소 직접 접속, 새로고침, 브라우저 뒤로/앞으로 이동을 지원합니다. 등록 실패 시 작성한 입력은 유지합니다. 기존 메모는 게시글로 그대로 표시하며 댓글/수정/삭제 UI는 제공하지 않습니다. 기존 삭제 API는 유지합니다.

## FE와 BE를 각각 작업하고 빌드

| 프로젝트 | 소스와 설정 | 빌드 결과 |
| --- | --- | --- |
| [frontend](frontend/README.md) | 자체 `package.json`, 서버, `lib/`, `public/`, `.env.example`, Dockerfile | `frontend/dist/` |
| [backend](backend/README.md) | 자체 `package.json`, 서버, `lib/`, `.env.example`, Dockerfile | `backend/dist/` |

각 폴더만 따로 복사해도 실행 및 빌드할 수 있습니다. 상위 디렉터리와 다른 서비스에 대한 소스 의존성은 없습니다.

```sh
# frontend/에서
npm run build
npm run start:built
```

```sh
# backend/에서
npm run build
npm run start:built
```

루트에서는 `npm run build:fe`, `npm run build:be`로 각각 빌드할 수 있습니다. `npm run build`는 두 빌드를 순서대로 실행하는 편의 명령입니다. 빌드는 문법 검사와 배포 파일 패키징만 수행하며 `.env`를 산출물에 포함하지 않습니다.

루트에서 Docker 이미지를 개별 빌드하는 명령도 각각의 폴더만 사용합니다.

```sh
docker build -t delta-sample-frontend:demo-1 ./frontend
docker build -t delta-sample-backend:demo-1 ./backend
```

## 로컬에서 실행

기본 memory 모드는 Node.js 24만 있으면 실행하며 빌드가 필요하지 않습니다. PostgreSQL 모드는 `npm ci --prefix backend --ignore-scripts`와 별도 DB 초기화가 필요합니다.

```sh
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다. FE 기본 포트는 `3000`, BE 기본 포트는 `8080`입니다. 종료는 `Ctrl+C`입니다.

환경별로 설정을 바꾸려면 예제를 복사한 뒤 수정합니다.

```sh
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

서비스를 따로 실행할 수도 있습니다.

```sh
# 터미널 1
npm run start:be
```

```sh
# 터미널 2
npm run start:fe
```

각 명령은 해당 서비스의 `.env`를 읽습니다. 셸이나 CI/CD가 이미 주입한 환경변수가 `.env`보다 우선합니다. `.env`를 변경하면 해당 서비스를 재시작합니다. 루트 `.env`는 Docker Compose용이며 Node 실행 명령에서는 읽지 않습니다.

## Docker Compose로 실행

Docker Engine과 Compose 플러그인이 있는 환경에서 실행합니다.

```sh
cp .env.example .env
docker compose up -d --build --wait
```

FE는 <http://localhost:3000>, 직접 BE 확인은 <http://localhost:8080/healthz>입니다. Compose는 BE 포트를 호스트의 `127.0.0.1`에만 공개하고, FE는 Compose 네트워크의 `backend`에 연결합니다.

```sh
docker compose logs -f
docker compose down
```

환경변수만 변경했다면 빌드 없이 컨테이너를 재생성합니다.

```sh
docker compose up -d --no-build --wait
```

`FE_PORT`를 변경했다면 브라우저에서 변경한 포트로 접속합니다. `BE_PORT`는 Compose 내 BE 포트와 호스트 포트를 함께 변경하고, 비어 있는 `API_PORT`는 그 값을 따라갑니다.

## 환경변수

### FE

| 변수 | 기본값 | 역할 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | FE 바인딩 주소 |
| `PORT` | `3000` | FE 수신 포트 |
| `API_HOST` | `127.0.0.1` | FE 서버가 접근할 BE 호스트. 프로토콜과 포트 제외 |
| `API_PORT` | `8080` | BE 연결 포트 |
| `API_PROTOCOL` | `http` | BE 연결 프로토콜. `http` 또는 `https` |
| `API_ENDPOINT` | `/api` | API 경로 접두사. BE와 동일하게 설정 |
| `API_TIMEOUT_MS` | `5000` | BE 요청의 전체 제한 시간. 최대 `120000` |
| `APP_NAME` | `Delta Board` | 화면 이름과 브라우저 제목 |
| `CLOUD_PROVIDER` | `auto` | OS 기반 테마 감지. `aws`, `gcp`, `onprem`, `default`로 재정의 가능 |
| `APP_ENV` | `local` | 화면에 표시할 환경 이름 |
| `APP_VERSION` | `dev` | 화면에 표시할 FE 버전 |

브라우저는 `/runtime-config.json`에서 `appName`, `environment`, `version`, `apiEndpoint`, `cloudProvider`만 읽습니다. `API_HOST`와 `API_PORT`는 FE 서버 내부에서 사용하고 브라우저에 전달하지 않습니다. 브라우저에는 FE와 같은 Origin의 API 경로만 노출합니다.

```text
Browser -> FE /api/* -> http://API_HOST:API_PORT/api/* -> BE -> memory or PostgreSQL
```

API 주소나 포트를 변경해도 FE 소스 수정과 이미지 재빌드가 필요하지 않습니다. 변수는 프로세스 시작 시 읽으므로 변경 후 재시작합니다. HTTPS 리버스 프록시 앞에서 실행해도 되며, 원래 요청의 `Host` 헤더를 FE에 전달해야 합니다.

### 클라우드별 화면 테마

| CLOUD_PROVIDER | 동작 |
| --- | --- |
| 미설정, 빈 값, `auto` | Linux DMI에서 AWS/GCP를 감지하고, 식별하지 못하면 기본 회색 테마 |
| `aws` | 주황 배경과 강조색 |
| `gcp` | 파란 배경과 강조색 |
| `onprem` | 초록 배경과 강조색 |
| `default` | 자동 감지를 건너뛰고 기본 회색 테마 |

FE가 시작할 때 `/sys/class/dmi/id/`의 제조사, 제품명, EC2 장비 태그를 읽습니다. 원본 장비 정보나 인스턴스 ID는 브라우저에 전달하지 않습니다. 네트워크 metadata 서비스나 추가 패키지는 사용하지 않습니다. DMI 정보가 가려진 컨테이너와 Linux 외 OS에서는 감지되지 않을 수 있으며, 감지 실패를 온프레미스로 판단하지 않습니다. 온프레미스는 `CLOUD_PROVIDER=onprem`으로 지정합니다.

예를 들어 `frontend/.env`에 `CLOUD_PROVIDER=onprem`을 설정하고 FE를 재시작하면 초록 테마를 사용합니다. 셸/CI의 외부 환경변수는 `.env`보다 우선하며, 명시한 값은 자동 감지보다 우선합니다. 소스 수정과 재빌드 없이 같은 산출물을 재사용합니다. 허용하지 않은 값은 FE 시작 시 오류로 처리합니다. 별도로 지정한 `APP_NAME`은 계속 우선하므로 기존 배포의 `Delta Notes` 이름도 변경하려면 해당 환경변수를 갱신합니다.

자동 감지 근거는 [AWS EC2 식별 문서](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/identify_ec2_instances.html)와 [GCP OS 기반 감지 문서](https://docs.cloud.google.com/compute/docs/instances/detect-compute-engine)입니다. 장비 정보는 테마용 단서로만 사용합니다.

### BE

| 변수 | 기본값 | 역할 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | BE 바인딩 주소 |
| `PORT` | `8080` | BE 수신 포트 |
| `API_ENDPOINT` | `/api` | API 경로 접두사. FE와 동일하게 설정 |
| `APP_ENV` | `local` | 헬스체크에 표시할 환경 |
| `APP_VERSION` | `dev` | 헬스체크 및 화면에 표시할 BE 버전 |
| `CORS_ORIGINS` | 빈 값 | BE에 직접 접근하는 브라우저 Origin 허용 목록. 쉼표로 구분 |

기본 FE 프록시를 사용하면 CORS 설정이 필요하지 않습니다. BE를 브라우저에서 직접 호출할 때만 `CORS_ORIGINS=https://demo.example.com`처럼 지정합니다. `*` 대신 정확한 Origin을 사용합니다.

### Compose 전용

루트 [.env.example](.env.example)을 사용합니다.

| 변수 | 기본값 | 역할 |
| --- | --- | --- |
| `FE_PORT` | `3000` | FE 포트 |
| `BE_PORT` | `8080` | BE 포트 |
| `API_HOST` | `backend` | Compose 내부 BE 서비스명 또는 원격 BE 호스트 |
| `API_PORT` | `BE_PORT` 값 | FE가 연결할 BE 포트. 원격 BE 연결 시 별도 지정 가능 |
| `FE_IMAGE` | `delta-sample-frontend:local` | FE 이미지 이름 및 태그 |
| `BE_IMAGE` | `delta-sample-backend:local` | BE 이미지 이름 및 태그 |

`API_PROTOCOL`, `API_ENDPOINT`, `API_TIMEOUT_MS`, `APP_NAME`, `CLOUD_PROVIDER`, `APP_ENV`, `APP_VERSION`도 루트 `.env` 또는 CI/CD 환경변수로 주입합니다. 개별 컨테이너 실행 시에는 위 서비스별 변수를 직접 전달합니다.

## CI/CD에서 같은 이미지 재사용

레지스트리는 배포 환경에 맞게 선택합니다. 다음 예제는 로컬 이미지 이름이며 실제 레지스트리에는 접두사를 붙여 사용합니다.

```sh
docker build -t delta-sample-backend:demo-1 ./backend
docker build -t delta-sample-frontend:demo-1 ./frontend
```

배포 단계에서 CI/CD의 환경별 변수로 컨테이너를 시작합니다. 아래 명령은 기본 네트워크 대신 샘플 전용 네트워크를 사용합니다.

```sh
docker network create delta-demo
docker run -d --name delta-backend --network delta-demo \
  -e PORT=8080 -e API_ENDPOINT=/api \
  -e APP_ENV=local -e APP_VERSION=demo-1 \
  delta-sample-backend:demo-1
docker run -d --name delta-frontend --network delta-demo -p 3000:3000 \
  -e PORT=3000 -e API_HOST=delta-backend -e API_PORT=8080 \
  -e API_ENDPOINT=/api -e APP_ENV=local -e APP_VERSION=demo-1 \
  delta-sample-frontend:demo-1
```

`API_HOST`에는 브라우저의 주소가 아닌 **FE 서버에서 BE로 접근할 수 있는 DNS 또는 IP**를 넣습니다. Kubernetes 서비스 DNS, 내부 ALB 주소 등도 같은 방식으로 지정할 수 있습니다.

### GitHub Actions

- [CI](.github/workflows/ci.yml): push/PR/수동 실행 시 문법 검사, HTTP 통합 테스트, Compose 설정 검사, FE/BE 이미지 빌드 및 컨테이너 연결 확인
- [Build images](.github/workflows/images.yml): 수동으로 `frontend`, `backend`, `all` 중 빌드 대상을 선택하고 태그를 입력하면 테스트 후 해당 이미지를 GHCR에 푸시. 배포 설정과 환경변수는 이미지에 포함하지 않음

현재 저장소 기준 이미지 이름은 `ghcr.io/2026-sbh-delta/delta-sample-app-frontend:<tag>` 및 `ghcr.io/2026-sbh-delta/delta-sample-app-backend:<tag>`입니다. 워크플로는 실제 `github.repository` 값을 소문자로 바꿔 이미지 이름을 생성합니다. GHCR 쓰기 권한이 필요하며 새 패키지 생성 시 조직의 정책도 적용됩니다. 클라우드 배포 작업은 포함하지 않습니다.

빌드된 이미지를 Compose로 배포하려면 루트 `.env`의 `FE_IMAGE`, `BE_IMAGE`에 레지스트리 이미지와 태그를 지정한 뒤 실행합니다. 비공개 레지스트리는 먼저 로그인합니다.

```sh
docker compose pull
docker compose up -d --no-build --wait
```

### 롤백

`FE_IMAGE`, `BE_IMAGE`, `APP_VERSION`을 이전 태그로 되돌리고 필요한 연결 환경변수도 복원한 뒤 같은 명령을 실행합니다. SHA 이미지 태그를 사용하면 배포 버전을 구분하기 좋습니다. memory 모드는 BE 재시작 시 초기화됩니다. PostgreSQL 모드의 앱 롤백은 DB를 삭제하지 않으며 스키마 변경은 별도로 검토합니다.

## API 및 연결 확인

`API_ENDPOINT=/api`일 때의 경로입니다.

| 메서드 | 경로 | 기능 |
| --- | --- | --- |
| GET / HEAD | `/healthz` | 각 FE/BE 프로세스 상태 |
| GET | `/runtime-config.json` | FE 공개 설정 |
| GET | `/api/health` | BE 버전, 환경, 인스턴스, 가동 시간 |
| GET | `/api/notes` | 게시글 목록, 최신순 |
| POST | `/api/notes` | 게시글 생성. JSON `title`, 선택 `content` |
| GET | `/api/notes/:id` | 게시글 상세. JSON `note` |
| DELETE | `/api/notes/:id` | 기존 호환용 삭제 API. UI에서는 제공하지 않음 |

```sh
curl -f http://localhost:3000/healthz
curl -f http://localhost:3000/api/health
curl -f http://localhost:3000/runtime-config.json
curl -f http://localhost:3000/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"title":"첫 배포 확인","content":"FE에서 BE로 연결됐어요."}'
```

FE의 `/healthz`는 FE만 검사합니다. 실제 BE 연결은 FE의 `/api/health`로 검사합니다. `API_ENDPOINT`가 다르면 해당 경로도 바꿉니다. `502`는 BE 연결 실패, `504`는 `API_TIMEOUT_MS` 초과입니다.

게시글 제목은 1~120자, 내용은 최대 2,000자, JSON 요청은 최대 16 KiB입니다. 최대 1,000개의 게시글을 보관하며 memory는 프로세스, PostgreSQL은 공유 테이블 기준으로 제한합니다. API와 DB의 `notes` 명칭은 기존 데이터와 호환성을 위해 유지합니다.

요청 로그는 stdout에 JSON으로 출력합니다. `service`, `requestId`, `method`, `path`, `status`, `durationMs`로 연결을 추적할 수 있습니다. 프록시는 FE와 BE에 같은 `X-Request-Id`를 전달합니다. 요청 본문과 쿼리 문자열은 로그에 기록하지 않습니다. `SIGTERM` 시 진행 중인 요청을 최대 5초 기다리고 종료합니다.

## 검증

```sh
npm run check
npm test
```

HTTP 테스트는 임시 localhost 포트를 사용합니다. 게시글 생성/목록/상세/기존 삭제 API, 런타임 설정 및 API 경로 변경, 테마 설정과 OS 감지, 헬스체크, 입력 검증, CORS, 프록시 연결 실패와 제한 시간을 검증합니다. 독립 빌드 테스트는 각 프로젝트를 별도 임시 폴더에서 빌드한 뒤 소스 트리를 제거하고 산출물만으로 실행합니다. 실제 컨테이너와 클라우드에서의 결과는 이 테스트와 별도로 확인해야 합니다.

현재 설계 승인과 실제 실행한 검증은 [게시판 AI-DLC 기록](docs/ai-dlc/bulletin-board.md)에 정리합니다. 이전 FE/BE 구현은 [기존 앱 기록](docs/ai-dlc/sample-app.md), DB 저장은 [PostgreSQL 기록](docs/ai-dlc/postgresql-storage.md)을 따릅니다.

참고: [Node.js HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html), [Node.js 환경변수](https://github.com/nodejs/node/blob/main/doc/api/environment_variables.md), [Docker GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/).

## AWS EC2와 RDS 배포

`delta-network-gateway` 저장소의 `terraform/workload/`와 `deploy/workload/`에서 인프라와 개별 산출물 배포를 관리합니다. FE/BE는 x86 EC2 각 1대, DB는 RDS PostgreSQL이며 공개 ALB를 통해 FE에 접속합니다. 앱은 AWS SDK 없이 환경변수로 연결하고 secret 조회는 EC2 wrapper가 담당합니다. 현재 실제 배포 상태는 [PostgreSQL 작업 기록](docs/ai-dlc/postgresql-storage.md)을 따릅니다.

게시판 버전은 새 단건 조회 API가 필요하므로 BE -> FE 순서로 배포합니다. 롤백은 FE -> BE 순서로 이전 산출물에 복귀합니다. DB 스키마와 기존 데이터는 변경하지 않습니다. 이번 게시판 변경의 실제 배포 여부는 [게시판 기록](docs/ai-dlc/bulletin-board.md)을 확인하세요.


## 운영 전용 Compose (2026-11-06)

운영 배포 입력은 `compose.production.yaml`입니다. 개발용 `compose.yaml`의 build·memory 기본값을 운영에 사용하지 않습니다. FE3000만 공개하고 BE8080은 Compose 내부에서만 접근합니다. 두 이미지는 CI 산출물인 `ref@sha256:<64hex>`, `APP_VERSION`은 full40 commit SHA를 사용합니다. Compose의 변수 치환은 참조 형식을 검증하지 않으므로 **배포 호스트가 두 이미지의 digest 고정 형식·묶음·실행 digest를 검사해야 합니다.**

공통 파일은 `extends.file`로 `compose.production.aws.yaml` 또는 `compose.production.gcp.yaml`을 읽습니다. 세 파일을 같은 디렉터리에 배치하고 공통 파일 하나를 `-f`로 지정합니다. 별도 `LOG_DRIVER` 값 대신 `CLOUD_PROVIDER`가 로그 드라이버를 결정합니다. AWS는 `awslogs`, GCP는 `gcplogs`이며 모두 `mode=non-blocking`, 버퍼4m입니다. 로그 드라이버 생성·인증 실패는 배포 실패이고, 실행 중 전송 장애 때 중앙 수신이 확인되지 않으면 로그 연동 완료로 보고하지 않습니다.

| 배포 입력 | 계약 |
| --- | --- |
| `FE_IMAGE`, `BE_IMAGE` | 필수. CI에서 만든 digest 고정 이미지 쌍. 운영 build/import 없음 |
| `APP_VERSION` | 필수. FE·BE에 같은 full40 SHA. staging/production에서는 앱도 형식을 검사 |
| `CLOUD_PROVIDER` | 필수. 이 Compose는 `aws` 또는 `gcp` 지원 |
| `FE_IMAGE_DIGEST`, `BE_IMAGE_DIGEST` | 각각 앱의 `IMAGE_DIGEST` 진단값으로 주입. 실행 이미지의 증거를 대신하지 않음 |
| `SERVED_BY` | 선택. 미설정 시 cloudProvider 사용 |
| `BE_SECRET_FILE` | 필수. 호스트가 조회·보호한 **비밀번호 한 개의 원문 파일** 경로. env 파일이 아님 |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` | 호스트의 승인된 DB 인벤토리. 기본값은 loopback5432, `delta_notes`, `delta_notes_app` |
| `AWS_REGION`, `AWS_LOG_GROUP` | AWS 필수. 기존 `/delta/workload/…` 로그 그룹을 호스트가 검증·준비 |
| `DB_CA_FILE`, `PGTLS_SERVERNAME` | AWS CA 파일과 실제 DB endpoint 검증 이름. 기본 CA 파일 `/etc/delta-sample/rds-ca.pem` |
| `GCP_PROJECT_ID` | GCP 필수. 승인된 앱 로그 프로젝트 `term2-delta` |

BE만 `/run/secrets/db_password`를 마운트하고 기존 방식의 wrapper가 내부 `PGPASSWORD`로 읽은 뒤 서버를 exec합니다. Compose `environment`·`env_file`에는 비밀번호나 연결 문자열을 넣지 않습니다. 파일 이름의 `.env` 확장자와 관계없이 파일 내용은 비밀번호 한 개여야 합니다. 호스트는 BE 이미지의 `node` 사용자 UID1000이 읽을 수 있는 소유권과 제한된 권한을 준비해야 합니다. AWS CA는 별도의 읽기 전용 파일이며 GCP에는 RDS CA를 마운트하지 않습니다. 앱은 직접 secret 서비스에 접근하지 않습니다.

AWS는 CA·호스트 검증 TLS를 사용합니다. GCP는 기존 SQL Auth Proxy를 **BE의 네트워크 namespace에 공유**하고 `PGHOST=127.0.0.1`, `PGSSLMODE=disable`로 연결합니다. Proxy의 DB 연결 암호화와 앱 DB 사용자/비밀번호 인증은 이어집니다. 관리형 DB나 Proxy를 이 앱 Compose가 생성하지 않습니다. 배포 호스트가 기존 Proxy를 포함한 override를 생성하고 같은 Compose 프로젝트로 관리합니다. 핵심 설정은 아래와 같습니다.

```yaml
services:
  proxy:
    image: ${SQL_PROXY_IMAGE:?digest-pinned proxy image required}
    network_mode: service:backend
    depends_on:
      backend:
        condition: service_started
    command: ["--address", "127.0.0.1", "--port", "5432", "--structured-logs", "${CLOUD_SQL_CONNECTION_NAME:?}"]
```

호스트가 기존 연결의 PSC 옵션·서비스 계정·권한·재시작·로그 설정을 유지합니다. Proxy는 BE가 healthy가 되기를 기다리면 안 됩니다. BE wrapper는 loopback TCP 준비를 최대 약120초 기다린 뒤, 서버가 실제 DB18과 앱 필수 열을 확인합니다. BE를 재생성할 때 Proxy도 재생성하여 새 namespace에 연결하고, 두 서비스와 DB의 준비를 확인한 뒤 FE를 열어야 합니다. 호스트가 추가한 Proxy에도 non-blocking gcplogs를 설정합니다.

호스트의 승인된 배포 스크립트가 비밀 없는 공개 env 파일로 다음 순서의 검증을 수행합니다. GCP는 호스트가 만든 Proxy override도 `-f`로 함께 전달합니다. 이 문서 작성 중 아래 운영 명령을 실행하지 않았습니다.

```sh
docker compose --env-file /path/to/public.env -f compose.production.yaml config --quiet
docker compose --env-file /path/to/public.env -f compose.production.yaml pull
docker compose --env-file /path/to/public.env -f compose.production.yaml up -d --no-build --wait --wait-timeout 180
```

운영에는 `APP_RESET_DATABASE`를 주입하지 않습니다. 앱 시작은 migration·데이터 삭제를 수행하지 않습니다. staging/production BE는 postgres 외 저장 모드를 거부하며 실제 `SHOW server_version_num`의 메이저가18이고 앱 필수 열을 조회할 수 있어야 healthy입니다. 로컬 memory·기존 PG 통합 시험의 버전 계약은 유지합니다.

FE `/healthz`의 `version`·`commit`·`digest`·`cloudProvider`·`servedBy`는 FE 진단이고, FE `/api/health`는 BE의 같은 진단과 `storage=postgres`, 숫자 `databaseVersionNum`을 전달합니다. FE HTTP `/healthz` 자체는 기존대로 BE 장애와 독립적입니다. 운영 Compose의 FE 컨테이너 healthcheck는 두 경로를 모두 검사합니다. 호스트는 두 실행 이미지의 관측 digest와 실제 DB 응답을 별도로 검증해야 합니다.

스테이징 reset 사용법은 [BE 안내](backend/README.md), 구현·로컬 검증과 미실행 범위는 [배포 작업 기록](docs/ai-dlc/compose-delivery.md)을 따릅니다.
