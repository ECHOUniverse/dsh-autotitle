/**
 * Lightweight unit checks for conversation extract/trim (no Cordis runtime).
 * Run: node tests/conversation.test.mjs
 */
import assert from 'node:assert/strict'

const {
  estimateTextTokens,
  formatConversationText,
  trimConversation,
  extractTextMessages,
  buildConversationExcerpt,
} = await import('../lib/conversation.js')

const cfg = {
  maxLength: 60,
  prefix: { enabled: true, types: ['Bug'] },
  language: 'follow',
  // Small window so the middle message is dropped.
  trim: { threshold: 100, window: 5, anchorChars: 20 },
  confirm: true,
  maxOutputTokens: 64,
  timeoutMs: 30_000,
}

assert.equal(estimateTextTokens('abcd'), 1)
assert.equal(estimateTextTokens('abcdefgh'), 2)

const formatted = formatConversationText([
  { role: 'user', text: 'hello' },
  { role: 'assistant', text: 'world' },
])
assert.equal(formatted, 'User: hello\n\nAssistant: world')

const long = 'x'.repeat(200)
const messages = [
  { role: 'user', text: long },
  { role: 'assistant', text: 'y'.repeat(80) }, // ~20 tokens — exceeds window alone after recent msgs
  { role: 'user', text: 'recent-a' },
  { role: 'assistant', text: 'recent-b' },
]
const trimmed = trimConversation(messages, cfg)
assert.match(trimmed, /^User: x{20}/)
assert.match(trimmed, /messages omitted/)
assert.match(trimmed, /Assistant: recent-b/)
assert.doesNotMatch(trimmed, /yyyy/)

assert.equal(buildConversationExcerpt([], cfg), undefined)
assert.deepEqual(extractTextMessages([]), [])

// Below threshold → no trim marker
const shortCfg = { ...cfg, trim: { ...cfg.trim, threshold: 1_000_000 } }
const excerpt = buildConversationExcerpt([], shortCfg)
assert.equal(excerpt, undefined)

// Message-shaped fixtures (dsh-llm Message: role + content blocks)
const message = (role, text) => ({ role, content: [{ type: 'text', text }] })
const fixture = [
  message('user', 'hello there'),
  { role: 'assistant', content: [{ type: 'tool-call', id: 't1', name: 'noop', input: {} }] },
  message('assistant', 'hi!'),
  { role: 'system', content: [{ type: 'text', text: 'system prompt' }] },
  { role: 'user', content: [{ type: 'text', text: '   ' }] },
]

assert.deepEqual(extractTextMessages(fixture), [
  { role: 'user', text: 'hello there' },
  { role: 'assistant', text: 'hi!' },
])

const fixtureExcerpt = buildConversationExcerpt(fixture, shortCfg)
assert.ok(fixtureExcerpt)
assert.equal(fixtureExcerpt.trimmed, false)
assert.match(fixtureExcerpt.text, /User: hello there/)
assert.match(fixtureExcerpt.text, /Assistant: hi!/)

console.log('conversation.test.mjs: ok')
