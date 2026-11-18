#!/usr/bin/env bash
# Sends the same request Jira Automation will send, so you can test the
# GitHub side before setting up Jira.
#
#   GITHUB_TOKEN=github_pat_xxx ./scripts/simulate-jira.sh OWNER/REPO [payload.json]
set -euo pipefail
REPO="${1:?Usage: simulate-jira.sh OWNER/REPO [payload.json]}"
PAYLOAD="${2:-test/sample-jira-payload.json}"
: "${GITHUB_TOKEN:?Set GITHUB_TOKEN to a token with Contents: read & write on $REPO}"

curl -sS -X POST "https://api.github.com/repos/$REPO/dispatches" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"event_type\":\"jira-doc-update\",\"client_payload\":$(cat "$PAYLOAD")}" \
  -w "HTTP %{http_code}\n"
echo "Now open https://github.com/$REPO/actions to watch the run."
