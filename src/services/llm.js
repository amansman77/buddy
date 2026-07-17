/**
 * 멀티 LLM 서비스 클래스
 * OpenAI와 Claude를 지원하는 통합 LLM 서비스
 */
export class LLMService {
  constructor(provider = 'openai', config = {}) {
    this.provider = provider;
    this.config = config;
    this.useMock = config.useMock || false;
  }

  /**
   * AI 응답 생성
   * @param {string} userMessage - 사용자 메시지
   * @param {Array} conversationHistory - 대화 기록
   * @param {string} systemPrompt - 시스템 프롬프트
   * @param {Object} options - 추가 옵션
   * @returns {Promise<string>} AI 응답
   */
  async generateResponse(userMessage, conversationHistory = [], systemPrompt = '', options = {}) {
    if (!userMessage || typeof userMessage !== 'string') {
      throw new Error('User message is required and must be a string');
    }

    // Mock 응답 (개발/테스트용)
    if (this.useMock) {
      return this.generateMockResponse();
    }

    try {
      switch (this.provider) {
        case 'openai':
          return await this.generateOpenAIResponse(userMessage, conversationHistory, systemPrompt, options);
        case 'claude':
          return await this.generateClaudeResponse(userMessage, conversationHistory, systemPrompt, options);
        case 'nvidia':
          return await this.generateNvidiaResponse(userMessage, conversationHistory, systemPrompt, options);
        default:
          throw new Error(`Unsupported LLM provider: ${this.provider}`);
      }
    } catch (error) {
      console.error(`${this.provider} API error:`, error);
      throw new Error(`${this.provider} API request failed: ${error.message}`);
    }
  }

  /**
   * OpenAI API 응답 생성 (Vercel Proxy를 통해)
   */
  async generateOpenAIResponse(userMessage, conversationHistory, systemPrompt, options) {
    const messages = this.buildMessages(userMessage, conversationHistory, systemPrompt);

    // Vercel Proxy를 통해 OpenAI API 호출
    const response = await fetch('https://buddy-vercel-proxy.vercel.app/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: this.config.openaiApiKey,
        model: options.model || 'gpt-4o-mini',
        messages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1,
        frequency_penalty: options.frequencyPenalty || 0,
        presence_penalty: options.presencePenalty || 0,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`HTTP ${response.status}: ${errorData.error?.message || 'API request failed'}`);
    }

    const data = await response.json();
    return this.extractResponseContent(data);
  }

  /**
   * Claude API 응답 생성
   */
  async generateClaudeResponse(userMessage, conversationHistory, systemPrompt, options) {
    const messages = this.buildClaudeMessages(userMessage, conversationHistory, systemPrompt);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model || 'claude-3-sonnet-20240229',
        messages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`HTTP ${response.status}: ${errorData.error?.message || 'API request failed'}`);
    }

    const data = await response.json();
    return this.extractClaudeResponseContent(data);
  }

  /**
   * NVIDIA build API 응답 생성 (OpenAI 호환 chat/completions 포맷)
   */
  async generateNvidiaResponse(userMessage, conversationHistory, systemPrompt, options) {
    const messages = this.buildMessages(userMessage, conversationHistory, systemPrompt);

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'nvidia/nemotron-3-ultra-550b-a55b',
        messages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`HTTP ${response.status}: ${errorData.error?.message || 'API request failed'}`);
    }

    const data = await response.json();
    return this.extractResponseContent(data);
  }

  /**
   * 메시지 배열 구성 (OpenAI 형식)
   */
  buildMessages(userMessage, conversationHistory, systemPrompt) {
    const messages = [];

    // 시스템 프롬프트 추가
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // 대화 기록 추가 (최근 8개 메시지만)
    const recentHistory = conversationHistory.slice(-8);
    messages.push(...recentHistory);

    // 현재 사용자 메시지 추가
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

  /**
   * 메시지 배열 구성 (Claude 형식)
   */
  buildClaudeMessages(userMessage, conversationHistory, systemPrompt) {
    const messages = [];

    // 시스템 프롬프트는 별도 필드로 전달
    const systemMessage = systemPrompt || '';

    // 대화 기록 추가 (최근 8개 메시지만)
    const recentHistory = conversationHistory.slice(-8);
    messages.push(...recentHistory);

    // 현재 사용자 메시지 추가
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return {
      messages,
      system: systemMessage,
    };
  }

  /**
   * OpenAI API 응답에서 콘텐츠 추출
   */
  extractResponseContent(response) {
    // 오류 응답 처리
    if (response.error) {
      throw new Error(`OpenAI API Error: ${response.error.message || response.error.type || 'Unknown error'}`);
    }

    // 정상 응답 확인
    if (!response.choices || response.choices.length === 0) {
      console.error('Invalid OpenAI response:', response);
      throw new Error('No response choices available');
    }

    const choice = response.choices[0];
    if (!choice.message || !choice.message.content) {
      console.error('Invalid choice format:', choice);
      throw new Error('Invalid response format');
    }

    return choice.message.content.trim();
  }

  /**
   * Claude API 응답에서 콘텐츠 추출
   */
  extractClaudeResponseContent(response) {
    if (!response.content || response.content.length === 0) {
      throw new Error('No response content available');
    }

    const content = response.content[0];
    if (!content.text) {
      throw new Error('Invalid response format');
    }

    return content.text.trim();
  }

  /**
   * Mock 응답 생성 (개발/테스트용)
   */
  generateMockResponse() {
    const mockResponses = [
      `안녕하세요! 👋 벗입니다.
      Mock 모드로 실행되고 있습니다.

**감정 회복을 위한 조언:**

지금 이렇게 말로 풀어내는 것만으로도 큰 진전이에요. 
때로는 모든 것이 무겁게 느껴질 수 있지만, 
그 무거움을 인정하고 받아들이는 것이 첫 번째 단계입니다.

오늘 하루도 수고했어요. 🌟`,

      `좋은 질문이네요! 🤔

**감정 회복의 핵심:**

1. **인정하기**: 지금의 감정을 있는 그대로 받아들이기
2. **이해하기**: 이 감정이 왜 생겼는지 탐구하기
3. **실천하기**: 작은 행동으로 변화 시작하기

어떤 부분에서 도움이 필요하신가요? 
더 구체적으로 말씀해주시면 맞춤형 조언을 드릴게요! 💡`,
    ];

    return mockResponses[Math.floor(Math.random() * mockResponses.length)];
  }

  /**
   * API 사용량 정보 반환 (디버깅용)
   */
  getUsageInfo(response) {
    return response.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
  }
} 