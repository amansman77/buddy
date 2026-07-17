import { LLMService } from '../services/llm.js';
import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { validateChatRequest } from '../utils/validation.js';
import { createSystemPrompt } from '../prompts/buddy.js';

const SUPPORTED_PROVIDERS = ['openai', 'nvidia', 'claude'];
const RATE_LIMIT_PER_MINUTE = 20;

/**
 * env.LLM_PROVIDER로 명시적으로 지정된 provider를 사용한다. 자동 폴백은 하지 않는다 —
 * provider가 죽어있으면 실패한 요청이 한 번 더 반복되는 대신 바로 에러를 반환한다.
 * provider를 바꾸려면 wrangler.toml의 LLM_PROVIDER 값을 바꿔서 재배포한다.
 */
function resolveProvider(env) {
  const configured = env.LLM_PROVIDER;
  if (!SUPPORTED_PROVIDERS.includes(configured)) {
    throw new Error(`LLM_PROVIDER가 올바르지 않습니다: ${configured} (허용값: ${SUPPORTED_PROVIDERS.join(', ')})`);
  }

  const keyPresent = {
    openai: env.OPENAI_API_KEY && env.OPENAI_API_KEY !== 'MOCK_KEY_FOR_TESTING',
    nvidia: !!env.NVIDIA_API_KEY,
    claude: env.CLAUDE_API_KEY && env.CLAUDE_API_KEY !== 'MOCK_KEY_FOR_TESTING',
  };
  if (!keyPresent[configured]) {
    throw new Error(`LLM_PROVIDER=${configured}로 설정돼 있지만 해당 API 키가 없습니다`);
  }

  return configured;
}

/**
 * IP 기준 분당 요청 수를 제한한다 (CORS는 브라우저만 막을 뿐 curl 같은 직접 호출은
 * 못 막기 때문에, 실제 남용 방지는 이 rate limit이 담당한다).
 * KV에는 원자적 증가가 없어 동시 요청 시 약간의 오차는 있을 수 있지만,
 * 이 서비스 규모에서는 대략적인 제한으로 충분하다.
 * @returns {Promise<boolean>} true면 허용, false면 한도 초과
 */
async function checkRateLimit(env, ip) {
  if (!env.CHAT_HISTORY || !ip || ip === 'unknown') {
    return true; // KV나 IP 정보가 없으면 열어둔다 (fail-open)
  }

  const minuteBucket = Math.floor(Date.now() / 60000);
  const key = `ratelimit:${ip}:${minuteBucket}`;
  const current = parseInt((await env.CHAT_HISTORY.get(key)) || '0', 10);

  if (current >= RATE_LIMIT_PER_MINUTE) {
    return false;
  }

  await env.CHAT_HISTORY.put(key, String(current + 1), { expirationTtl: 120 });
  return true;
}

/**
 * 채팅 API 요청 처리
 * @param {Request} request - HTTP 요청
 * @param {Object} env - 환경 변수
 * @returns {Promise<Response>} HTTP 응답
 */
export const handleChatRequest = async (request, env) => {
  const origin = request.headers.get('Origin');

  // POST 메서드만 허용
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405, origin);
  }

  let body;

  try {
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const withinLimit = await checkRateLimit(env, clientIp);
    if (!withinLimit) {
      console.warn('Rate limit exceeded', { ip: clientIp });
      return createErrorResponse('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', 429, origin);
    }

    console.log('Chat request received', {
      method: request.method,
      url: request.url,
      hasOpenAIKey: !!env.OPENAI_API_KEY,
      hasClaudeKey: !!env.CLAUDE_API_KEY,
      hasNvidiaKey: !!env.NVIDIA_API_KEY,
    });

    // 요청 본문 파싱
    body = await request.json();
    console.log('Request body parsed', {
      messageLength: body.message?.length,
      sessionId: body.sessionId,
      service: body.service,
      emotion: body.emotion,
      hasPractice: !!body.practice,
      practiceTitle: body.practice?.title
    });

    // 요청 유효성 검사
    const validationError = validateChatRequest(body);
    if (validationError) {
      console.log('Validation error:', validationError);
      return createErrorResponse(validationError, 400, origin);
    }

    const { message, sessionId, service = 'general', emotion, practice } = body;

    // Mock 모드 확인
    const isMockMode = env.OPENAI_API_KEY === 'MOCK_KEY_FOR_TESTING' && env.CLAUDE_API_KEY === 'MOCK_KEY_FOR_TESTING';

    // 사용할 provider는 LLM_PROVIDER로 명시적으로 고정한다 (자동 폴백 없음)
    const llmProvider = isMockMode ? 'openai' : resolveProvider(env);

    const llmConfig = {
      openaiApiKey: env.OPENAI_API_KEY,
      claudeApiKey: env.CLAUDE_API_KEY,
      nvidiaApiKey: env.NVIDIA_API_KEY,
      useMock: isMockMode,
    };

    console.log('Initializing LLM service...', { provider: llmProvider, isMockMode });
    const llmService = new LLMService(llmProvider, llmConfig);

    // 세션 기반 대화 기록 로드
    let conversationHistory = [];
    if (sessionId && env.CHAT_HISTORY) {
      try {
        const historyKey = `chat:${sessionId}`;
        const storedHistory = await env.CHAT_HISTORY.get(historyKey);
        if (storedHistory) {
          conversationHistory = JSON.parse(storedHistory);
          console.log('Loaded conversation history', { messagesCount: conversationHistory.length });
        }
      } catch (historyError) {
        console.warn('Failed to load conversation history:', historyError);
        // 히스토리 로드 실패는 치명적이지 않으므로 계속 진행
      }
    }

    // 감정은 프론트엔드가 명시적으로 보낸 값만 사용한다 (예: 감정 칩 클릭).
    // 별도로 안 보내면 굳이 감정 분석용 LLM 호출을 추가로 하지 않고, system prompt에서
    // 모델이 메시지로부터 스스로 감정을 파악해 톤을 맞추도록 한다 (createSystemPrompt 참고).
    const analyzedEmotion = emotion || null;

    // 컨텍스트 구성
    const context = {
      service,
      userEmotion: analyzedEmotion,
      practice,
      userProfile: null, // 향후 사용자 프로필 연동
    };

    console.log('Context for system prompt:', {
      service,
      emotion: analyzedEmotion,
      hasPractice: !!practice,
      practiceTitle: practice?.title,
      practiceDay: practice?.day,
      practiceCategory: practice?.category,
      practiceDescription: practice?.description?.substring(0, 100) + '...'
    });

    // 시스템 프롬프트 생성
    const systemPrompt = createSystemPrompt(context);

    console.log('Calling LLM API...', { provider: llmProvider, service, emotion: analyzedEmotion, isMockMode });

    // LLM API 호출
    const aiResponse = await llmService.generateResponse(
      message,
      conversationHistory,
      systemPrompt,
      {
        maxTokens: 1000,
        temperature: 0.7,
      }
    );

    console.log('LLM API response received', { responseLength: aiResponse.length });

    // LLM 요청-응답 이력 저장 (운영/분석용)
    if (env.DB) {
      try {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const timestamp = new Date().toISOString();
        const historyData = {
          id: requestId,
          request_id: requestId,
          timestamp,
          system_prompt: systemPrompt,
          user_message: message,
          response_content: aiResponse,
          response_length: aiResponse.length,
          conversation_length: conversationHistory.length,
          practice_info: practice ? JSON.stringify(practice) : null,
          error_message: null,
        };
        await env.DB.prepare(`INSERT INTO llm_history (id, request_id, timestamp, system_prompt, user_message, response_content, response_length, conversation_length, practice_info, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            historyData.id,
            historyData.request_id,
            historyData.timestamp,
            historyData.system_prompt,
            historyData.user_message,
            historyData.response_content,
            historyData.response_length,
            historyData.conversation_length,
            historyData.practice_info,
            historyData.error_message
          ).run();
        console.log('Saved LLM history to D1:', { requestId, service });
      } catch (historyError) {
        console.warn('Failed to save LLM history to D1:', historyError);
      }
    }

    // 대화 기록 업데이트
    const updatedHistory = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: aiResponse },
    ];

    // 세션 기반 대화 기록 저장
    if (sessionId && env.CHAT_HISTORY) {
      try {
        const historyKey = `chat:${sessionId}`;
        await env.CHAT_HISTORY.put(historyKey, JSON.stringify(updatedHistory));
        console.log('Saved conversation history', { messagesCount: updatedHistory.length });
      } catch (historyError) {
        console.warn('Failed to save conversation history:', historyError);
        // 히스토리 저장 실패는 치명적이지 않으므로 계속 진행
      }
    }

    // 응답 생성
    return createSuccessResponse({
      message: aiResponse,
      emotion: analyzedEmotion,
      service,
      sessionId,
      timestamp: new Date().toISOString(),
      isMockMode,
    }, 200, origin);

  } catch (error) {
    console.error('Chat API error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    // 에러 발생 시에도 LLM 이력 저장
    if (env.DB && body) {
      try {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const timestamp = new Date().toISOString();
        const historyData = {
          id: requestId,
          request_id: requestId,
          timestamp,
          system_prompt: null,
          user_message: body.message,
          response_content: null,
          response_length: 0,
          conversation_length: 0,
          practice_info: body.practice ? JSON.stringify(body.practice) : null,
          error_message: error.message,
        };
        await env.DB.prepare(`INSERT INTO llm_history (id, request_id, timestamp, system_prompt, user_message, response_content, response_length, conversation_length, practice_info, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            historyData.id,
            historyData.request_id,
            historyData.timestamp,
            historyData.system_prompt,
            historyData.user_message,
            historyData.response_content,
            historyData.response_length,
            historyData.conversation_length,
            historyData.practice_info,
            historyData.error_message
          ).run();
        console.log('Saved error LLM history to D1:', { requestId });
      } catch (historyError) {
        console.warn('Failed to save error LLM history to D1:', historyError);
      }
    }

    if (error.message.includes('API')) {
      return createErrorResponse('AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.', 503, origin);
    }

    if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
      return createErrorResponse('잘못된 요청 형식입니다.', 400, origin);
    }

    return createErrorResponse('메시지 처리 중 오류가 발생했습니다.', 500, origin);
  }
};

/**
 * DAUM 서비스별 채팅 API 핸들러
 */
export const handleDandaniChat = async (request, env) => {
  // 단단이 전용 채팅 처리
  const body = await request.json();
  body.service = 'dandani';
  return handleChatRequest(new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(body),
  }), env);
};

export const handleTimefoldChat = async (request, env) => {
  // 시간의 봉투 전용 채팅 처리
  const body = await request.json();
  body.service = 'timefold';
  return handleChatRequest(new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(body),
  }), env);
};

export const handleTteutChat = async (request, env) => {
  // 뜨읏 전용 채팅 처리
  const body = await request.json();
  body.service = 'tteut';
  return handleChatRequest(new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(body),
  }), env);
};
