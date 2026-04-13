#!/bin/bash
# Claude Code Notification 훅 - 권한 요청 및 사용자 입력 대기 알림
#
# 이 스크립트는 Claude Code가 Notification 이벤트를 발생시킬 때 실행됩니다.
# 주로 권한 요청이나 사용자 입력 대기 상황에서 Slack 알림을 보냅니다.

# jq 경로 설정 (bash PATH에 포함되도록)
export PATH="$HOME/bin:$PATH"

# .env.local 파일에서 Slack 웹훅 URL 로드
if [ -f "$CLAUDE_PROJECT_DIR/.env.local" ]; then
    source "$CLAUDE_PROJECT_DIR/.env.local"
else
    echo "오류: .env.local 파일을 찾을 수 없습니다: $CLAUDE_PROJECT_DIR/.env.local" >&2
    exit 1
fi

# Slack 웹훅 URL 확인
if [ -z "$SLACK_WEBHOOK_URL" ]; then
    echo "오류: SLACK_WEBHOOK_URL이 설정되지 않았습니다." >&2
    exit 1
fi

# JSON 입력 전체 읽기
INPUT=$(cat)

# 알림 메시지 추출
MESSAGE=$(echo "$INPUT" | jq -r '.message // ""')

# transcript에서 마지막 assistant 메시지 텍스트 추출 (진행 중인 작업 컨텍스트)
SUMMARY=$(echo "$INPUT" | jq -r '
  [ .transcript[]? | select(.role == "assistant") ] | last
  | .content
  | if type == "array" then
      [ .[] | select(.type == "text") | .text ] | join("\n")
    else
      .
    end
  // ""
')

# 요약이 너무 길면 300자로 자르고 말줄임표 추가
MAX_LEN=300
if [ -n "$SUMMARY" ] && [ ${#SUMMARY} -gt $MAX_LEN ]; then
    SUMMARY="${SUMMARY:0:$MAX_LEN}..."
fi

# 프로젝트명 추출
PROJECT_NAME=$(basename "$CLAUDE_PROJECT_DIR")

# 현재 시간
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 디버깅을 위한 변수 출력 (stderr로 출력)
echo "DEBUG: MESSAGE = '$MESSAGE'" >&2
echo "DEBUG: PROJECT_NAME = '$PROJECT_NAME'" >&2
echo "DEBUG: TIMESTAMP = '$TIMESTAMP'" >&2
echo "DEBUG: SUMMARY (first 100) = '${SUMMARY:0:100}'" >&2

# 요약이 있으면 같이 전송, 없으면 메시지만 전송
if [ -n "$SUMMARY" ]; then
    BODY="🔔 권한 요청 / 입력 대기\n\n프로젝트: $PROJECT_NAME\n시간: $TIMESTAMP\n\n⚠️ *알림 메시지*\n$MESSAGE\n\n📋 *진행 중인 작업*\n$SUMMARY"
else
    BODY="🔔 권한 요청 / 입력 대기\n\n프로젝트: $PROJECT_NAME\n시간: $TIMESTAMP\n\n⚠️ *알림 메시지*\n$MESSAGE"
fi

# jq 출력을 파이프로 curl에 직접 전달 (변수 경유 시 인코딩 손실 방지)
jq -n \
  --arg body "$BODY" \
  '{
    channel: "#claude-code-alarm",
    username: "Claude Code",
    icon_emoji: ":bell:",
    text: $body
  }' \
| curl -X POST \
    -H "Content-Type: application/json" \
    --data-binary @- \
    "$SLACK_WEBHOOK_URL" > /dev/null 2>&1

# 성공 여부 확인
if [ $? -eq 0 ]; then
    echo "Slack 알림이 성공적으로 전송되었습니다." >&2
else
    echo "Slack 알림 전송에 실패했습니다." >&2
    exit 1
fi
