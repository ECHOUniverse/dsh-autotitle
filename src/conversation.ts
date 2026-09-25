/**
 * Extract user/assistant text from a session's derived messages and trim long threads.
 */
import type { Message } from '@deepseek-ai/dsh-llm'
import type { Config } from './config.ts'

/** One text-bearing conversation turn used for title generation. */
export interface TextMessage {
  role: 'user' | 'assistant'
  text: string
}

const roleLabel = (role: 'user' | 'assistant'): string =>
  role === 'user' ? 'User' : 'Assistant'

/** Rough token estimate aligned with Pi's length/4 heuristic. */
export const estimateTextTokens = (text: string): number => Math.ceil(text.length / 4)

/**
 * Collect user + assistant text blocks from the session's derived messages.
 * Tool calls, tool results, system messages, and non-text blocks are skipped.
 */
export const extractTextMessages = (input: readonly Message[]): TextMessage[] => {
  const messages: TextMessage[] = []

  for (const message of input) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue
    }

    const textParts: string[] = []
    for (const block of message.content) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
        textParts.push(block.text)
      }
    }

    const text = textParts.join('\n').trim()
    if (text.length === 0) {
      continue
    }

    messages.push({ role: message.role, text })
  }

  return messages
}

/** Format messages as a plain transcript for the title prompt. */
export const formatConversationText = (messages: readonly TextMessage[]): string =>
  messages.map((message) => `${roleLabel(message.role)}: ${message.text}`).join('\n\n')

/**
 * Keep the first user message as a topic anchor and the most recent `window`
 * tokens; omit the middle with a placeholder line.
 */
export const trimConversation = (messages: readonly TextMessage[], cfg: Config): string => {
  if (messages.length === 0) {
    return ''
  }

  const anchor = messages[0]!
  const anchorText =
    anchor.text.length > cfg.trim.anchorChars
      ? anchor.text.slice(0, cfg.trim.anchorChars)
      : anchor.text

  // Walk newest → oldest, keeping messages that fit in the window budget.
  const windowMessages: TextMessage[] = []
  let budget = cfg.trim.window
  for (let index = messages.length - 1; index >= 1; index -= 1) {
    const message = messages[index]!
    const tokens = estimateTextTokens(message.text)
    if (tokens > budget && windowMessages.length > 0) {
      break
    }
    if (tokens > budget) {
      // Single oversized recent message: keep a truncated tail.
      const chars = Math.max(1, budget * 4)
      windowMessages.unshift({
        role: message.role,
        text: message.text.slice(-chars),
      })
      break
    }
    windowMessages.unshift(message)
    budget -= tokens
  }

  const omittedCount = Math.max(0, messages.length - 1 - windowMessages.length)

  const parts: string[] = [`${roleLabel(anchor.role)}: ${anchorText}`]
  if (omittedCount > 0) {
    parts.push(`[... ${omittedCount} messages omitted ...]`)
  }
  for (const message of windowMessages) {
    parts.push(`${roleLabel(message.role)}: ${message.text}`)
  }

  return parts.join('\n\n')
}

/**
 * Build the conversation excerpt sent to the model, trimming when over threshold.
 * @returns the excerpt text, or `undefined` when there is nothing to summarize.
 */
export const buildConversationExcerpt = (
  input: readonly Message[],
  cfg: Config,
): { text: string; trimmed: boolean } | undefined => {
  const messages = extractTextMessages(input)
  if (messages.length === 0) {
    return undefined
  }

  const totalTokens = messages.reduce((sum, message) => sum + estimateTextTokens(message.text), 0)
  const trimmed = totalTokens > cfg.trim.threshold
  const text = trimmed ? trimConversation(messages, cfg) : formatConversationText(messages)
  if (!text.trim()) {
    return undefined
  }

  return { text, trimmed }
}
