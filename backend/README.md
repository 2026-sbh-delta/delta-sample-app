# Backend

Node.js 24 기본 HTTP 모듈로 동작하는 독립 BE 프로젝트입니다. FE 소스나 상위 디렉터리 없이 실행 및 빌드할 수 있습니다. 외부 npm 패키지와 DB는 사용하지 않습니다.

## 실행

이 폴더에서 실행합니다.

```sh
cp .env.example .env
npm run dev
```

기본 포트는 `8080`입니다. 메모는 프로세스 메모리에 저장하며 재시작 시 초기화됩니다.

## 개별 빌드

```sh
npm run build
npm run start:built
```

빌드는 문법 검사 후 `dist/`에 서버와 라이브러리만 패키징합니다. `.env`를 포함하지 않습니다. `dist/`만 복사한 환경에서도 `node server.mjs`로 실행할 수 있습니다.

## 개별 Docker 이미지

```sh
docker build -t delta-sample-backend:demo .
docker run --rm -p 8080:8080 --env-file .env delta-sample-backend:demo
```

## 실행 시 환경변수

| 변수 | 기본값 | 역할 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | BE 바인딩 주소 |
| `PORT` | `8080` | BE 포트 |
| `API_ENDPOINT` | `/api` | FE와 동일한 API 경로 접두사 |
| `APP_ENV` | `local` | 표시할 환경 |
| `APP_VERSION` | `dev` | 표시할 BE 버전 |
| `CORS_ORIGINS` | 빈 값 | 직접 브라우저 호출 시 허용할 Origin 목록. 쉼표 구분 |

환경변수 변경 후 프로세스를 재시작합니다. `.env`보다 외부에서 주입한 환경변수가 우선합니다. FE 프록시로 연결하면 CORS 설정은 필요하지 않습니다.

## API

| 메서드 | 경로 | 기능 |
| --- | --- | --- |
| GET / HEAD | `/healthz` | BE 상태 |
| GET | `/api/health` | BE 버전, 환경, 인스턴스, 가동 시간 |
| GET | `/api/notes` | 메모 목록 |
| POST | `/api/notes` | `title`, 선택 `content`로 생성 |
| DELETE | `/api/notes/:id` | 메모 삭제 |

`API_ENDPOINT`를 변경하면 `/api` 접두사도 바뀝니다. 제목은 1~120자, 내용은 최대 2,000자, JSON은 최대 16 KiB이며 메모는 1,000개까지 보관합니다.
