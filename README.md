# @hanxu131/dsh-autotitle

> 给 [DeepSeek Harness（DSH）](https://deepseek.com/harness/zh/) 加一条斜杠命令 **`/title`**：根据当前对话生成会话标题，长对话会智能删减后再调用模型。

[English](README.en.md) · [npm](https://www.npmjs.com/package/@hanxu131/dsh-autotitle) · [GitHub](https://github.com/ECHOUniverse/dsh-autotitle) · [插件开发文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)

---

## 这是什么？

一句话：**用 `/title` 给当前会话起一个清楚的名字。**

| 命令 | 做什么 |
| --- | --- |
| `/title` | 读对话 →（太长就删减）→ 用当前模型生成标题 → Web 上可确认 → 写入会话标题 |
| `/title 我的标题` | 不调模型，直接把会话标题设成你写的名字 |

适用场景：

- [DSH Web UI](https://deepseek.com/harness/zh/)（`dsh web`）
- ACP / [DSHACP](https://github.com/ECHOUniverse/dshacp)（Zed 等客户端）
- 其他挂了 `commands` 注册表的 DSH profile

---

## 开始之前

1. 已安装 [Node.js](https://nodejs.org/)（建议 `^22.19` 或 `>=24`）
2. 能跑通 DSH，例如：

```sh
dsh --version
# 或
npx -p @deepseek-ai/dsh dsh --version
```

3. 想清楚你平时用哪个 **profile**（常见：`web`、`acp`）。插件要装进**你实际启动的那个 profile**，不会全局共享。

### 版本兼容性

| 插件版本 | 适配的 DSH 版本 |
| --- | --- |
| 0.2.0+ | `>=0.1.7-rc.2 <0.2.0` |
| 0.1.3 | DSH 0.1.0-rc.8 时代（旧版定格，不再更新） |

DSH 0.1.7-rc.2 移除了 `Session.events` 与消息来源的 `plugin` 类型，两个时代的 API 互不兼容。仍在使用旧版 DSH 的用户请停留在插件 0.1.3。

---

## 安装（推荐）

把下面的 `web` 换成你的 profile 名（例如 `acp`）：

```sh
dsh plugin --profile web add @hanxu131/dsh-autotitle
```

没有全局安装 `dsh` 时：

```sh
npx -p @deepseek-ai/dsh dsh plugin --profile web add @hanxu131/dsh-autotitle
```

### 装完必须重启

| 你用的前端 | 重启什么 |
| --- | --- |
| Web UI | 停掉再开 `dsh web` |
| DSHACP / Zed | 重启 ACP / `dsh --profile acp` 进程 |

然后在对话里输入 `/title` 试一下。

### 升级

```sh
dsh plugin --profile web update @hanxu131/dsh-autotitle
```

### 卸载

```sh
dsh plugin --profile web remove @hanxu131/dsh-autotitle
```

---

## 使用说明

### Web UI 确认框

默认 `confirm: true` 时，Web 会弹出确认：

1. **接受此标题** — 采用生成结果  
2. **重新生成** — 再调一次模型  
3. **取消** — 不改原标题  

也可以在下方「输入你的答案」里写自定义标题再提交。

> 选项旁边的数字 **1 / 2 / 3** 只是展示，**不能当快捷键**（这是 DSH Web UI 的限制）。请用鼠标点选。

### ACP / headless

没有确认 UI 时，生成后会**直接**设为会话标题。

---

## 配置（可选）

默认配置在本包的 [`cordis.patch.yml`](cordis.patch.yml)。要改参数，可在对应 profile 的用户补丁里覆盖同名行，例如 `~/.dsh/profiles/web/cordis.patch.yml`：

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

| 配置项 | 默认 | 含义 |
| --- | --- | --- |
| `maxLength` | `60` | 提示模型「标题最多约这么长」 |
| `prefix.enabled` | `true` | 允许 `[Bug]` 这类前缀 |
| `prefix.types` | 见上 | 可选前缀列表 |
| `language` | `follow` | `follow` / `zh` / `en` |
| `trim.threshold` | `15000` | 估算 token 超过此值才删减 |
| `trim.window` | `8000` | 删减后保留最近约多少 token |
| `trim.anchorChars` | `500` | 第一条用户消息锚定截断长度 |
| `confirm` | `true` | 有确认 UI 时是否询问 |
| `maxOutputTokens` | `512` | 生成标题的最大输出 token |
| `timeoutMs` | `30000` | 生成超时（毫秒） |

长对话删减策略：保留**第一条用户消息**（主题锚）+ **最近窗口**，中间用 `[... N messages omitted ...]` 省略。

---

## 和内置自动标题的关系

DSH 自带的 first-prompt 自动标题（`dsh-session-title-first-prompt-llm`）会在首条消息后自动命名。本插件是**手动** `/title`，看整段（可删减）对话，两者互补，不必关掉内置功能。

---

## 本地开发

```sh
git clone https://github.com/ECHOUniverse/dsh-autotitle.git
cd dsh-autotitle
pnpm install   # 或 npm install
pnpm build
dsh plugin --profile web add link:"$(pwd)"
```

改完代码后重新 `pnpm build`，并重启对应 DSH 进程。

发布新版本（维护者）：

```sh
npm run release          # patch：测试 → 升版本 → npm publish → 推送 tag
npm run release:minor    # minor 版本
```

安装已发布版本：

```sh
dsh plugin --profile acp update @hanxu131/dsh-autotitle
```

---

## 链接

| 资源 | 地址 |
| --- | --- |
| npm | https://www.npmjs.com/package/@hanxu131/dsh-autotitle |
| GitHub | https://github.com/ECHOUniverse/dsh-autotitle |
| DeepSeek Harness | https://deepseek.com/harness/zh/ |
| 第一个插件教程 | https://deepseek-harness.github.io/deepseek-harness/develop/basic/ |
| 姊妹项目（Pi） | https://www.npmjs.com/package/@hanxu131/pi-autotitle |
| DSHACP（Zed） | https://github.com/ECHOUniverse/dshacp |

## License

[MIT](LICENSE)
