#!/bin/bash
# Claude Code Stop 훅 - 작업 완료 알림
#
# 이 스크립트는 Claude Code가 Stop 이벤트를 발생시킬 때 실행됩니다.
# Claude가 응답을 완료하면 세션 ID와 사용자가 실행한 명령을 Slack으로 전송합니다.

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

# 프로젝트명 추출 (세션 이름으로 사용 — 어떤 작업 공간에서 실행되었는지 식별)
PROJECT_NAME=$(basename "$CLAUDE_PROJECT_DIR")

# 현재 시간
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# JSON 입력 전체 읽기 (Claude Code Stop 훅이 stdin으로 전달하는 이벤트 페이로드)
INPUT=$(cat)

# Stop 훅 페이로드에서 세션 ID와 transcript 파일 경로 추출
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""')

# transcript JSONL 파일에서 마지막 사용자 메시지(= 이번에 Claude가 수행한 명령) 추출
# JSONL은 한 줄에 하나의 이벤트가 들어있는 형식이므로 jq -s 로 슬러프하여 배열로 다룬다.
USER_COMMAND=""
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    USER_COMMAND=$(jq -rs '
      [ .[] | select(.type == "user") ] | last
      | .message.content
      | if type == "string" then .
        elif type == "array" then
          [ .[] | select(.type == "text") | .text ] | join("\n")
        else "" end
      // ""
    ' "$TRANSCRIPT_PATH" 2>/dev/null)
fi

# 명령이 비어있으면 기본 메시지 사용
if [ -z "$USER_COMMAND" ] || [ "$USER_COMMAND" = "null" ]; then
    USER_COMMAND="(사용자 명령을 가져올 수 없습니다.)"
fi

# 명령이 너무 길면 500자로 자르고 말줄임표 추가 (Slack 메시지 가독성을 위해)
MAX_LEN=500
if [ ${#USER_COMMAND} -gt $MAX_LEN ]; then
    USER_COMMAND="${USER_COMMAND:0:$MAX_LEN}..."
fi

# jq 출력을 파이프로 curl에 직접 전달 (변수 경유 시 인코딩 손실 방지)
jq -n \
  --arg project "$PROJECT_NAME" \
  --arg session "$SESSION_ID" \
  --arg timestamp "$TIMESTAMP" \
  --arg command "$USER_COMMAND" \
  '{
    channel: "#claude-code-alarm",
    username: "Claude Code",
    icon_emoji: ":white_check_mark:",
    text: ("✅ 작업 완료 알림\n\n세션: " + $project + " (" + $session + ")\n시간: " + $timestamp + "\n\n💬 *실행한 명령*\n" + $command)
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
