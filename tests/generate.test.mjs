/**
 * Regression tests for generateTitle (no Cordis runtime).
 * Mock ctx.llm.stream as an async generator feeding BlockAssembler chunks.
 * Run: npm run build && node --test tests/generate.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { generateTitle } = await import('../lib/generate.js')

const cfg = {
  maxLength: 60,
  prefix: { enabled: true, types: ['Bug'] },
  language: 'follow',
  trim: { threshold: 15_000, window: 8_000, anchorChars: 500 },
  confirm: true,
  maxOutputTokens: 512,
  timeoutMs: 30_000,
}

const fakeAgent = {
  options: { provider: 'mock', model: 'mock-reasoner' },
  session: { id: 'mock-session', requestHeader: () => undefined },
}

/** Build a mock ctx whose stream records each call's options and replays canned responses. */
const makeCtx = (responses) => {
  const calls = []
  return {
    calls,
    ctx: {
      llm: {
        stream: async function* (options) {
          calls.push(options)
          const response = responses[calls.length - 1]
          if (response.throw !== undefined) throw response.throw
          for (const chunk of response.chunks) yield chunk
        },
      },
    },
  }
}

const textChunks = (text, finishKind) => [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'usage', usage: { inputTokens: 120, outputTokens: 8 } },
  { type: 'finish', reason: { kind: finishKind } },
]

/**
 * Terminal finish chunk as normalized by adapterStream: adapter failures are
 * never thrown, they surface as {type:'finish', reason:{kind, failure}}.
 * BlockAssembler.push reads `chunk.reason` (dsh-llm/lib/types/assembler.js:77-80).
 */
const finishErrorChunk = (message, code) => [
  { type: 'finish', reason: { kind: 'error', failure: { message, code } } },
]

const finishAbortedChunk = (message) => [
  { type: 'finish', reason: { kind: 'aborted', failure: { message, code: 'ABORTED' } } },
]

const reasoningOnlyChunks = (text, finishKind) => [
  { type: 'block-start', index: 0, blockType: 'reasoning' },
  { type: 'reasoning-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'reasoning', text } },
  { type: 'usage', usage: { inputTokens: 120, outputTokens: 512, reasoningTokens: 512 } },
  { type: 'finish', reason: { kind: finishKind } },
]

/**
 * Error shaped like the adapter's LlmError: message + stable code, thrown
 * before any chunk. Only contract-violating third-party adapters do this;
 * spec adapters normalize failures to a terminal error finish chunk.
 */
const unsupportedEffortError = () => {
  const error = new Error(
    'pi-ai provider "mock" model "mock-reasoner" does not support reasoning effort "off"',
  )
  error.name = 'LlmError'
  error.code = 'UNSUPPORTED_REASONING_EFFORT'
  return error
}

const signal = () => new AbortController().signal

test('a. pure text stream succeeds and requests reasoningEffort "off"', async () => {
  const { calls, ctx } = makeCtx([{ chunks: textChunks('[Bug] 空标题修复', 'stop') }])
  const result = await generateTitle(ctx, fakeAgent, '对话摘录', cfg, signal())
  assert.deepEqual(result, { ok: true, title: '[Bug] 空标题修复' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].reasoningEffort, 'off')
})

test('b. reasoning burns the budget to max-tokens with no text: explicit diagnostic', async () => {
  const { calls, ctx } = makeCtx([
    { chunks: reasoningOnlyChunks('还在思考如何概括对话……', 'max-tokens') },
  ])
  const result = await generateTitle(ctx, fakeAgent, '对话摘录', cfg, signal())
  assert.equal(result.ok, false)
  assert.match(result.error, /token/i)
  assert.match(result.error, /reasoning/i)
  assert.notEqual(result.error, 'Model returned an empty or invalid title')
  assert.equal(calls.length, 1)
})

test('c. UNSUPPORTED_REASONING_EFFORT finish chunk retries once without the field', async () => {
  // Real adapter behavior (observed on kimi-coding/k3): the rejection is a
  // terminal error finish chunk, not a thrown error.
  const { calls, ctx } = makeCtx([
    {
      chunks: finishErrorChunk(
        'provider "kimi-coding" model "k3" does not support reasoning effort "off"',
        'UNSUPPORTED_REASONING_EFFORT',
      ),
    },
    { chunks: textChunks('[Bug] 自动标题', 'stop') },
  ])
  const result = await generateTitle(ctx, fakeAgent, '对话摘录', cfg, signal())
  assert.deepEqual(result, { ok: true, title: '[Bug] 自动标题' })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].reasoningEffort, 'off')
  assert.equal('reasoningEffort' in calls[1], false)
})

test('c2. non-effort finish errors are not retried', async () => {
  const { calls, ctx } = makeCtx([
    { chunks: finishErrorChunk('rate limit exceeded, try again later', 'RATE_LIMIT') },
  ])
  const result = await generateTitle(ctx, fakeAgent, '对话摘录', cfg, signal())
  assert.deepEqual(result, { ok: false, error: 'rate limit exceeded, try again later' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].reasoningEffort, 'off')
})

test('c3. aborted finish is never retried', async () => {
  const { calls, ctx } = makeCtx([{ chunks: finishAbortedChunk('stream aborted by provider') }])
  const result = await generateTitle(ctx, fakeAgent, '对话摘录', cfg, signal())
  assert.deepEqual(result, { ok: false, error: 'stream aborted by provider' })
  assert.equal(calls.length, 1)
})

test('c4. thrown UNSUPPORTED_REASONING_EFFORT still retries (defensive path)', async () => {
  const { calls, ctx } = makeCtx([
    { throw: unsupportedEffortError() },
    { chunks: textChunks('[Bug] 自动标题', 'stop') },
  ])
  const result = await generateTitle(ctx, fakeAgent, '对话摘录', cfg, signal())
  assert.deepEqual(result, { ok: true, title: '[Bug] 自动标题' })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].reasoningEffort, 'off')
  assert.equal('reasoningEffort' in calls[1], false)
})

test('d. supported effort with empty model text keeps the original error', async () => {
  const { calls, ctx } = makeCtx([{ chunks: textChunks('   ', 'stop') }])
  const result = await generateTitle(ctx, fakeAgent, '对话摘录', cfg, signal())
  assert.deepEqual(result, { ok: false, error: 'Model returned an empty or invalid title' })
  assert.equal(calls.length, 1)
})

test('c5. non-effort thrown errors are not retried', async () => {
  const failure = new Error('connection reset')
  const { calls, ctx } = makeCtx([{ throw: failure }])
  const result = await generateTitle(ctx, fakeAgent, '对话摘录', cfg, signal())
  assert.deepEqual(result, { ok: false, error: 'connection reset' })
  assert.equal(calls.length, 1)
})
