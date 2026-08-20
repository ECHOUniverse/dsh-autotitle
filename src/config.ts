/**
 * Plugin configuration schema for `@hanxu131/dsh-autotitle`.
 * Defaults mirror AutoTitle_Pi so behaviour stays aligned across hosts.
 */
import z from '@deepseek-ai/schemastery'

/** Title language policy. */
export type Language = 'follow' | 'zh' | 'en'

/** Validated plugin configuration. */
export interface Config {
  /** Maximum title length in characters (prompt constraint, not a hard truncation). */
  maxLength: number
  /** Optional `[Type]` prefix policy. */
  prefix: {
    enabled: boolean
    types: string[]
  }
  /** Output language for the generated title. */
  language: Language
  /** Long-conversation trimming policy. */
  trim: {
    threshold: number
    window: number
    anchorChars: number
  }
  /** When true and a userQuestions provider is active, ask before applying. */
  confirm: boolean
  /** Max tokens for the auxiliary title LLM call. */
  maxOutputTokens: number
  /** Timeout for the title LLM call in milliseconds. */
  timeoutMs: number
}

/** Cordis / Schemastery schema with defaults applied at load time. */
export const Config: z<Config> = z.object({
  maxLength: z.number().step(1).min(1).default(60),
  prefix: z
    .object({
      enabled: z.boolean().default(true),
      types: z
        .array(z.string())
        .default(['Bug', 'Feature', 'Question', 'Refactor', 'Docs']),
    })
    .default({
      enabled: true,
      types: ['Bug', 'Feature', 'Question', 'Refactor', 'Docs'],
    }),
  language: z.union(['follow', 'zh', 'en']).default('follow'),
  trim: z
    .object({
      threshold: z.number().step(1).min(1).default(15_000),
      window: z.number().step(1).min(1).default(8_000),
      anchorChars: z.number().step(1).min(1).default(500),
    })
    .default({
      threshold: 15_000,
      window: 8_000,
      anchorChars: 500,
    }),
  confirm: z.boolean().default(true),
  maxOutputTokens: z.number().step(1).min(1).default(64),
  timeoutMs: z.number().step(1).min(1).default(30_000),
})
