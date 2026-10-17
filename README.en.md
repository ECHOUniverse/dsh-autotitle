# @hanxu131/dsh-autotitle

> A [DeepSeek Harness (DSH)](https://deepseek.com/harness/en/) plugin that adds the **`/title`** slash command: generate a session title from the current conversation, with smart trimming for long threads.

[中文](README.md) · [npm](https://www.npmjs.com/package/@hanxu131/dsh-autotitle) · [GitHub](https://github.com/ECHOUniverse/dsh-autotitle) · [Plugin docs](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)

---

## What is this?

In one line: **use `/title` to give the current session a clear display name.**

| Command | What it does |
| --- | --- |
| `/title` | Read the conversation → trim if long → generate with the current model → optional confirm on Web → set the session title |
| `/title My name` | Skip the model and set the session title to your text |

Works with:

- [DSH Web UI](https://deepseek.com/harness/en/) (`dsh web`)
- ACP / [DSHACP](https://github.com/ECHOUniverse/dshacp) (e.g. Zed)
- Any DSH profile that mounts the shared `commands` registry

---

## Prerequisites

1. [Node.js](https://nodejs.org/) (`^22.19` or `>=24` recommended)
2. A working DSH install:

```sh
dsh --version
# or
npx -p @deepseek-ai/dsh dsh --version
```

3. Know which **profile** you boot (`web`, `acp`, …). Plugins are installed **per profile**, not globally.

### Version compatibility

| Plugin version | Compatible DSH version |
| --- | --- |
| 0.2.2+ | `>=0.1.7-rc.2 <0.3.0` (includes 0.2.x prereleases) |
| 0.2.0–0.2.1 | `>=0.1.7-rc.2 <0.2.0` |
| 0.1.3 | DSH 0.1.0-rc.8 era (frozen legacy, no longer updated) |

DSH 0.1.7-rc.2 removed `Session.events` and the `plugin` message-source kind, so the two API eras are mutually incompatible. If you are still on an older DSH, stay on plugin 0.1.3.

From 0.2.2 the manifest declares `engines.dsh`, covering DSH 0.1.7-rc.2 and 0.2.x (0.2.1-rc.1 verified); 0.3 is out of scope.

---

## Install

Replace `web` with your profile name (e.g. `acp`):

```sh
dsh plugin --profile web add @hanxu131/dsh-autotitle
```

Without a global `dsh` binary:

```sh
npx -p @deepseek-ai/dsh dsh plugin --profile web add @hanxu131/dsh-autotitle
```

### Restart after install

| Frontend | Restart |
| --- | --- |
| Web UI | Stop and start `dsh web` again |
| DSHACP / Zed | Restart the ACP / `dsh --profile acp` process |

Then try `/title` in a session.

### Upgrade / remove

```sh
dsh plugin --profile web update @hanxu131/dsh-autotitle
dsh plugin --profile web remove @hanxu131/dsh-autotitle
```

---

## Usage

### Web UI confirm

With default `confirm: true`, Web shows:

1. **接受此标题** (Accept) — apply the generated title  
2. **重新生成** (Regenerate) — call the model again  
3. **取消** (Cancel) — keep the existing title  

Or type a custom title in the free-text field and submit.

> The numbers next to options are **visual only** — they are **not** keyboard shortcuts (DSH Web UI limitation). Click with the mouse.

### ACP / headless

Without a confirm UI, the generated title is applied **immediately**.

---

## Configuration (optional)

Defaults ship in [`cordis.patch.yml`](cordis.patch.yml). Override in your profile patch (e.g. `~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: autotitle
      name: '@hanxu131/dsh-autotitle'
      config:
        confirm: true
        maxLength: 60
        language: follow
        prefix:
          enabled: true
          types: [Bug, Feature, Question, Refactor, Docs]
        trim:
          threshold: 15000
          window: 8000
          anchorChars: 500
        maxOutputTokens: 512
        timeoutMs: 30000
```

| Key | Default | Meaning |
| --- | --- | --- |
| `maxLength` | `60` | Prompt hint for max title length |
| `prefix.enabled` | `true` | Allow prefixes like `[Bug]` |
| `prefix.types` | see above | Candidate prefix list |
| `language` | `follow` | `follow` / `zh` / `en` |
| `trim.threshold` | `15000` | Estimated tokens before trimming |
| `trim.window` | `8000` | Recent-token window after trim |
| `trim.anchorChars` | `500` | First user message anchor length |
| `confirm` | `true` | Ask when a confirm UI exists |
| `maxOutputTokens` | `512` | Max tokens for the title call |
| `timeoutMs` | `30000` | Generation timeout (ms) |

Trimming keeps the **first user message** (topic anchor) plus a **recent window**, with `[... N messages omitted ...]` in the middle.

---

## vs built-in auto titles

DSH’s first-prompt auto-titling (`dsh-session-title-first-prompt-llm`) names sessions from the first prompt. This plugin is a **manual** `/title` over the (trimmed) full conversation. They complement each other.

---

## Local development

```sh
git clone https://github.com/ECHOUniverse/dsh-autotitle.git
cd dsh-autotitle
pnpm install   # or npm install
pnpm build
dsh plugin --profile web add link:"$(pwd)"
```

Rebuild after changes and restart the DSH process.

---

## Links

| Resource | URL |
| --- | --- |
| npm | https://www.npmjs.com/package/@hanxu131/dsh-autotitle |
| GitHub | https://github.com/ECHOUniverse/dsh-autotitle |
| DeepSeek Harness | https://deepseek.com/harness/en/ |
| First plugin tutorial | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/ |
| Sister project (Pi) | https://www.npmjs.com/package/@hanxu131/pi-autotitle |
| DSHACP (Zed) | https://github.com/ECHOUniverse/dshacp |

## License

[MIT](LICENSE)
