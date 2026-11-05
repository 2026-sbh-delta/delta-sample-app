# Frontend

Node.js 24와 HTML/CSS/JS로 동작하는 독립 게시판 FE 프로젝트입니다. 게시글 목록, 글쓰기, 상세 조회와 클라우드별 테마를 제공합니다. 상위 디렉터리나 BE 소스 없이 실행 및 빌드할 수 있습니다. 외부 npm 패키지를 설치하지 않습니다.

## 실행

이 폴더에서 실행합니다.

```sh
cp .env.example .env
npm run dev
```

기본 주소는 <http://localhost:3000>입니다. BE는 기본적으로 `127.0.0.1:8080`에 연결합니다.

## 개별 빌드

```sh
npm run build
npm run start:built
```

빌드는 JavaScript 문법을 검사하고 `dist/`에 서버, 라이브러리, 정적 파일만 패키징합니다. 환경변수와 `.env`는 산출물에 포함하지 않습니다. `dist/`만 복사한 환경에서도 `node server.mjs`로 실행할 수 있습니다.

## 개별 Docker 이미지

이 폴더를 빌드 컨텍스트로 사용합니다.

```sh
docker build -t delta-sample-frontend:demo .
docker run --rm -p 3000:3000 --env-file .env delta-sample-frontend:demo
```

컨테이너의 `127.0.0.1`은 컨테이너 자신입니다. Docker에서 실행할 때는 `.env`의 `API_HOST`를 컨테이너에서 접근 가능한 BE 주소로 변경합니다. 같은 Docker 네트워크의 BE 서비스명이나 내부 DNS를 사용할 수 있습니다.

## 실행 시 환경변수

| 변수 | 기본값 | 역할 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | FE 바인딩 주소 |
| `PORT` | `3000` | FE 포트 |
| `API_HOST` | `127.0.0.1` | BE 호스트. 프로토콜, 포트 제외 |
| `API_PORT` | `8080` | BE 포트 |
| `API_PROTOCOL` | `http` | BE 연결 프로토콜 |
| `API_ENDPOINT` | `/api` | BE와 동일한 API 경로 접두사 |
| `API_TIMEOUT_MS` | `5000` | BE 요청 전체 제한 시간 |
| `APP_NAME` | `Delta Board` | 화면 이름 |
| `CLOUD_PROVIDER` | `auto` | Linux 장비 정보로 테마 감지. `aws`, `gcp`, `onprem`, `default`로 재정의 |
| `APP_ENV` | `local` | 표시할 환경 |
| `APP_VERSION` | `dev` | 표시할 FE 버전 |

브라우저는 FE와 같은 Origin의 API를 호출합니다. FE가 환경변수로 지정한 BE에 요청을 전달하므로 API 연결값을 바꿔도 재빌드할 필요가 없습니다. 환경변수 변경 후 FE를 재시작합니다. `.env`보다 외부에서 주입한 환경변수가 우선합니다.

`GET /healthz`는 FE 상태, `GET /api/health`는 BE까지의 연결 상태를 확인합니다. API 경로를 변경했다면 연결 확인 경로도 변경합니다.

## 화면과 테마

목록 `/#/posts`, 글쓰기 `/#/posts/new`, 상세 `/#/posts/:id`로 이동합니다. 기존 notes API를 사용하며 상세 화면은 새 `GET /api/notes/:id`를 사용하므로 BE를 먼저 갱신합니다. API 접두사는 실행 시 설정을 따릅니다.

| CLOUD_PROVIDER | 테마 |
| --- | --- |
| 미설정, 빈 값, `auto` | Linux DMI 자동 감지, 실패하면 기본 회색 |
| `aws` | 주황 |
| `gcp` | 파랑 |
| `onprem` | 초록 |
| `default` | 감지를 건너뛰고 기본 회색 |

자동 감지는 `/sys/class/dmi/id/`의 sys_vendor, product_name, board_asset_tag를 시작 시 읽습니다. AWS는 제조사 `Amazon EC2` 또는 EC2 instance ID 형식의 장비 태그, GCP는 제품명 `Google Compute Engine`으로 식별합니다. 원본 장비 값은 공개하지 않고 `cloudProvider`만 `/runtime-config.json`에 추가합니다. API 주소 등 비공개 서버 설정은 계속 노출하지 않습니다.

Linux 외 OS, DMI 읽기 실패, 알 수 없는 제조사는 기본 회색입니다. 감지되지 않는 컨테이너나 온프레미스에서는 환경변수를 지정합니다. 예를 들어 이 폴더에서 `CLOUD_PROVIDER=onprem npm start`로 실행하면 초록 테마입니다. 셸/CI 환경변수는 `.env`보다 우선하고, 명시한 테마는 감지보다 우선합니다. 허용하지 않은 CLOUD_PROVIDER 값은 시작 시 거부합니다. 같은 산출물로 실행할 수 있으며 설정 변경 후 재시작하면 됩니다.

자동 감지와 브라우저 검증의 실행 범위는 [게시판 AI-DLC 기록](../docs/ai-dlc/bulletin-board.md)을 확인하세요.
