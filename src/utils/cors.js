/**
 * 이 API를 직접 호출할 수 있는 브라우저 오리진 허용 목록
 */
const ALLOWED_ORIGINS = [
  'https://dandani.yetimates.com',
  'https://dandani.pages.dev',
  'https://timefold.yetimates.com',
  'https://timefold-7i7.pages.dev',
  'https://tteut.yetimates.com',
  // Capacitor로 감싼 네이티브 앱(iOS/Android)의 WebView 기본 오리진.
  // capacitor.config.json에 커스텀 hostname이 없으면 iosScheme/androidScheme이
  // "https"일 때 기본값이 https://localhost가 된다.
  'https://localhost',
  'capacitor://localhost',
];

/**
 * CORS 헤더 반환. origin이 허용 목록에 있을 때만 Allow-Origin을 내려준다 —
 * 목록에 없으면 헤더 자체를 생략해서 브라우저가 응답을 차단하게 한다.
 * (참고: CORS는 브라우저에서만 강제되는 정책이라 curl 같은 직접 호출은 막지 못한다 —
 * 그건 rate limiting으로 별도 방어한다.)
 * @param {string|null} origin - 요청의 Origin 헤더 값
 * @returns {Object} CORS 헤더 객체
 */
export const getCorsHeaders = (origin) => {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
};
