# Backend

Node.js 24 HTTP API의 독립 BE 프로젝트예요. FE 소스나 상위 디렉터리 없이 실행하고 빌드할 수 있어요. 기본 memory 저장과 선택적 PostgreSQL 저장을 지원해요.

## 실행

이 폴더에서 실행해요. memory 모드는 패키지 설치가 필요하지 않아요.

```sh
cp .env.example .env
npm run dev
```

기본 포트는 `8080`이에요. memory 모드는 프로세스를 재시작하면 메모가 초기화돼요.

## 개별 빌드

```sh
npm ci --ignore-scripts
npm run build
npm run start:built
```

`dist/`에는 서버, 라이브러리, 자체 package manifest와 lockfile을 포함해요. `.env`는 포함하지 않아요. 다른 서버에 `dist/`만 복사했다면 그 안에서 `npm ci --omit=dev --ignore-scripts`를 실행한 뒤 `node server.mjs`로 시작해요. PostgreSQL 모드에는 production 의존성 `pg`가 필요해요.

## 개별 Docker 이미지

```sh
docker build -t delta-sample-backend:demo .
docker run --rm -p 8080:8080 --env-file .env delta-sample-backend:demo
```

이미지는 BE 폴더만 컨텍스트로 사용하고 production 의존성을 포함해요.

## 실행 시 환경변수

| 변수 | 기본값 | 역할 |
| --- | --- | --- |
| HOST | `0.0.0.0` | 바인딩 주소 |
| PORT | `8080` | API 포트 |
| API_ENDPOINT | `/api` | FE와 같은 API 경로 접두사 |
| APP_ENV | `local` | 표시할 환경 |
| APP_VERSION | `dev` | 표시할 BE 버전 |
| CORS_ORIGINS | 빈 값 | 직접 브라우저 호출 시 허용할 Origin 목록 |
| STORAGE_BACKEND | `memory` | `memory` 또는 `postgres` |
| PGHOST | postgres 모드 필수 | DB 호스트 또는 초기화용 로컬 터널 주소 |
| PGPORT | `5432` | DB 포트 |
| PGDATABASE | postgres 모드 필수 | DB 이름 |
| PGUSER | postgres 모드 필수 | 앱 전용 DB 계정 |
| PGPASSWORD | postgres 모드 필수 | 실행 시 주입할 비밀번호 |
| PGSSLMODE | `verify-full` | CA/호스트 검증. `disable`은 loopback DB에서만 허용 |
| PGSSLROOTCERT | TLS 사용 시 필수 | CA 인증서 파일 |
| PGTLS_SERVERNAME | PGHOST | SSH 터널을 사용할 때 검증할 실제 RDS endpoint |

`.env`보다 외부 환경변수가 우선해요. 변경 후 프로세스를 재시작해요. FE 프록시를 사용하면 CORS를 설정하지 않아도 돼요. PostgreSQL 모드에서 설정이나 연결이 잘못되면 memory로 전환하지 않아요.

## PostgreSQL 저장

1. BE 폴더에서 `npm ci --ignore-scripts`로 고정 의존성을 설치해요.
2. 운영자 계정으로 `scripts/provision-db.mjs`를 실행해 스키마와 앱 계정을 준비해요. 초기화 도구는 표준 입력의 JSON `appUser`/`appPassword`를 읽고 운영자 연결은 `PG*` 환경변수에서 받아요. 재실행해도 기존 메모를 삭제하지 않아요.
3. 앱에는 `STORAGE_BACKEND=postgres`와 앱 전용 계정을 주입해요. RDS는 CA와 실제 endpoint 이름을 검증하는 TLS로 연결해요.
4. `/api/health`의 `storage=postgres`와 메모 생성/조회/삭제, BE 재시작 후 보존을 확인해요.

AWS에서는 인프라 저장소의 `deploy/workload/release.py init-db`가 EIC의 BE SSH 터널과 운영자 인증으로 초기화를 수행해요. 마스터 암호는 RDS가 관리하고 앱 암호는 별도 Secrets Manager secret에 보관해요. BE 자체는 AWS API를 호출하지 않아요. 앱 계정에는 메모 테이블의 SELECT/INSERT/DELETE와 필요한 sequence 사용 권한만 부여해요.

초기화와 migration은 서버 시작과 분리돼 있어요. 서비스 시작 중에는 DDL을 수행하지 않아요. DB 장애 시 API는 내부 SQL/비밀번호를 숨긴 503을 반환하고 health도 실패해요.

## API

| 메서드 | 경로 | 기능 |
| --- | --- | --- |
| GET / HEAD | `/healthz` | 저장소를 포함한 BE 상태 |
| GET | `/api/health` | 버전, 환경, 저장 모드, 가동 시간 |
| GET | `/api/notes` | 최신순 메모 목록 |
| POST | `/api/notes` | title과 선택 content로 생성 |
| DELETE | `/api/notes/:id` | 메모 삭제 |

제목은 1~120자, 내용은 2,000자 이하, JSON은 16 KiB 이하예요. 최대 1,000개를 보관하고 PostgreSQL의 동시 생성도 이 제한을 지켜요.
