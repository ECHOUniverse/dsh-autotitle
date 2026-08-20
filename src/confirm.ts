/**
 * Optional confirm / regenerate / cancel loop via `ctx.userQuestions`.
 * When no UI provider is registered (ACP, headless), callers skip this path.
 *
 * Web UI notes (dsh-client-ui-user-questions QuestionComposer):
 * - Option numbers 1..N are visual only; digit keys are NOT wired as shortcuts
 *   (platform limitation — host plugins cannot add them).
 * - Prefer a single `label` (no `description`); label+description share one flex line.
 * - Avoid wrapping detail in backticks — MarkdownText renders that as a code pill.
 * - Put the generated title in `question` so it shares heading padding with the UI.
 * - Typing in the free-text row clears the selected option and submits as `custom`.
 */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'

export type ConfirmAction =
  | { kind: 'accept'; title: string }
  | { kind: 'retry' }
  | { kind: 'cancel' }
  | { kind: 'unavailable' }

const LABEL_ACCEPT = '接受此标题'
const LABEL_REGENERATE = '重新生成'
const LABEL_CANCEL = '取消'
const LABEL_RETRY = '重试'
const LABEL_RETRY_CANCEL = '取消'

/**
 * Soft-escape Markdown so `[Docs]` prefixes stay literal without a code-pill wrap.
 * Fullwidth brackets avoid CommonMark link-reference parsing.
 */
const displayTitle = (text: string): string =>
  text.replace(/^\[([^\]]+)\]/, '【$1】').replace(/`/g, "'")

/**
 * Ask the user what to do with a successfully generated title.
 * Custom title: type into the free-text row (clears the radio selection) and submit.
 */
export const askConfirmTitle = async (
  ctx: Context,
  agent: Agent,
  title: string,
  signal: AbortSignal,
): Promise<ConfirmAction> => {
  try {
    const shown = displayTitle(title)
    const answer = await ctx.userQuestions.ask({
      agent,
      signal,
      questions: [
        {
          id: 'autotitle-confirm',
          header: '会话标题',
          question: `生成的标题：${shown}\n请选择操作，或在下方输入自定义标题后提交`,
          options: [
            { label: LABEL_ACCEPT },
            { label: LABEL_REGENERATE },
            { label: LABEL_CANCEL },
          ],
        },
      ],
    })

    const item = answer.answers.find((entry) => entry.id === 'autotitle-confirm')
    if (item === undefined) {
      return { kind: 'cancel' }
    }

    const custom = item.custom?.trim()
    if (custom !== undefined && custom.length > 0) {
      return { kind: 'accept', title: custom }
    }

    const selected = item.selected[0]
    if (selected === LABEL_ACCEPT) {
      return { kind: 'accept', title }
    }
    if (selected === LABEL_REGENERATE) {
      return { kind: 'retry' }
    }
    return { kind: 'cancel' }
  } catch (error) {
    if (error instanceof UserQuestionError && error.code === 'NO_PROVIDER') {
      return { kind: 'unavailable' }
    }
    if (error instanceof UserQuestionError && error.code === 'ASK_ABORTED') {
      return { kind: 'cancel' }
    }
    throw error
  }
}

/**
 * Ask whether to retry after a generation failure.
 */
export const askRetryAfterError = async (
  ctx: Context,
  agent: Agent,
  message: string,
  signal: AbortSignal,
): Promise<'retry' | 'cancel' | 'unavailable'> => {
  try {
    const answer = await ctx.userQuestions.ask({
      agent,
      signal,
      questions: [
        {
          id: 'autotitle-error',
          header: '标题生成失败',
          question: `失败原因：${displayTitle(message)}\n请选择操作`,
          options: [
            { label: LABEL_RETRY },
            { label: LABEL_RETRY_CANCEL },
          ],
        },
      ],
    })

    const item = answer.answers.find((entry) => entry.id === 'autotitle-error')
    if (item?.selected[0] === LABEL_RETRY) {
      return 'retry'
    }
    return 'cancel'
  } catch (error) {
    if (error instanceof UserQuestionError && error.code === 'NO_PROVIDER') {
      return 'unavailable'
    }
    if (error instanceof UserQuestionError && error.code === 'ASK_ABORTED') {
      return 'cancel'
    }
    throw error
  }
}
