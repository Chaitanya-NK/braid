#!/usr/bin/env bash
# In GitHub Codespaces, make the web app (3000) and sync server (1234) ports
# public so the browser can reach them, including the sync WebSocket.
# Does nothing outside Codespaces. Never fails `npm run dev`.

[ -z "${CODESPACE_NAME:-}" ] && exit 0

# Wait until both servers are listening (up to ~60s).
for _ in $(seq 1 60); do
  if (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null && (exec 3<>/dev/tcp/127.0.0.1/1234) 2>/dev/null; then
    break
  fi
  sleep 1
done

if gh codespace ports visibility 3000:public 1234:public -c "$CODESPACE_NAME" >/dev/null 2>&1; then
  echo "Ports 3000 and 1234 are public. Open the Ports tab and click the globe next to 3000."
else
  echo "Couldn't make ports public automatically."
  echo "In the Ports tab, right-click 3000 and 1234 → Port Visibility → Public."
fi
exit 0
