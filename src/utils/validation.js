/**
 * 채팅 요청 유효성 검사
 * @param {Object} body - 요청 본문
 * @returns {string|null} 오류 메시지 또는 null (유효한 경우)
 */
export const validateChatRequest = (body) => {
  if (!body) {
    return 'Request body is required';
  }

  if (!body.message) {
    return 'Message field is required';
  }

  if (typeof body.message !== 'string') {
    return 'Message must be a string';
  }

  if (body.message.trim().length === 0) {
    return 'Message cannot be empty';
  }

  if (body.message.length > 4000) {
    return 'Message is too long (maximum 4000 characters)';
  }

  // sessionId는 선택사항
  if (body.sessionId && typeof body.sessionId !== 'string') {
    return 'SessionId must be a string';
  }

  // service는 선택사항 (DAUM 서비스별 구분)
  if (body.service && typeof body.service !== 'string') {
    return 'Service must be a string';
  }

  // emotion은 선택사항 (감정 상태)
  if (body.emotion && typeof body.emotion !== 'string') {
    return 'Emotion must be a string';
  }

  return null; // 유효함
}; 