import { handleChatRequest, handleDandaniChat, handleTimefoldChat, handleTteutChat } from './api/chat.js';
import { getCorsHeaders } from './utils/cors.js';
import { createErrorResponse } from './utils/response.js';

/**
 * Cloudflare Workers 메인 fetch 핸들러
 * @param {Request} request - 들어오는 HTTP 요청
 * @param {Object} env - 환경 변수 (OPENAI_API_KEY, CLAUDE_API_KEY, CHAT_HISTORY KV 등)
 * @param {Object} ctx - 실행 컨텍스트
 * @returns {Promise<Response>} HTTP 응답
 */
const handleRequest = async (request, env, ctx) => {
  const origin = request.headers.get('Origin');

  // CORS 프리플라이트 요청 처리
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(origin),
    });
  }

  try {
    const url = new URL(request.url);
    const { pathname } = url;

    // API 라우팅
    switch (pathname) {
      case '/api/chat':
        return await handleChatRequest(request, env);
      
      case '/api/chat/dandani':
        return await handleDandaniChat(request, env);
      
      case '/api/chat/timefold':
        return await handleTimefoldChat(request, env);
      
      case '/api/chat/tteut':
        return await handleTteutChat(request, env);
      
      case '/api/health':
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'buddy',
          version: '1.0.0',
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          },
        });

      case '/':
      case '/index.html':
        return new Response(getIndexHtml(), {
          headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            ...getCorsHeaders(origin),
          },
        });
      
      default:
        return createErrorResponse('Not Found', 404, origin);
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return createErrorResponse('Internal Server Error', 500, origin);
  }
};

/**
 * 기본 HTML 페이지 반환
 * @returns {string} HTML 콘텐츠
 */
const getIndexHtml = () => {
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>벗 (Buddy) - 감정 회복 AI 말벗</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 600px;
            width: 100%;
            text-align: center;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1.2em;
        }
        .description {
            color: #555;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        .api-info {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
        }
        .api-endpoint {
            background: #e9ecef;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            margin: 10px 0;
        }
        .feature-list {
            text-align: left;
            margin: 20px 0;
        }
        .feature-list li {
            margin: 10px 0;
            color: #555;
        }
        .status {
            color: #28a745;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>벗 (Buddy)</h1>
        <p class="subtitle">감정 회복을 돕는 AI 말벗</p>
        
        <div class="description">
            <p>삶의 의미를 찾기보다 삶이 곧 의미임을 기억하게 하는 말벗입니다.</p>
            <p>나의 말과 감정을 기록하고, 그 기록을 바탕으로 나를 이해하는 지능형 말벗을 만들어갑니다.</p>
        </div>

        <div class="status">✅ 서비스가 정상적으로 실행 중입니다</div>

        <div class="api-info">
            <h3>API 엔드포인트</h3>
            <div class="api-endpoint">POST /api/chat</div>
            <p>일반 채팅 API</p>
            
            <div class="api-endpoint">POST /api/chat/dandani</div>
            <p>단단이 연동 채팅 API</p>
            
            <div class="api-endpoint">POST /api/chat/timefold</div>
            <p>시간의 봉투 연동 채팅 API</p>
            
            <div class="api-endpoint">POST /api/chat/tteut</div>
            <p>뜨읏 연동 채팅 API</p>
            
            <div class="api-endpoint">GET /api/health</div>
            <p>서비스 상태 확인</p>
        </div>

        <div class="feature-list">
            <h3>주요 기능</h3>
            <ul>
                <li>🤖 멀티 LLM 지원 (OpenAI GPT-4, Claude)</li>
                <li>💭 감정 분석 및 맞춤형 응답</li>
                <li>🗣️ 한국어 중심 자연스러운 대화</li>
                <li>🔗 DAUM 플랫폼 서비스 연동</li>
                <li>💾 세션 기반 대화 기록 관리</li>
                <li>🛡️ 안전하고 신뢰할 수 있는 AI 조언</li>
            </ul>
        </div>

        <div class="description">
            <p><strong>DAUM 플랫폼</strong>의 핵심 구성 요소로, 감정 회복과 자기 성찰을 돕는 AI 말벗 서비스입니다.</p>
        </div>
    </div>
</body>
</html>
  `;
};

export default {
  fetch: handleRequest,
}; 