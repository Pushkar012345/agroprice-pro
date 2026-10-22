// POST + read a Server-Sent Events stream. (EventSource can't POST, so we parse it by hand.)
// Server frames look like:   data: {"type":"token","text":"Hi"}\n\n

export async function streamChat(url, body, onEvent, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  // Errors before the stream starts (400 bad input, 429 rate limit) come back as plain JSON.
  if (!res.ok || !res.body) {
    let message = 'Chat failed.';
    try { message = (await res.json()).error || message; } catch { /* keep default */ }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try { onEvent(JSON.parse(line.slice(5).trim())); } catch { /* ignore a malformed frame */ }
    }
  }
}