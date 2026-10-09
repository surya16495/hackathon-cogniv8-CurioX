// Runs the judge journey against a running API:
//   npm run smoke -w server                      (http://localhost:4000)
//   API_URL=https://curiox-api.onrender.com npm run smoke -w server
import { randomUUID } from 'node:crypto';
import { parseSse } from '../src/utils/sse';

const API = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '');
const DEVICE = `smoke-${randomUUID()}`;
let failures = 0;

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': DEVICE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // SSE or empty
  }
  return { status: res.status, json, text };
}

async function step(name: string, fn: () => Promise<string | void>) {
  const started = Date.now();
  try {
    const note = await fn();
    console.log(`  ✓ ${name} (${Date.now() - started}ms)${note ? `  ${note}` : ''}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`CurioX smoke test against ${API} as ${DEVICE}\n`);
  let conversationId = '';

  await step('health (wakes the server)', async () => {
    const r = await call('GET', '/api/health');
    assert(r.status === 200, `status ${r.status}`);
    return `db=${r.json.db} demo=${r.json.demoMode} providers=${JSON.stringify(r.json.providers)}`;
  });

  await step('create session', async () => {
    const r = await call('POST', '/api/session');
    assert(r.status === 201, `expected 201, got ${r.status}`);
  });

  await step('onboarding: six answers', async () => {
    const answers = [
      'Space, cooking and AI',
      'Beginner in all of them',
      'Understand the news about AI and space',
      'Analogies, short and step by step',
      'Friendly and casual',
      'How do rockets land themselves?',
    ];
    let r = await call('POST', '/api/onboarding/message', {});
    assert(r.json?.question, 'no first question');
    for (const a of answers) {
      r = await call('POST', '/api/onboarding/message', { message: a });
      assert(r.status === 200, `status ${r.status}: ${r.text.slice(0, 200)}`);
    }
    assert(r.json.onboarding.status === 'completed', `status ${r.json.onboarding.status}`);
    return `interests=${JSON.stringify(r.json.profile.interests)}`;
  });

  await step('suggested topics', async () => {
    const r = await call('GET', '/api/topics/suggested');
    assert(r.json?.topics?.length >= 4, 'fewer than 4 topics');
    return `${r.json.topics.length} topics via ${r.json.provider}`;
  });

  await step('streamed chat: stable concept (no search expected)', async () => {
    const r = await call('POST', '/api/chat', { message: 'How does a rocket engine work?' });
    const events = parseSse(r.text);
    const done = events.find((e) => e.event === 'done')?.data as any;
    assert(done, `no done event: ${r.text.slice(0, 300)}`);
    conversationId = done.conversationId;
    const tokens = events.filter((e) => e.event === 'token').length;
    const sources = events.some((e) => e.event === 'sources');
    return `provider=${done.provider} tokens=${tokens} searched=${sources}`;
  });

  await step('streamed chat: current events (sources expected)', async () => {
    const r = await call('POST', '/api/chat', { message: 'What is the latest news on SpaceX Starship?', conversationId });
    const events = parseSse(r.text);
    const src = events.find((e) => e.event === 'sources')?.data as any;
    const done = events.find((e) => e.event === 'done')?.data as any;
    assert(done, 'no done event');
    return src ? `${src.sources.length} sources, first: ${src.sources[0]?.url}` : 'no sources (is TAVILY_API_KEY set?)';
  });

  await step('learn action: simplify', async () => {
    const r = await call('POST', '/api/chat', { action: 'simplify', conversationId, stream: false });
    assert(r.status === 200, `status ${r.status}`);
    return `provider=${r.json.provider} chars=${r.json.assistantMessage.content.length}`;
  });

  await step('history reload', async () => {
    const r = await call('GET', `/api/conversations/${conversationId}/messages`);
    assert(r.json?.messages?.length === 6, `expected 6 messages, got ${r.json?.messages?.length}`);
  });

  await step('quiz', async () => {
    const r = await call('POST', '/api/learn/quiz', { conversationId, count: 3 });
    assert(r.status === 200 && r.json.questions.length === 3, `status ${r.status}`);
    return `provider=${r.json.provider} first="${r.json.questions[0].question}"`;
  });

  await step('profile edit and clear', async () => {
    const put = await call('PUT', '/api/profile', { tone: 'formal' });
    assert(put.json?.profile?.tone === 'formal', 'tone not saved');
    const del = await call('DELETE', '/api/profile?history=true');
    assert(del.json?.onboarding?.status === 'not_started', 'not reset');
  });

  console.log(failures ? `\n${failures} step(s) failed` : '\nAll steps passed');
  process.exit(failures ? 1 : 0);
}

main();
