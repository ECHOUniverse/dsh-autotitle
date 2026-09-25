/**
 * Mirrors dshacp askViaElicitation field mapping (bridge.js) to document ACP display behavior.
 * Run: node tests/acp-elicitation-mapping.test.mjs
 */
import assert from 'node:assert/strict'

/** Same mapping as @hanxu131/dshacp lib/bridge.js askViaElicitation */
const mapToAcpForm = (questions) => {
  const properties = {}
  const required = []
  for (const [index, question] of questions.entries()) {
    const key = `q${index}`
    const description = question.detail !== undefined
      ? `${question.question}\n\n${question.detail}`
      : question.question
    const labels = question.options?.map((option) => option.label) ?? []
    if (question.multiSelect === true) {
      properties[key] = { type: 'array', description, items: { type: 'string', enum: labels } }
    } else if (labels.length > 0) {
      properties[key] = { type: 'string', description, enum: labels }
    } else {
      properties[key] = { type: 'string', description }
    }
    required.push(key)
  }
  const message = questions.map((question) => question.question).join(' ')
  return { message, properties, required }
}

const legacyPayload = {
  id: 'autotitle-confirm',
  header: '会话标题',
  question: '生成的标题：【Refactor】示例\n请选择操作，或在下方输入自定义标题后提交',
  options: [{ label: '接受此标题' }, { label: '重新生成' }, { label: '取消' }],
}

const fixedPayload = {
  id: 'autotitle-confirm',
  header: '会话标题',
  question: '会话标题',
  detail: '生成的标题：【Refactor】示例\n\n请选择操作，或在下方输入自定义标题后提交',
  options: [{ label: '接受此标题' }, { label: '重新生成' }, { label: '取消' }],
}

const legacy = mapToAcpForm([legacyPayload])
const fixed = mapToAcpForm([fixedPayload])

// Legacy: message and description were identical (full duplicate in UI)
assert.equal(legacy.message, legacy.properties.q0.description)

// Fixed: message is short; title lives only in detail / field description
assert.equal(fixed.message, '会话标题')
assert.equal(fixed.properties.q0.description.includes('生成的标题：【Refactor】示例'), true)
assert.notEqual(fixed.message, fixed.properties.q0.description)
assert.equal(fixed.message.includes('生成的标题'), false)

console.log('acp-elicitation-mapping.test.mjs: all assertions passed')
console.log(JSON.stringify({
  legacy: { message: legacy.message, description: legacy.properties.q0.description },
  fixed: { message: fixed.message, description: fixed.properties.q0.description },
}, null, 2))
