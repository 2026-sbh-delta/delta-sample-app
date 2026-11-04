# Delta Notes

FE/BE 연결과 CI/CD를 확인하는 메모 샘플 앱입니다. 메모 조회/추가/삭제와 서비스 연결 상태를 제공합니다.

- FE: HTML/CSS/JavaScript와 Node.js 정적 서버 및 API 프록시
- BE: Node.js HTTP API, 기본 메모리 저장 또는 선택 PostgreSQL 저장
- 각 폴더에서 npm ci로 고정 의존성 설치. OTel·PostgreSQL은 환경변수로 활성화
- FE/BE 별도 이미지, 실행 시 환경변수 주입

기본 메모리 모드의 메모는 BE 재시작 시 사라집니다. 여러 BE 인스턴스 사이에 공유되지 않으므로 이 샘플은 BE 1개로 실행합니다. 로그인은 포함하지 않습니다.

## FE와 BE를 각각 작업하고 빌드

| 프로젝트 | 소스와 설정 | 빌드 결과 |
| --- | --- | --- |
| [frontend](frontend/README.md) | 자체 `package.json`, 서버, `lib/`, `public/`, `.env.example`, Dockerfile | `frontend/dist/` |
| [backend](backend/README.md) | 자체 `package.json`, 서버, `lib/`, `.env.example`, Dockerfile | `backend/dist/` |

각 폴더만 따로 복사해도 실행 및 빌드할 수 있습니다. 상위 디렉터리와 다른 서비스에 대한 소스 의존성은 없습니다.

```sh
# frontend/에서
npm ci
npm run build
npm run start:built
```

```sh
# backend/에서
npm ci
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

Node.js 24가 필요합니다. `npm install`이나 빌드는 필요하지 않습니다.

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
| `APP_NAME` | `Delta Notes` | 화면 이름과 브라우저 제목 |
| `APP_ENV` | `local` | 화면에 표시할 환경 이름 |
| `APP_VERSION` | `dev` | 화면에 표시할 FE 버전 |

브라우저는 `/runtime-config.json`에서 `appName`, `environment`, `version`, `apiEndpoint`만 읽습니다. `API_HOST`와 `API_PORT`는 FE 서버 내부에서 사용하고 브라우저에 전달하지 않습니다. 브라우저에는 FE와 같은 Origin의 API 경로만 노출합니다.

```text
Browser -> FE /api/* -> http://API_HOST:API_PORT/api/* -> BE memory
```

API 주소나 포트를 변경해도 FE 소스 수정과 이미지 재빌드가 필요하지 않습니다. 변수는 프로세스 시작 시 읽으므로 변경 후 재시작합니다. HTTPS 리버스 프록시 앞에서 실행해도 되며, 원래 요청의 `Host` 헤더를 FE에 전달해야 합니다.

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

`API_PROTOCOL`, `API_ENDPOINT`, `API_TIMEOUT_MS`, `APP_NAME`, `APP_ENV`, `APP_VERSION`도 루트 `.env` 또는 CI/CD 환경변수로 주입합니다. 개별 컨테이너 실행 시에는 위 서비스별 변수를 직접 전달합니다.

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
  -e APP_ENV=staging -e APP_VERSION=demo-1 \
  delta-sample-backend:demo-1
docker run -d --name delta-frontend --network delta-demo -p 3000:3000 \
  -e PORT=3000 -e API_HOST=delta-backend -e API_PORT=8080 \
  -e API_ENDPOINT=/api -e APP_ENV=staging -e APP_VERSION=demo-1 \
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

`FE_IMAGE`, `BE_IMAGE`, `APP_VERSION`을 이전 태그로 되돌리고 필요한 연결 환경변수도 복원한 뒤 같은 명령을 실행합니다. SHA 이미지 태그를 사용하면 배포 버전을 구분하기 좋습니다. 롤백하거나 BE를 재시작하면 기존 메모리는 초기화됩니다.

## API 및 연결 확인

`API_ENDPOINT=/api`일 때의 경로입니다.

| 메서드 | 경로 | 기능 |
| --- | --- | --- |
| GET / HEAD | `/healthz` | 각 FE/BE 프로세스 상태 |
| GET | `/runtime-config.json` | FE 공개 설정 |
| GET | `/api/health` | BE 버전, 환경, 인스턴스, 가동 시간 |
| GET | `/api/notes` | 메모 목록, 최신순 |
| POST | `/api/notes` | 메모 생성. JSON `title`, 선택 `content` |
| DELETE | `/api/notes/:id` | 메모 삭제 |

```sh
curl -f http://localhost:3000/healthz
curl -f http://localhost:3000/api/health
curl -f http://localhost:3000/runtime-config.json
curl -f http://localhost:3000/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"title":"첫 배포 확인","content":"FE에서 BE로 연결됐어요."}'
```

FE의 `/healthz`는 FE만 검사합니다. 실제 BE 연결은 FE의 `/api/health`로 검사합니다. `API_ENDPOINT`가 다르면 해당 경로도 바꿉니다. `502`는 BE 연결 실패, `504`는 `API_TIMEOUT_MS` 초과입니다.

메모 제목은 1~120자, 내용은 최대 2,000자, JSON 요청은 최대 16 KiB입니다. BE 프로세스당 최대 1,000개의 메모를 보관합니다.

요청 로그는 stdout에 JSON으로 출력합니다. `service`, `requestId`, `method`, `path`, `status`, `durationMs`로 연결을 추적할 수 있습니다. 프록시는 FE와 BE에 같은 `X-Request-Id`를 전달합니다. 요청 본문과 쿼리 문자열은 로그에 기록하지 않습니다. `SIGTERM` 시 진행 중인 요청을 최대 5초 기다리고 종료합니다.

## 검증

```sh
npm run check
npm test
```

HTTP 테스트는 임시 localhost 포트를 사용합니다. 메모 CRUD, 런타임 설정 및 API 경로 변경, 헬스체크, 입력 검증, CORS, 프록시 연결 실패와 제한 시간을 검증합니다. 독립 빌드 테스트는 각 프로젝트를 별도 임시 폴더에서 빌드한 뒤 소스 트리를 제거하고 산출물만으로 실행합니다. 실제 컨테이너와 클라우드에서의 결과는 이 테스트와 별도로 확인해야 합니다.

설계 승인 및 실제 실행한 검증은 [AI-DLC 기록](docs/ai-dlc/sample-app.md)에 정리합니다.

참고: [Node.js HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html), [Node.js 환경변수](https://github.com/nodejs/node/blob/main/doc/api/environment_variables.md), [Docker GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/).

## 온프레미스의 데이터와 관측

선택 기능이다. 각 폴더에서 `npm ci` 후 실행한다. `DATABASE_URL`이 없으면 기존 메모리 저장을 사용한다. PostgreSQL 사용 시 전용 DB에 `backend/schema.sql`을 먼저 적용하고 BE에만 접속값을 전달한다. FE에는 DB 비밀번호를 전달하지 않는다.

`OTEL_EXPORTER_OTLP_ENDPOINT`를 설정하면 HTTP OTLP로 FE·BE trace, 요청 지연 histogram, 5xx 오류를 보낸다. `OTEL_SERVICE_NAME`은 `delta-notes-frontend`/`delta-notes-backend`로 구분한다. 환경 ID는 신뢰할 수 있는 중앙 Collector에서 부여한다. 이미지 빌드 시 비밀값을 넣지 않는다.

발표용 DB 이전은 쓰기 중단 후 같은 PostgreSQL 버전의 dump/restore다. 현재 로그인 기능이 없으므로 세션 유지 시연은 포함하지 않는다.
