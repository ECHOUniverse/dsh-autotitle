/**
 * Build the title prompt and call the LLM to generate a session title.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { foldRequestHeader } from '@deepseek-ai/dsh-session'
import { normalizeSessionTitle } from '@deepseek-ai/dsh-session-title'
import type { Config } from './config.ts'

export type TitleResult = { ok: true; title: string } | { ok: false; error: string }

const TITLE_TIMEOUT_CODE = 'AUTOTITLE_TIMEOUT'

/** Build the Chinese instruction prompt wrapping the conversation excerpt. */
export const buildPrompt = (conversationText: string, cfg: Config): string => {
  const lines: string[] = [
    '你是会话标题生成器。根据以下对话内容生成一个清晰明了的会话标题。',
    '',
    '要求:',
  ]

  if (cfg.language === 'follow') {
    lines.push('1. 使用对话中使用最多的语言(中文对话用中文,英文对话用英文)')
  } else {
    lines.push(`1. 使用${cfg.language}输出标题`)
  }

  lines.push(`2. 长度不超过 ${cfg.maxLength} 个字符,单行,结尾不加标点`)

  if (cfg.prefix.enabled && cfg.prefix.types.length > 0) {
    lines.push(
      `3. 如能明确判断会话类型,以 [类型] 开头,类型从以下列表选择:${cfg.prefix.types.join('/')}`,
    )
    lines.push('   无法明确判断时省略前缀')
    lines.push('4. 标题应概括会话的目标或主题,而不是罗列细节')
    lines.push('5. 只输出标题本身,不要任何解释')
  } else {
    lines.push('3. 标题应概括会话的目标或主题,而不是罗列细节')
    lines.push('4. 只输出标题本身,不要任何解释')
  }

  lines.push('', '<conversation>', conversationText, '</conversation>')
  return lines.join('\n')
}

/** Reject empty / whitespace-only / garbage model output before rename. */
export const isValidTitle = (text: string): boolean => {
  if (!text) {
    return false
  }
  if (text.replace(/\s+/g, '').length === 0) {
    return false
  }
  if (text.includes('\uFFFD')) {
    return false
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    return false
  }
  return true
}

/** Resolve provider/model from the live agent options, falling back to the logged request header. */
export const resolveRoute = (
  agent: Agent,
): { provider: string; model: string } | undefined => {
  const fromOptions = agent.options
  if (
    typeof fromOptions.provider === 'string' &&
    fromOptions.provider.length > 0 &&
    typeof fromOptions.model === 'string' &&
    fromOptions.model.length > 0
  ) {
    return { provider: fromOptions.provider, model: fromOptions.model }
  }

  const header = foldRequestHeader(agent.session.events)
  const config = header?.config
  if (
    config !== undefined &&
    typeof config.provider === 'string' &&
    config.provider.length > 0 &&
    typeof config.model === 'string' &&
    config.model.length > 0
  ) {
    return { provider: config.provider, model: config.model }
  }

  return undefined
}

/** Fuse an upstream abort signal with a wall-clock timeout. */
const withTimeout = (
  upstream: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController()
  const onUpstreamAbort = () => {
    controller.abort(upstream?.reason)
  }
  if (upstream !== undefined) {
    if (upstream.aborted) {
      controller.abort(upstream.reason)
    } else {
      upstream.addEventListener('abort', onUpstreamAbort, { once: true })
    }
  }
  const timer = setTimeout(() => {
    const error = new Error(`title generation timed out after ${timeoutMs}ms`)
    ;(error as Error & { code?: string }).code = TITLE_TIMEOUT_CODE
    controller.abort(error)
  }, timeoutMs)

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      if (upstream !== undefined) {
        upstream.removeEventListener('abort', onUpstreamAbort)
      }
    },
  }
}

/**
 * Generate one title via an auxiliary LLM stream call.
 * Uses the agent's current route (or the last logged request header).
 */
export const generateTitle = async (
  ctx: Context,
  agent: Agent,
  conversationText: string,
  cfg: Config,
  signal: AbortSignal,
): Promise<TitleResult> => {
  const route = resolveRoute(agent)
  if (route === undefined) {
    return {
      ok: false,
      error: 'No model selected. Choose a model for this session first.',
    }
  }

  const prompt = buildPrompt(conversationText, cfg)
  const messages = [
    createUserMessage({
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'plugin', plugin: 'dsh-autotitle' },
    }),
  ]

  const timed = withTimeout(signal, cfg.timeoutMs)
  try {
    timed.signal.throwIfAborted()
    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream({
      provider: route.provider,
      model: route.model,
      messages,
      maxTokens: cfg.maxOutputTokens,
      sessionId: agent.session.id,
      purpose: 'session-title',
      signal: timed.signal,
    })) {
      timed.signal.throwIfAborted()
      assembler.push(chunk)
    }
    timed.signal.throwIfAborted()

    const finish = assembler.finish
    if (finish.kind === 'error' || finish.kind === 'aborted') {
      return { ok: false, error: finish.failure.message }
    }
    if (finish.kind === 'max-tokens') {
      // Partial text may still be usable; fall through and validate.
    } else if (finish.kind === 'tool-calls') {
      return { ok: false, error: 'Title model unexpectedly requested a tool' }
    }

    const blocks = assembler.blocks()
    if (blocks.some((block) => block.type === 'tool-call')) {
      return { ok: false, error: 'Title output must contain text only' }
    }

    const raw = blocks
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    const title = normalizeSessionTitle(raw, Number.MAX_SAFE_INTEGER)
    if (!isValidTitle(title)) {
      return { ok: false, error: 'Model returned an empty or invalid title' }
    }

    return { ok: true, title }
  } catch (error) {
    if (signal.aborted || timed.signal.aborted) {
      const reason = timed.signal.reason ?? signal.reason
      if (reason instanceof Error && (reason as Error & { code?: string }).code === TITLE_TIMEOUT_CODE) {
        return { ok: false, error: reason.message }
      }
      return { ok: false, error: 'Title generation cancelled' }
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    timed.dispose()
  }
}
