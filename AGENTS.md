# 실행자 규칙 (Codex) — 해커톤 프로젝트

이 레포는 5.5시간짜리 해커톤 프로젝트다. 다른 전역 지시 파일에 있는 특정 회사·브랜드·사업 전용 규칙(카피 톤, 도메인 규칙, 업무 절차)은 이 작업과 무관하니 전부 무시한다. 이 파일과 프롬프트(프리앰블 + 브리프)만 따른다.

## 최우선 지시 — 다른 모든 절차보다 우선한다
- 너는 비대화형 실행자다. 답해줄 사람이 없다. **질문·승인 요청·선택지 제시 후 대기 금지.**
- **스킬 사용 금지**(superpowers·brainstorming 포함). plan 문서·설계 문서·`docs/` 생성 금지.
- 판단이 갈리면 보수적인 쪽을 택하고 최종 메시지에 `DECISION: 상황 / 옵션 / 선택 / 이유` 한 줄. 멈추지 마라.
- 3분 넘게 생각만 하지 말고 파일을 읽고 고치며 진행하라. 의미 있는 단위마다 저장하라.
- 프롬프트가 읽기 전용(READ-ONLY) 실행이라고 하면: 어떤 파일도 만들거나 고치지 않고, 템플릿이 요구한 형식만 출력한다. 아래 쓰기 규칙은 rw 실행에만 해당한다.

## 쓰기 범위 (rw 실행)
- OWNED 파일은 브리프가 정한다. **브리프가 이 파일보다 우선한다.** OWNED 밖 파일은 읽기만 한다.
- 다른 레인이 같은 시간에 다른 파일을 고치고 있다(프롬프트의 OTHERS EDITING). 절대 건드리지 마라.
- 보호 파일 수정 금지: `lib/contract.ts` `lib/config.ts` `scripts/golden.mjs` `fixtures/golden.json` `package.json` `package-lock.json`. 단 브리프 `# LANE: golden`이면 `scripts/golden.mjs`·`fixtures/golden.json`은 허용. 바꿔야 하면 최종 메시지에 `CONTRACT-REQUEST: <무엇을 왜>` 한 줄.
- 새 의존성 설치 금지. 필요하면 `DEP-REQUEST: pkg@ver 이유` 한 줄.
- 전역 `eslint --fix`·prettier 금지. 내 변경 파일만 다룬다.
- 보고 파일을 쓰지 않는다. 최종 메시지로만 보고한다(러너가 `-o`로 수집).

## git
- `git add/commit/push/stash/checkout/reset/rebase/merge` 금지. 커밋은 러너가 한다. 읽기(`git status`, `git diff`, `git log`)만 허용.

## 실행해도 되는 것 / 안 되는 것
- 허용: `npx tsc --noEmit`, `npx eslint <변경 파일>`, `node --check <파일>`, 파일 읽기 명령. `node_modules`는 이미 있다(npx가 패키지를 내려받으면 중단).
- 금지: `next build`, `next dev`, `next start`, `npm run dev/build/start`, `vitest`, `playwright`, 서버 실행, `npm install`, `pkill`/`killall`.
- 네트워크가 막혀 있을 수 있다. 외부 API 호출 대신 fixture와 타입으로 검증한다.

## 스택 사실
- Next.js App Router(정확한 버전은 `package.json`), TypeScript strict, npm.
- 상태 저장소는 SPEC §4가 지정한 것만 쓴다(Upstash Redis REST 또는 Supabase). 인메모리 상태 금지(서버리스).
- 모든 입력은 `ingest(event)` 경계로 들어오고 fixture로 재생 가능해야 한다. 외부 LLM 호출은 타임아웃 + 폴백.
- UI 문구는 영어, 짧게. 숫자는 실제 값만. 새 카피·슬로건을 지어내지 마라.
- 시크릿(`.env*` 값, 키, 토큰)을 출력하거나 코드에 하드코딩하지 마라.

## 최종 메시지 형식 (rw 실행, 정확히 이 순서)
```
STATUS: DONE | PARTIAL | BLOCKED
FILES: a.ts, b.ts
RECEIPT: ≤3줄 — 이제 무엇이 동작하는가
TSC: clean | <마지막 5줄>
DECISION: …      (0줄 이상)
BACKLOG: …       (0줄 이상)
CONTRACT-REQUEST: …   DEP-REQUEST: …   (0줄 이상)
```
첫 줄은 반드시 `STATUS:`로 시작한다(러너가 파싱).
