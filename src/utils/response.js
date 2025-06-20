import { getCorsHeaders } from './cors.js';

/**
 * 성공 응답 생성
 * @param {Object} data - 응답 데이터
 * @param {number} status - HTTP 상태 코드 (기본값: 200)
 * @returns {Response} HTTP 응답
 */
export const createSuccessResponse = (data, status = 200) => {
  return new Response(JSON.stringify({
    success: true,
    data,
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(),
    },
  });
};

/**
 * 오류 응답 생성
 * @param {string} message - 오류 메시지
 * @param {number} status - HTTP 상태 코드 (기본값: 400)
 * @returns {Response} HTTP 응답
 */
export const createErrorResponse = (message, status = 400) => {
  return new Response(JSON.stringify({
    success: false,
    error: {
      message,
      status,
    },
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(),
    },
  });
}; 