# 프로젝트 진행 상태


## 운영 Compose·스테이징 reset (2026-11-06)

- 승인 명세와 독립 implementation 역할에 따라 detached worktree에서 구현. 다른 에이전트·스킬·Claude 호출 없음
- 구현: staging 전용 reset, 실제 PG18·필수 열 헬스, full40 commit/digest/provider 진단, reset/migration 포함 BE 산출물, FE만 공개하는 운영 Compose와 클라우드별 non-blocking 로그
- 검증: Node24.13.0에서 기존22개와 신규30개, 합계52개 통과·실패0. 기존 실제 DB 통합1개는 설정 미주입으로 skip
- 추가 검증: 문법 검사, FE/BE 빌드, migration 필수 BE 빌드, shell 문법, AWS/GCP Compose 렌더링과 로그 옵션 분리, 테스트/공개 app.js 해시 동일
- 미실행: 새 실제 DB 통합은 메인 담당. Docker 이미지 빌드·클라우드 배포·Terraform·commit/push/PR 미실행
- 인계: 공통 Compose와 두 logging companion 파일을 함께 배치. GCP Proxy 생성·BE namespace 연결, 비밀 파일과 이미지 검증은 배포 호스트 담당
- 상세: [구현·검증·파일 목록](ai-dlc/compose-delivery.md)

## 게시판 전환과 UI 개선 (2026-11-05)

- 요청: 게시글 생성/목록/상세 조회와 현대적인 UI. 댓글은 제외
- 승인: Ideation은 사용자 `진행 ㄱㄱ`, Inception과 U1~U3 설계/구현 계획은 `ㄱㄱㄱ`으로 승인
- 추가 요청: AWS 주황/GCP 파랑/온프레미스 초록 테마. FE 실행 시 CLOUD_PROVIDER로 선택
- 설계: 기존 notes API/DB를 유지하고 단건 GET을 추가. 목록/글쓰기/상세 화면과 모바일 UI 구성
- 구현: 게시글 목록/등록/상세, Linux OS 기반 AWS/GCP 감지, 명시 설정 우선순위와 온프레미스 테마 완료. DB 스키마 변경 없음
- 검증: 최종 문법 검사와 FE/BE 개별 빌드 성공. 실제 전용 PostgreSQL/TLS를 포함한 테스트 29개 통과, 실패/skip 0
- 브라우저: 실제 AWS 주황/GCP 파랑 화면과 정상 연결을 Chrome 새 탭에서 확인. 390px 모바일과 등록 실패 후 최종 UI는 기존 미완료 범위를 유지
- 현재 운영: 사용자 후속 요청으로 AWS/GCP Compose만 중지. AWS 앱2개/GCP 앱과 Proxy3개 제거, 프로젝트 컨테이너/네트워크 잔여0개, 두 delta-compose inactive/disabled 확인
- 자원 보존: 기존 VM/디스크/DB 식별자와 실행 상태, 각 호스트 이미지9개와 배포 설정 해시 동일. 공개 API는 AWS502/GCP503으로 앱 중지 반영
- 중지 전 배포 검증: 같은 소스 버전 547265cbb0ce5cfdb0816716cb3334adfbfbdef5, 실제 OS 자동 감지 aws/gcp, storage=postgres, 외부 생성/목록/상세/없는 글404/검증 글 삭제, 정적 파일 해시 일치 확인
- Git 구분: 위 버전은 원본 서비스 파일27개를 대조한 배포 전용 로컬 스냅샷 커밋. 배포 당시 원본 HEAD fd9a661과 미커밋 작업을 유지했으며 이 스냅샷은 원격 게시 완료를 뜻하지 않음
- Terraform Plan/Apply/원본 작업 폴더 커밋/원격 푸시: 게시판 배포 당시 미실행. 이후 Git 게시 상태는 원격 저장소에서 확인
- 게시 전 재검증: 2026-11-05 문법 검사와 FE/BE 개별 빌드 성공. 전용 임시 PostgreSQL/TLS를 포함한 테스트 29개 통과, 실패/skip 0
- Git 게시와 CI: 기능별 커밋을 원격 main에 푸시. 게시판 코드가 포함된 `40e0ca9`의 [CI 42047802737](https://github.com/2026-sbh-delta/delta-sample-app/actions/runs/42047802737) 성공. 이후 문서 커밋의 CI는 GitHub Actions에서 확인
- 다음 작업: 사용자 재개 요청 시 보존한 이미지로 실행. 최신 중지 상태와 이전 배포/검증 이력은 [게시판 기록](ai-dlc/bulletin-board.md)을 따름

## PostgreSQL 후속 작업 (2026-11-05)

- 승인: EC2 FE/BE와 RDS 배포의 Ideation, Inception 및 U1~U4 구현 계획 승인. 추가 지시로 AWS 인스턴스는 x86 사용
- 구현: memory/PostgreSQL 저장 선택, DB 초기화, 독립 dist/Docker 패키징 및 실제 DB 통합 테스트
- 검증: 새 코드 테스트와 실제 AWS 배포 상태는 [PostgreSQL 기록](ai-dlc/postgresql-storage.md)을 따름
- 실제 AWS 배포: [공개 앱](http://delta-lab-notes-alb-1242820262.ap-northeast-2.elb.amazonaws.com)의 CRUD/BE 재시작 후 데이터 보존/TLS/IAM/로그 검증 완료
- 코드 CI: 수정 커밋 `5fac679`의 [CI 42016275865](https://github.com/2026-sbh-delta/delta-sample-app/actions/runs/42016275865) 성공. 이후 문서 커밋의 상태는 GitHub Actions에서 확인

## 기존 FE/BE 샘플 앱 (2026-11-04 기록)

- 승인 범위: 메모 조회/추가/삭제, FE/BE 분리, 실행 시 환경변수 주입, Docker 및 CI 설정
- DB: 사용자 요청에 따라 보류. BE 메모리만 사용하며 재시작 시 메모를 초기화한다.
- 진행 상태: FE/BE 구현 및 독립 빌드 완료, HTTP 테스트 19개 통과
- 서비스별 작업: [Frontend](../frontend/README.md), [Backend](../backend/README.md)
- 독립 빌드: 각 폴더에서 `npm run build`, 또는 루트에서 `npm run build:fe` / `npm run build:be`
- Docker: GitHub CI에서 FE/BE 이미지 빌드, Compose 실행 및 FE를 통한 BE 연결 확인 통과. 로컬 환경에는 Docker가 없음
- 현재 운영: 사용자 후속 요청으로 AWS/GCP Compose만 중지. AWS 앱2개/GCP 앱과 Proxy3개 제거, 프로젝트 컨테이너/네트워크 잔여0개, 두 delta-compose inactive/disabled 확인
- 자원 보존: 기존 VM/디스크/DB 식별자와 실행 상태, 각 호스트 이미지9개와 배포 설정 해시 동일. 공개 API는 AWS502/GCP503으로 앱 중지 반영
- Git 게시: 기능별 SSH 서명 커밋을 원격 `main`에 푸시하고 로컬 HEAD와 원격 SHA 일치 확인 완료
- CI: [구현 커밋 검증 성공](https://github.com/2026-sbh-delta/delta-sample-app/actions/runs/41810444430)
- 다음 작업: 실제 배포 환경의 연결값 주입 및 필요한 서비스 이미지 배포
- 상세 설계와 검증: [AI-DLC 기록](ai-dlc/sample-app.md)

배포와 운영 방법은 [프로젝트 README](../README.md)에 정리했다.
