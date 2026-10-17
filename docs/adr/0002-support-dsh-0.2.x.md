# Support DSH 0.2.x from plugin 0.2.2

DSH 0.2.1-rc.1 的插件准入只接受 `engines.dsh`，没有它时逐个校验 `@deepseek-ai/dsh-*` peerDependencies。插件 0.2.1 两样都没有覆盖 0.2.1-rc.1：没有 `engines.dsh`，6 个 peer 的上界又是 `<0.2.0`，于是 0.2.1-rc.1 桌面版在 profile 启动时直接跳过该 bundle，并提示 `grant the exact-version exemption`。为判断这是元数据问题还是真实 API 断裂，在 0.2.1-rc.1 下独立复现：TypeScript 5.9.3 全量类型检查 0 error；6 个 `@deepseek-ai/dsh-*` 包从 0.1.7-rc.2 到 0.2.1-rc.1 导出符号零删除、仅增量；插件实际使用的符号（`ctx.effect`、`commands.register`、`CommandInvocation`/`CommandResult`、`sessionTitle.rename`/`SessionTitleInvalidError`/`normalizeSessionTitle`、`ctx.llm.stream` 的 `GenerateOptions`、`BlockAssembler`/`ReasoningEffortId`/`createUserMessage`、`MessageSourceMap`、`ctx.userQuestions.ask`/`UserQuestionError`、`Agent.options`、`session.deriveMessages()`/`requestHeader()`/`id`）签名不变；把已构建的 `lib/` 放到 0.2.1-rc.1 包上冒烟通过（`llm.stream` 为 mock，未发真实模型请求）。

决策：插件 0.2.2 起声明 `engines.dsh = ">=0.1.7-rc.2 <0.2.0 || >=0.2.1-rc.1 <0.3.0-0"`，6 个 DSH peerDependencies 同步为同一联合范围；源码零改动，继续保留 0.1.7 时代支持；不承诺 0.3。

**Consequences**: DSH minor 升级需重新评估，并用 `tests/compat-manifest.test.mjs` 守护 `engines.dsh` 与 peer 的一致性；仍在 0.2.1 的用户可先用 `dsh plugin allow-version` 取得临时豁免，直到 0.2.2 发布。
