import { LLMService } from '../services/llm.js';
import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { validateChatRequest } from '../utils/validation.js';
import { createSystemPrompt, createEmotionAnalysisPrompt } from '../prompts/buddy.js';

/**
 * 채팅 API 요청 처리
 * @param {Request} request - HTTP 요청
 * @param {Object} env - 환경 변수
 * @returns {Promise<Response>} HTTP 응답
 */
export const handleChatRequest = async (request, env) => {
  // POST 메서드만 허용
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    console.log('Chat request received', {
      method: request.method,
      url: request.url,
      hasOpenAIKey: !!env.OPENAI_API_KEY,
      hasClaudeKey: !!env.CLAUDE_API_KEY,
    });

    // 요청 본문 파싱
    const body = await request.json();
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
      return createErrorResponse(validationError, 400);
    }

    const { message, sessionId, service = 'general', emotion, practice } = body;

    // Mock 모드 확인
    const isMockMode = env.OPENAI_API_KEY === 'MOCK_KEY_FOR_TESTING' && env.CLAUDE_API_KEY === 'MOCK_KEY_FOR_TESTING';
    
    // API 키 확인 (Mock 모드가 아닌 경우)
    if (!isMockMode && !env.OPENAI_API_KEY && !env.CLAUDE_API_KEY) {
      console.error('No LLM API keys configured');
      return createErrorResponse('LLM API keys not configured', 500);
    }

    // LLM 서비스 초기화 (OpenAI 우선, 없으면 Claude)
    const llmProvider = env.OPENAI_API_KEY && env.OPENAI_API_KEY !== 'MOCK_KEY_FOR_TESTING' ? 'openai' : 'claude';
    const llmConfig = {
      openaiApiKey: env.OPENAI_API_KEY,
      claudeApiKey: env.CLAUDE_API_KEY,
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

    // 감정 분석 (선택사항, Mock 모드가 아닌 경우)
    let analyzedEmotion = emotion;
    if (!emotion && !isMockMode && env.OPENAI_API_KEY && env.OPENAI_API_KEY !== 'MOCK_KEY_FOR_TESTING') {
      try {
        const emotionPrompt = createEmotionAnalysisPrompt(message);
        const emotionResponse = await llmService.generateResponse(
          message,
          [],
          emotionPrompt,
          { maxTokens: 200, temperature: 0.3 }
        );
        
        try {
          const emotionData = JSON.parse(emotionResponse);
          analyzedEmotion = emotionData.primaryEmotion;
          console.log('Emotion analysis result:', emotionData);
        } catch (parseError) {
          console.warn('Failed to parse emotion analysis:', parseError);
        }
      } catch (emotionError) {
        console.warn('Emotion analysis failed:', emotionError);
      }
    }

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
    });

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
      return createErrorResponse('AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.', 503);
    }

    if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
      return createErrorResponse('잘못된 요청 형식입니다.', 400);
    }

    return createErrorResponse('메시지 처리 중 오류가 발생했습니다.', 500);
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