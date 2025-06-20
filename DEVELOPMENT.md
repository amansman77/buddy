# 개발자 가이드

## 빠른 시작

### 환경변수 설정 (.env 파일)

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# OpenAI API 설정
# https://platform.openai.com/api-keys 에서 발급
OPENAI_API_KEY=sk-proj-your_actual_api_key_here

# Qdrant Cloud 설정
# https://cloud.qdrant.io 에서 발급
QDRANT_URL=your_qdrant_cloud_url
QDRANT_API_KEY=your_qdrant_api_key

# 개발 환경 설정
NODE_ENV=development
```

### 개발 서버 실행 방법

#### 실제 API 사용 (권장)
```bash
# 환경변수 로드
export OPENAI_API_KEY=$(grep OPENAI_API_KEY .env | cut -d'=' -f2 | tr -d '\n' | tr -d ' ')
export QDRANT_URL=$(grep QDRANT_URL .env | cut -d'=' -f2 | tr -d '\n' | tr -d ' ')
export QDRANT_API_KEY=$(grep QDRANT_API_KEY .env | cut -d'=' -f2 | tr -d '\n' | tr -d ' ')

# 개발 서버 실행
npx wrangler dev --var OPENAI_API_KEY:$OPENAI_API_KEY --var QDRANT_URL:$QDRANT_URL --var QDRANT_API_KEY:$QDRANT_API_KEY
```

#### Mock 모드 (API 사용량 절약)
```bash
npm run dev:simple
```

## 개발 팁

### Node.js 버전 관리
```bash
# nvm 사용 (권장)
nvm use 22.14.0

# .nvmrc 파일이 있다면
nvm use
```

### 호환성 문제 해결

#### Ubuntu 20.04 GLIBC 문제
```bash
# wrangler 3.x 버전 사용
npm install wrangler@3.78.7 --save-dev
```

#### 환경변수 문제
```bash
# 직접 환경변수 설정 후 실행
export OPENAI_API_KEY=your_api_key
export QDRANT_URL=your_qdrant_url
export QDRANT_API_KEY=your_qdrant_api_key
npx wrangler dev --var OPENAI_API_KEY:$OPENAI_API_KEY --var QDRANT_URL:$QDRANT_URL --var QDRANT_API_KEY:$QDRANT_API_KEY
```

## 아키텍처 설명

### 프로젝트 구조 상세

```bash
src/
├── index.js              # 메인 엔트리포인트
│   ├── handleRequest()    # 라우터 (API, 정적파일)
│   ├── getIndexHtml()     # HTML 템플릿
│   ├── getStyleCSS()      # CSS 스타일
│   └── getAppJS()         # 클라이언트 JavaScript
├── api/
│   └── chat.js           # 채팅 API 핸들러
│       ├── handleChatRequest()     # POST /api/chat
│       ├── createTidyFirstSystemPrompt()  # AI 시스템 프롬프트
│       └── generateSessionId()     # 세션 ID 생성
├── services/
│   ├── openai.js         # OpenAI API 서비스
│   │   ├── generateResponse()      # AI 응답 생성
│   │   ├── generateMockResponse()  # Mock 응답 (개발용)
│   │   ├── callOpenAI()           # OpenAI API 호출
│   │   └── buildMessages()        # 메시지 포맷팅
│   ├── embeddings.js     # 임베딩 서비스
│   │   └── getEmbedding()         # 텍스트 임베딩 생성
│   └── qdrant.js         # Vector DB 서비스
│       └── searchSimilarVectors() # 유사 문서 검색
└── utils/
    ├── cors.js           # CORS 헤더 설정
    ├── response.js       # HTTP 응답 헬퍼
    ├── validation.js     # 요청 유효성 검사
    └── tokenAnalyzer.js  # 토큰 분석 유틸리티
```

## RAG (Retrieval-Augmented Generation) 구현

### Vector DB 통합
- Qdrant Cloud를 사용하여 문서 임베딩 저장 및 검색
- 문서는 청크 단위로 분할되어 저장됨
- 유사도 기반 검색으로 관련 문서만 컨텍스트로 활용

### 토큰 사용량 분석
- `src/utils/tokenAnalyzer.js`에서 토큰 사용량 추적
- 시스템 프롬프트, 사용자 입력, AI 응답의 토큰 수 계산
- RAG 도입으로 인한 토큰 절감 효과 분석

### 분석 스크립트
```bash
# 실제 사용 데이터 기반 토큰 분석
node scripts/analyzeRealUsage.js
```

## 테스트 방법

### API 테스트 (curl)
```bash
# 기본 채팅 테스트
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "안녕하세요! 간단한 테스트입니다."}'

# 세션 포함 테스트
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "코드 개선 예시를 보여주세요", "sessionId": "test-session"}'
```

### Vector DB 테스트
```bash
# 문서 임베딩 테스트
node src/scripts/embed-docs.js --run

# 검색 테스트
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "보호 구문이란 무엇인가요?"}'
```

## UI 개발

### CSS 클래스 구조
```css
.message                    # 기본 메시지 컨테이너
  .user-message            # 사용자 메시지
    .message-content       # 메시지 내용
  .bot-message             # 봇 메시지
    .welcome-message       # 첫 환영 메시지 (특별 스타일)
    .message-content       # 메시지 내용

.chat-form                 # 입력 폼
  .input-group            # 입력 그룹
    #user-input           # 텍스트 입력
    #send-button          # 전송 버튼

.typing-indicator          # 타이핑 인디케이터
  .typing-dots            # 애니메이션 점들
```

### 반응형 브레이크포인트
- **데스크톱**: 768px 이상
- **모바일**: 768px 미만

## 보안 고려사항

### 환경변수 관리
- `.env` 파일은 **절대 Git에 커밋하지 않음**
- `.gitignore`에 포함되어 있는지 확인
- 프로덕션에서는 `wrangler secret` 사용

### API 키 보호
```bash
# 환경변수 로드
export OPENAI_API_KEY=$(grep OPENAI_API_KEY .env | cut -d'=' -f2 | tr -d '\n' | tr -d ' ')
export QDRANT_URL=$(grep QDRANT_URL .env | cut -d'=' -f2 | tr -d '\n' | tr -d ' ')
export QDRANT_API_KEY=$(grep QDRANT_API_KEY .env | cut -d'=' -f2 | tr -d '\n' | tr -d ' ')

# 프로덕션 배포용 (안전)
echo "$OPENAI_API_KEY" | npx wrangler secret put OPENAI_API_KEY --env production
echo "$QDRANT_URL" | npx wrangler secret put QDRANT_URL --env production
echo "$QDRANT_API_KEY" | npx wrangler secret put QDRANT_API_KEY --env production
```

### CORS 설정
- 모든 도메인 허용 (`*`) - 개발용만
- 프로덕션에서는 특정 도메인으로 제한 권장

## 코드 스타일

### ESLint 규칙
- ES2022 기준
- Node.js 환경
- CommonJS + ES Modules 혼용

### ESLint 사용 가이드

#### 기본 명령어
```bash
# 코드 검사 (오류/경고 확인)
npm run lint

# 코드 검사 + 자동 수정
npm run lint:fix

# 특정 파일만 검사
npx eslint src/api/chat.js

# 특정 파일 자동 수정
npx eslint src/api/chat.js --fix
```

## 개발 워크플로우

1. **코드 작성** 중간중간 `npm run lint:fix` 실행
2. **커밋 전** 반드시 `npm run lint` 실행하여 오류 확인
3. **남은 오류** 수동으로 해결
4. **최종 확인** 후 커밋
5. **운영 배포** `npx wrangler deploy --env production` 실행하여 Cloudflare Workers에 배포
- `export OPENAI_API_KEY=$(grep OPENAI_API_KEY .env | cut -d'=' -f2 | tr -d '\n' | tr -d ' ') && echo "API 키 로드됨: ${OPENAI_API_KEY:0:10}..."`
- `export QDRANT_URL=$(grep QDRANT_URL .env | cut -d'=' -f2 | tr -d '\n' | tr -d ' ') && echo "QDRANT_URL 로드됨: ${QDRANT_URL:0:10}..."`
- `export QDRANT_API_KEY=$(grep QDRANT_API_KEY .env | cut -d'=' -f2 | tr -d '\n' | tr -d ' ') && echo "QDRANT_API_KEY 로드됨: ${QDRANT_API_KEY:0:10}..."`
- `echo "$OPENAI_API_KEY" | npx wrangler secret put OPENAI_API_KEY --env production`
- `echo "$QDRANT_URL" | npx wrangler secret put QDRANT_URL --env production`
- `echo "$QDRANT_API_KEY" | npx wrangler secret put QDRANT_API_KEY --env production`
- `npx wrangler deploy --env production`
6. **운영 배포 확인** `npx wrangler deployments list --env production` 실행하여 배포된 버전 확인
7. **운영 로그 확인** `npx wrangler tail --env production | cat` 실행하여 로그 확인
