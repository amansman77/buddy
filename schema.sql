-- LLM 히스토리 테이블
CREATE TABLE IF NOT EXISTS llm_history (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  system_prompt TEXT,
  user_message TEXT,
  response_content TEXT,
  response_length INTEGER,
  conversation_length INTEGER,
  practice_info TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_llm_history_timestamp ON llm_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_llm_history_request_id ON llm_history(request_id);
CREATE INDEX IF NOT EXISTS idx_llm_history_created_at ON llm_history(created_at); 