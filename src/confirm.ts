/**
 * Optional confirm / regenerate / cancel loop via `ctx.userQuestions`.
 * When no UI provider is registered (ACP, headless), callers skip this path.
 *
 * Web UI notes (dsh-client-ui-user-questions QuestionComposer):
 * - Option numbers 1..N are visual only; digit keys are NOT wired as shortcuts
 *   (platform limitation — host plugins cannot add them).
 * - Prefer a single `label` (no `description`); label+description share one flex line.
 * - Avoid wrapping detail in backticks — MarkdownText renders that as a code pill.
 * - Use `\n\n` between detail lines: MarkdownText is CommonMark, so a single
 *   `\n` collapses to a space and the hint line glues onto the title.
 * - Field roles follow the official QuestionComposer standard (dsh 0.1.7-rc.2):
 *   `header` is an 11px gray eyebrow (short category word), `question` is the
 *   16px/500 visual main title and should be a standalone, complete question
 *   (cf. the official exit_plan_mode: header="Plan review",
 *   question="Approve this plan and leave plan mode?"), and `detail` is the
 *   full GFM Markdown body.
 * - DSHACP 0.2.1 constraint (lib/elicitation-map.js): the elicitation message
 *   uses `detail ?? question` per item (joined with `\n\n`), so when `detail`
 *   exists `question` is NOT shown on the ACP side at all. The generated title
 *   must therefore stay in `detail`, while `question` remains a short prompt
 *   that only the Web UI renders.
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

/** Eyebrow labels (QuestionComposer `header` / DSHACP field title). */
const CONFIRM_HEADER = '会话标题'
const ERROR_HEADER = '标题生成失败'

/**
 * Standalone questions for the 16px/500 main title slot (official standard:
 * a complete question, e.g. exit_plan_mode's "Approve this plan and leave
 * plan mode?"). DSHACP 0.2.1 never renders these because `detail` is set.
 */
const CONFIRM_QUESTION = '是否使用这个会话标题？'
const ERROR_QUESTION = '标题生成失败，要重试吗？'

/**
 * Build a user-questions item that renders cleanly in both Web UI and DSHACP.
 *
 * Web UI: `header` is the eyebrow, `question` the main title, `detail` the
 * Markdown body. DSHACP 0.2.1: the elicitation message is `detail ?? question`
 * and the field title is `header`, so the generated title must live in
 * `detail` (otherwise the ACP client never sees it).
 */
const buildConfirmQuestionItem = (shown: string) => ({
  id: 'autotitle-confirm',
  header: CONFIRM_HEADER,
  question: CONFIRM_QUESTION,
  detail: `生成的标题：${shown}\n\n请选择操作，或在下方输入自定义标题后提交`,
  options: [
    { label: LABEL_ACCEPT },
    { label: LABEL_REGENERATE },
    { label: LABEL_CANCEL },
  ],
})

const buildErrorQuestionItem = (message: string) => ({
  id: 'autotitle-error',
  header: ERROR_HEADER,
  question: ERROR_QUESTION,
  detail: `失败原因：${displayTitle(message)}\n\n请选择操作`,
  options: [
    { label: LABEL_RETRY },
    { label: LABEL_RETRY_CANCEL },
  ],
})

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
      questions: [buildConfirmQuestionItem(shown)],
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
      questions: [buildErrorQuestionItem(message)],
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
