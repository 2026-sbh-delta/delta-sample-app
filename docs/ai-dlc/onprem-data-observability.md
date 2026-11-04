# 온프레미스 발표의 데이터·관측 지원

2026-11-05 사용자의 ONPREM_PLAN 구현 승인으로 PostgreSQL 선택 저장소와 OTel 계측을 추가한다. 이전 FE/BE 기본 범위는 메모리였으며 DATABASE_URL이 없으면 그대로 동작한다. 로그인·세션은 추가하지 않는다.

FE·BE는 각각 독립 빌드한다. 이미지에는 고정된 의존성을 포함하고 OTLP endpoint가 없으면 외부 전송을 하지 않는다. W3C trace 문맥을 FE→BE로 전달하고 HTTP histogram·5xx 로그를 전송한다. 요청 본문·인증정보·원문 URL을 관측에 넣지 않는다.

DB 스키마는 backend/schema.sql로 별도 적용한다. 앱 DB는 전용 DB이며 플랫폼 DB와 공유하지 않는다. 최종 이전 시 소스의 쓰기를 중단한 후 pg_dump/pg_restore로 옮기고 데이터 조회·새 쓰기를 검증한다. 독립 DB에 동시 쓰기하거나 완전 무중단이라고 표시하지 않는다.

구현 진행 중. 테스트·배포·커밋 상태는 검증 후 갱신한다.

2026-11-05: Node.js 24에서 기존 앱/독립 빌드 19개, PostgreSQL 영속성 1개, 실제 OTLP HTTP 수신·trace 부모 관계·histogram·오류 비밀값 제외 1개 검증. 전체 결과는 커밋 전 다시 실행한다. 중앙 저장소 전송과 대상 VM 실행은 별도 단계다.

참고: https://opentelemetry.io/docs/languages/js/exporters/ , https://node-postgres.com/features/queries . SDK의 실제 고정 버전 타입에 맞춰 로그 processor options를 사용한다.

최종 로컬 검증: `TEST_DATABASE_URL=... npx -p node@24 -c "npm test"` 21개 통과. 비밀 접속값은 저장하지 않는다.
