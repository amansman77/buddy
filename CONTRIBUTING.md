# Contributing to 벗 (Buddy)

> 감정 회복을 돕는 AI 말벗 서비스

## 개요

벗(Buddy)은 DAUM 플랫폼의 감정 회복 AI 말벗 서비스입니다. 
이 문서는 프로젝트에 기여하는 방법과 코드 재사용 전략을 설명합니다.

## 프로젝트 구조

```
buddy/
├── src/
│   ├── api/              # API 엔드포인트
│   ├── services/         # LLM 서비스들
│   ├── prompts/          # 프롬프트 엔지니어
│   ├── utils/            # 유틸리티
│   └── static/           # 정적 파일들
├── docs/                 # 문서
├── tests/                # 테스트
└── README.md
```

## 개발 환경 설정

### 필수 요구사항
- Node.js 18+
- Wrangler CLI
- OpenAI API 키

### 설치 및 실행
```bash
npm install
npm run dev
```

## 코드 재사용 전략

### 핵심 원칙

#### 1. 문서화 (Documentation)
- 공통 패턴을 문서로 정리
- 각 프로젝트의 베스트 프랙티스 공유
- 학습한 내용을 다음 프로젝트에 적용

#### 2. 독립성 유지 (Independence)
- 각 프로젝트는 독립적으로 동작
- 복잡한 의존성 관리 지양
- 명확한 책임 분리

### 프로젝트별 특성

| 프로젝트 | 목적 | 특징 | 기술 스택 |
|----------|------|------|-----------|
| **buddy** | 감정 회복 AI 말벗 | 감정 듣기, 한국어 중심 | OpenAI/Claude |

### 공통 패턴

#### API 구조 패턴
```javascript
export const handleChatRequest = async (request, env) => {
  // 1. 요청 검증
  // 2. 서비스 초기화
  // 3. 컨텍스트 구성
  // 4. LLM 호출
  // 5. 응답 생성
};
```

#### 서비스 레이어 패턴
```javascript
export class LLMService {
  constructor(config) {
    this.config = config;
  }
  
  async generateResponse(message, context, options) {
    // 공통 LLM 호출 로직
  }
}
```

## 코딩 스타일

### JavaScript/Node.js
- ESLint 규칙 준수
- Prettier 포맷팅
- JSDoc 주석 작성

### 프롬프트 작성
- 한국어 중심
- 감정 회복 목적에 맞는 톤
- 명확하고 친근한 표현

## 테스트

### 단위 테스트
```bash
npm test
```

### 통합 테스트
```bash
npm run test:integration
```

## 배포

### 개발 환경
```bash
npm run dev
```

### 프로덕션 배포
```bash
npm run deploy
```

## 이슈 및 PR

### 이슈 작성
- 명확한 제목
- 상세한 설명
- 재현 단계
- 예상 동작

### PR 가이드라인
- 작은 단위로 분리
- 명확한 설명
- 테스트 코드 포함
- 문서 업데이트

## 라이선스

이 프로젝트는 [Apache License 2.0](LICENSE) 하에 배포됩니다.

## 학습 노트

## 참고 자료

- [Cloudflare Workers 문서](https://developers.cloudflare.com/workers/)
- [OpenAI API 문서](https://platform.openai.com/docs)
- [DAUM 플랫폼 문서](https://github.com/amansman77/daum)
