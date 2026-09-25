/**
 * Mirrors @hanxu131/dshacp 0.2.1 lib/elicitation-map.js
 * (mapUserQuestionsToElicitation, consumed by bridge.js askViaElicitation)
 * to document ACP display behavior.
 *
 * Actual dshacp 0.2.1 mapping rules:
 * - message: per-question `detail ?? question`, joined with `\n\n`
 *   (when `detail` exists, `question` is NOT shown on the ACP side at all)
 * - field title: `header`
 * - field description: omitted when the question has options; otherwise the
 *   same body text used for the message (`detail ?? question`)
 * - options → string enum; multiSelect → array of string enum
 * Run: node tests/acp-elicitation-mapping.test.mjs
 */
import assert from 'node:assert/strict'

/** Same mapping as @hanxu131/dshacp 0.2.1 lib/elicitation-map.js */
const mapUserQuestionsToElicitation = (questions) => {
  const properties = {}
  const required = []
  const messageParts = []
  for (const [index, question] of questions.entries()) {
    const key = `q${index}`
    const labels = question.options?.map((option) => option.label) ?? []
    const messageBody = question.detail ?? question.question
    messageParts.push(messageBody)
    const fieldTitle = question.header
    const fieldDescription = labels.length > 0 ? undefined : messageBody
    const base = {}
    if (fieldTitle !== undefined) base.title = fieldTitle
    if (fieldDescription !== undefined) base.description = fieldDescription
    if (question.multiSelect === true) {
      properties[key] = { type: 'array', ...base, items: { type: 'string', enum: labels } }
    } else if (labels.length > 0) {
      properties[key] = { type: 'string', ...base, enum: labels }
    } else {
      properties[key] = { type: 'string', ...base }
    }
    required.push(key)
  }
  return {
    message: messageParts.join('\n\n'),
    schema: { type: 'object', properties, required },
  }
}

// Fixtures mirror src/confirm.ts buildConfirmQuestionItem / buildErrorQuestionItem
const confirmPayload = {
  id: 'autotitle-confirm',
  header: '会话标题',
  question: '是否使用这个会话标题？',
  detail: '生成的标题：【Refactor】示例\n\n请选择操作，或在下方输入自定义标题后提交',
  options: [{ label: '接受此标题' }, { label: '重新生成' }, { label: '取消' }],
}

const errorPayload = {
  id: 'autotitle-error',
  header: '标题生成失败',
  question: '标题生成失败，要重试吗？',
  detail: '失败原因：boom\n\n请选择操作',
  options: [{ label: '重试' }, { label: '取消' }],
}

const freeTextPayload = {
  id: 'custom',
  header: '自定义标题',
  question: '请输入自定义标题',
}

// Confirm: message is detail (question is NOT shown on the ACP side)
{
  const { message, schema } = mapUserQuestionsToElicitation([confirmPayload])
  assert.equal(message, confirmPayload.detail)
  assert.equal(message.includes('生成的标题：【Refactor】示例'), true)
  assert.equal(message.includes(confirmPayload.question), false)
  // Field: title = header; options present → no description
  assert.equal(schema.properties.q0.title, '会话标题')
  assert.equal(schema.properties.q0.description, undefined)
  assert.deepEqual(schema.properties.q0.enum, ['接受此标题', '重新生成', '取消'])
  assert.deepEqual(schema.required, ['q0'])
}

// Error: same rules — detail wins, header is the field title, no description
{
  const { message, schema } = mapUserQuestionsToElicitation([errorPayload])
  assert.equal(message, '失败原因：boom\n\n请选择操作')
  assert.equal(schema.properties.q0.title, '标题生成失败')
  assert.equal(schema.properties.q0.description, undefined)
}

// Free text (no options): description falls back to detail ?? question
{
  const { message, schema } = mapUserQuestionsToElicitation([freeTextPayload])
  assert.equal(message, '请输入自定义标题')
  assert.equal(schema.properties.q0.title, '自定义标题')
  assert.equal(schema.properties.q0.description, '请输入自定义标题')
  assert.equal(schema.properties.q0.enum, undefined)
}

// Multiple questions: message parts joined with `\n\n`
{
  const { message } = mapUserQuestionsToElicitation([confirmPayload, errorPayload])
  assert.equal(message, `${confirmPayload.detail}\n\n${errorPayload.detail}`)
}

console.log('acp-elicitation-mapping.test.mjs: all assertions passed')
console.log(JSON.stringify({
  confirm: mapUserQuestionsToElicitation([confirmPayload]),
}, null, 2))
