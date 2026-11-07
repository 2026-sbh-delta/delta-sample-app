# Backend

Node.js 24 게시판 HTTP API의 독립 BE 프로젝트예요. FE 소스나 상위 디렉터리 없이 실행하고 빌드할 수 있어요. 기본 memory 저장과 선택적 PostgreSQL 저장을 지원해요.

## 실행

이 폴더에서 실행해요. memory 모드는 패키지 설치가 필요하지 않아요.

```sh
cp .env.example .env
npm run dev
```

기본 포트는 `8080`이에요. memory 모드는 프로세스를 재시작하면 게시글이 초기화돼요.

## 개별 빌드

```sh
npm ci --ignore-scripts
npm run build
npm run start:built
```

`dist/`에는 서버, 라이브러리, scripts, migration SQL, 자체 package manifest와 lockfile을 포함해요. `.env`는 포함하지 않아요. 다른 서버에 `dist/`만 복사했다면 그 안에서 `npm ci --omit=dev --ignore-scripts`를 실행한 뒤 `node server.mjs`로 시작해요. PostgreSQL 모드에는 production 의존성 `pg`가 필요해요.

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
2. 운영자 계정으로 `scripts/provision-db.mjs`를 실행해 스키마와 앱 계정을 준비해요. 초기화 도구는 표준 입력의 JSON `appUser`/`appPassword`를 읽고 운영자 연결은 `PG*` 환경변수에서 받아요. 재실행해도 기존 게시글을 삭제하지 않아요.
3. 앱에는 `STORAGE_BACKEND=postgres`와 앱 전용 계정을 주입해요. RDS는 CA와 실제 endpoint 이름을 검증하는 TLS로 연결해요.
4. `/api/health`의 `storage=postgres`와 게시글 생성/목록/상세 조회, 기존 삭제 API, BE 재시작 후 보존을 확인해요.

AWS에서는 인프라 저장소의 `deploy/workload/release.py init-db`가 EIC의 BE SSH 터널과 운영자 인증으로 초기화를 수행해요. 마스터 암호는 RDS가 관리하고 앱 암호는 별도 Secrets Manager secret에 보관해요. BE 자체는 AWS API를 호출하지 않아요. 앱 계정에는 기존 notes 테이블의 SELECT/INSERT/DELETE와 필요한 sequence 사용 권한만 부여해요.

초기화와 migration은 서버 시작과 분리돼 있어요. 서비스 시작 중에는 DDL을 수행하지 않아요. DB 장애 시 API는 내부 SQL/비밀번호를 숨긴 503을 반환하고 health도 실패해요.

## API

| 메서드 | 경로 | 기능 |
| --- | --- | --- |
| GET / HEAD | `/healthz` | 저장소를 포함한 BE 상태 |
| GET | `/api/health` | 버전, 환경, 저장 모드, 가동 시간 |
| GET | `/api/notes` | 최신순 게시글 목록 |
| POST | `/api/notes` | title과 선택 content로 생성 |
| GET | `/api/notes/:id` | 단건 상세, JSON `note` |
| DELETE | `/api/notes/:id` | 기존 호환용 삭제 API |

제목은 1~120자, 내용은 2,000자 이하, JSON은 16 KiB 이하예요. 최대 1,000개를 보관하고 PostgreSQL의 동시 생성도 이 제한을 지켜요.

API와 DB의 notes 명칭 및 기존 데이터를 유지해요. 없는 ID와 잘못된 ID의 단건 조회는 `NOTE_NOT_FOUND` 404예요. PG 단건 조회도 매개변수 바인딩을 사용하고 스키마나 계정 권한을 변경하지 않아요. FE 게시판 버전을 배포하기 전에 BE를 먼저 갱신해요.


## 스테이징 reset과 배포 헬스 (2026-11-06)

`node scripts/reset-db.mjs` 또는 `npm run reset:staging`은 승인된 스테이징 전용 명령입니다. 소스와 독립 `dist/`에서 같은 경로로 실행할 수 있습니다. 테스트 주입용 공개 API는 `resetDatabase({ env, createClient })`이며 `createClient`에는 `postgresConfig(env)`로 만든 연결 설정을 전달합니다. 호출자는 Client 또는 Client의 Promise를 반환할 수 있습니다.

연결을 만들기 전에 `APP_ENV=staging`, `STORAGE_BACKEND=postgres`, `APP_RESET_DATABASE=PGDATABASE`를 모두 요구합니다. DB 이름은 소문자 영문·숫자·밑줄의63자 이하 이름이며 밑줄 경계의 `staging` 식별자가 있어야 합니다. `prod`·`production` 식별자는 거부합니다. 전용 reset 자격은 서비스 앱 자격과 별도로 배포 호스트가 주입합니다.

실제 연결의 `current_database()`가 허용한 DB와 같고 `SHOW server_version_num` 메이저가18인 경우에만 트랜잭션을 시작합니다. 앱 초기화/쓰기와 같은 advisory lock을 잡고 `delta_notes` migration → `delta_notes.notes`만 `TRUNCATE RESTART IDENTITY` → 같은 트랜잭션의 행 수0 검사 → COMMIT 순서로 수행합니다. CASCADE·다른 스키마·운영 DB 삭제는 사용하지 않습니다. 필요한 권한은 이 스테이징 DB의 앱 스키마 준비와 해당 테이블 TRUNCATE/identity 초기화·조회로 제한합니다.

성공 stdout은 JSON 한 줄입니다.

```json
{"remaining_rows":0,"database_version_num":180003}
```

버전 값은 실제 관측값이며 위 숫자는 예시입니다. 거부·실패는 안전한 실패 JSON을 stderr에 쓰고 nonzero로 종료합니다. 예외·SQL·연결 문자열·비밀번호를 출력하지 않습니다. 트랜잭션 도중 실패·잔존 행은 ROLLBACK하며 연결을 닫습니다. reset의0행은 commit 시점 결과입니다. 이전 DAST 종료·쓰기 drain·교체 후 최종0행 확인은 호출하는 스테이징 도구가 책임집니다.

Docker는 `npm run build -- --require-migrations`로 migration을 필수 패키징합니다. 일반 `npm run build`도 migration이 있으면 항상 복사하며, 기존 memory 전용 독립 빌드처럼 migration 소스가 없는 경우만 허용합니다. 그 산출물에서 reset은 실패하므로 배포용으로 사용하지 않습니다. `.env`나 비밀은 산출물에 포함하지 않습니다.

staging/production에서는 `APP_VERSION`이 full40 commit SHA여야 하고, postgres 저장과 실제 PostgreSQL18만 허용합니다. 서버 시작은 DDL/reset을 수행하지 않고 필요한 테이블 열을 조회합니다. health와 `storage.health()`는 관측한 숫자 `databaseVersionNum`을 반환합니다. 다른 로컬 환경에서는 기존 PG 메이저를 계속 사용할 수 있습니다.

`IMAGE_DIGEST`, `CLOUD_PROVIDER`, 선택 `SERVED_BY`는 헬스의 `digest`, `cloudProvider`, `servedBy` 진단에 사용하며 `commit=version`입니다. 진단값은 실행 이미지의 증거가 아닙니다. BE 비밀 파일 wrapper와 GCP Proxy 연결은 [운영 Compose 안내](../README.md)를 따릅니다.
