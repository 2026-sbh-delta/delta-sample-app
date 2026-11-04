# 프로젝트 진행 상태

## 시연용 게시판

- 구성: Flask 게시판(화면·API 한 컨테이너) + PostgreSQL. 로그인 없음
- 의도한 취약점: 게시글 본문·댓글 저장형 XSS(댓글은 CSP 적용)
- 진행 상태: 구현 및 로컬 검증 완료(테스트 9개, SAST, Compose, 브라우저). 커밋·푸시 전
- 이전 판: 11/4 Node.js FE/BE 메모 앱은 SAST·DAST가 적용되지 않아 교체했다. Git 이력(`df9e26b`까지)에 남아 있다.
- 다음 작업: 원격 CI 확인, 클라우드별 배포. DAST 대상 설정은 이 저장소를 받아 고치도록 바뀌었다(delta-network-gateway `services/delta-dast`, 미커밋)
- 상세 설계와 검증: [AI-DLC 기록](ai-dlc/sample-app.md)

실행과 운영 방법은 [프로젝트 README](../README.md)에 정리했다.
