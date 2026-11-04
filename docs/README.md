# 프로젝트 진행 상태

## FE/BE 샘플 앱

- 승인 범위: 메모 조회/추가/삭제, FE/BE 분리, 실행 시 환경변수 주입, Docker 및 CI 설정
- DB: 사용자 요청에 따라 보류. BE 메모리만 사용하며 재시작 시 메모를 초기화한다.
- 진행 상태: FE/BE 구현 및 독립 빌드 완료, HTTP 테스트 19개 통과
- 서비스별 작업: [Frontend](../frontend/README.md), [Backend](../backend/README.md)
- 독립 빌드: 각 폴더에서 `npm run build`, 또는 루트에서 `npm run build:fe` / `npm run build:be`
- Docker: 파일과 CI 구성 완료. 현재 환경에 Docker가 없어 실제 이미지 빌드 및 컨테이너 실행은 미검증
- 실제 배포: 미실행
- Git 게시: 사용자 요청에 따라 기능별 서명 커밋 작성 중. 원격 `main` 푸시 및 SHA 대조는 다음 단계
- 다음 확인: Docker 사용 환경에서 Compose 및 CI 실행 결과 확인
- 상세 설계와 검증: [AI-DLC 기록](ai-dlc/sample-app.md)

배포와 운영 방법은 [프로젝트 README](../README.md)에 정리했다.
