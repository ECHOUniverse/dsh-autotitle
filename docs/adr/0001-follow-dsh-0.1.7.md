# Follow DSH 0.1.7-rc.2 only from plugin 0.2.0

DSH 0.1.7-rc.2 移除了 `Session.events`（改用 `deriveMessages()` / `requestHeader()`），同时移除了 `MessageSourceMap` 的 `plugin` kind（改用模块增强声明自有 kind）。这两个 API 在旧版（0.1.0-rc.8 时代）必需、在新版非法，双兼容需要运行时探测加类型体操，成本与脆弱性都不值得。决策：插件自 0.2.0 起只追随 DSH `>=0.1.7-rc.2 <0.2.0`，仍在旧版 DSH 上的用户定格在插件 0.1.3，不再更新。

**Consequences**: peerDependencies 收窄为 `>=0.1.7-rc.2 <0.2.0`；README 增加版本兼容性对照；0.1.3 成为旧 DSH 用户的最终版本。
