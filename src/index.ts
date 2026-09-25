/**
 * `@hanxu131/dsh-autotitle` — slash command `/title` for DeepSeek Harness.
 *
 * Named exports are required so the Cordis loader retains `inject` and `Config`.
 *
 * @module @hanxu131/dsh-autotitle
 */
import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import {
  SessionTitleInvalidError,
} from '@deepseek-ai/dsh-session-title'
import type { Config } from './config.ts'
import { buildConversationExcerpt } from './conversation.ts'
import { askConfirmTitle, askRetryAfterError } from './confirm.ts'
import { generateTitle } from './generate.ts'

export const name = 'autotitle'

export const inject = ['commands', 'sessionTitle', 'llm', 'userQuestions'] as const

export { Config } from './config.ts'

/** Apply a title through the durable session-title service. */
const renameSession = (ctx: Context, invocation: CommandInvocation, title: string): CommandResult => {
  try {
    ctx.sessionTitle.rename(invocation.agent.session, title)
    return {
      kind: 'success',
      text: `Session titled: ${title}`,
    }
  } catch (error) {
    if (error instanceof SessionTitleInvalidError) {
      return {
        kind: 'error',
        text: `Invalid title: ${error.message}`,
      }
    }
    throw error
  }
}

/** Full generate → optional confirm → rename flow for a bare `/title`. */
const runAutoTitle = async (
  ctx: Context,
  config: Config,
  invocation: CommandInvocation,
): Promise<CommandResult> => {
  const excerpt = buildConversationExcerpt(invocation.agent.session.deriveMessages(), config)
  if (excerpt === undefined) {
    return {
      kind: 'error',
      text: 'No conversation content to summarize',
    }
  }

  const interactive = config.confirm

  for (;;) {
    invocation.signal.throwIfAborted()

    const result = await generateTitle(
      ctx,
      invocation.agent,
      excerpt.text,
      config,
      invocation.signal,
    )

    if (!result.ok) {
      if (!interactive) {
        return {
          kind: 'error',
          text: `Failed to generate title: ${result.error}`,
        }
      }

      const action = await askRetryAfterError(
        ctx,
        invocation.agent,
        result.error,
        invocation.signal,
      )
      if (action === 'unavailable') {
        return {
          kind: 'error',
          text: `Failed to generate title: ${result.error}`,
        }
      }
      if (action === 'retry') {
        continue
      }
      return {
        kind: 'success',
        text: 'Title generation cancelled; existing title unchanged.',
      }
    }

    if (!interactive) {
      return renameSession(ctx, invocation, result.title)
    }

    const action = await askConfirmTitle(
      ctx,
      invocation.agent,
      result.title,
      invocation.signal,
    )

    switch (action.kind) {
      case 'unavailable':
        // No UI provider (ACP / headless) — apply directly, same as Pi non-TUI.
        return renameSession(ctx, invocation, result.title)
      case 'accept':
        return renameSession(ctx, invocation, action.title)
      case 'retry':
        continue
      case 'cancel':
        return {
          kind: 'success',
          text: 'Title generation cancelled; existing title unchanged.',
        }
    }
  }
}

/**
 * Register `/title` on the shared human-command registry.
 * @param ctx - Cordis context with commands, sessionTitle, llm, userQuestions.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const active = new Set<Promise<CommandResult>>()

  const handler = (invocation: CommandInvocation): Promise<CommandResult> => {
    const operation = (async (): Promise<CommandResult> => {
      try {
        const custom = invocation.rawInput.trim()
        if (custom.length > 0) {
          return renameSession(ctx, invocation, custom)
        }
        return await runAutoTitle(ctx, config, invocation)
      } catch (error) {
        if (invocation.signal.aborted) {
          return {
            kind: 'error',
            text: 'Title generation cancelled.',
          }
        }
        throw error
      }
    })()

    active.add(operation)
    const retire = () => {
      active.delete(operation)
    }
    operation.then(retire, retire)
    return operation
  }

  ctx.effect(function* () {
    yield async () => {
      await Promise.allSettled(active)
    }
    yield ctx.commands.register({
      name: 'title',
      description: 'Generate a session title from the conversation (usage: /title [custom name])',
      input: {
        hint: '[custom name]',
      },
      handler,
    })
  }, 'autotitle lifecycle')
}
