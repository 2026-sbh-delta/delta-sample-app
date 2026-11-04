# Frontend

Node.js 24와 HTML/CSS/JS로 동작하는 독립 FE 프로젝트입니다. 상위 디렉터리나 BE 소스 없이 실행 및 빌드할 수 있습니다. 외부 npm 패키지를 설치하지 않습니다.

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
| `APP_NAME` | `Delta Notes` | 화면 이름 |
| `APP_ENV` | `local` | 표시할 환경 |
| `APP_VERSION` | `dev` | 표시할 FE 버전 |

브라우저는 FE와 같은 Origin의 API를 호출합니다. FE가 환경변수로 지정한 BE에 요청을 전달하므로 API 연결값을 바꿔도 재빌드할 필요가 없습니다. 환경변수 변경 후 FE를 재시작합니다. `.env`보다 외부에서 주입한 환경변수가 우선합니다.

`GET /healthz`는 FE 상태, `GET /api/health`는 BE까지의 연결 상태를 확인합니다. API 경로를 변경했다면 연결 확인 경로도 변경합니다.

## 선택 데이터·관측 지원

먼저 `npm ci`를 실행한다. 배포 산출물에도 package.json/package-lock.json을 포함하므로 단독 배포 시 해당 폴더에서 `npm ci --omit=dev`를 실행한다. Docker 이미지는 의존성을 포함한다. 새 PostgreSQL/OTel 설정은 [루트 설명](../README.md#온프레미스의-데이터와-관측)을 따른다.
