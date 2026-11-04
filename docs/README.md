# 프로젝트 진행 상태

## FE/BE 샘플 앱

- 승인 범위: 메모 조회/추가/삭제, FE/BE 분리, 실행 시 환경변수 주입, Docker 및 CI 설정
- DB: 사용자 요청에 따라 보류. BE 메모리만 사용하며 재시작 시 메모를 초기화한다.
- 진행 상태: FE/BE 구현 및 독립 빌드 완료, HTTP 테스트 19개 통과
- 서비스별 작업: [Frontend](../frontend/README.md), [Backend](../backend/README.md)
- 독립 빌드: 각 폴더에서 `npm run build`, 또는 루트에서 `npm run build:fe` / `npm run build:be`
- Docker: GitHub CI에서 FE/BE 이미지 빌드, Compose 실행 및 FE를 통한 BE 연결 확인 통과. 로컬 환경에는 Docker가 없음
- 실제 배포: 미실행
- Git 게시: 기능별 SSH 서명 커밋을 원격 `main`에 푸시하고 로컬 HEAD와 원격 SHA 일치 확인 완료
- CI: [구현 커밋 검증 성공](https://github.com/2026-sbh-delta/delta-sample-app/actions/runs/41810444430)
- 다음 작업: 실제 배포 환경의 연결값 주입 및 필요한 서비스 이미지 배포
- 상세 설계와 검증: [AI-DLC 기록](ai-dlc/sample-app.md)

배포와 운영 방법은 [프로젝트 README](../README.md)에 정리했다.
