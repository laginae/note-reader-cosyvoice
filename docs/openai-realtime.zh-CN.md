# OpenAI Realtime 朗读（实验性）

这是可选、默认不启用的 BYOK 接口，不会自动替换已有引擎，也不请求麦克风权限。本次发布尚未通过真实 OpenAI 账户合成测试；移动端 CORS、真机及后台行为也待验证。需要准确朗读或可预测计费时，优先使用常规 TTS 引擎。

## 配置

1. 桌面版在“自定义语音 API（BYOK）”中另建配置；移动版只有一个当前 BYOK 配置，切换前请记下旧配置。
2. 选择 **OpenAI Realtime（实验性）**。官方接口固定为 `https://api.openai.com/v1/realtime/client_secrets`，适配模型固定为 `gpt-realtime-2.1-mini`。选择列表内音色；示例 `coral` 不作固定性别承诺。
3. 重新选择 OpenAI API 秘密。更换接口类型会清除旧密钥关联及授权，但不会删除秘密。桌面版仍可使用库外密钥文件。
4. 阅读传输及计费说明，明确授权。先测试一句公开短文，如“这是一段公开的朗读示例”，再决定是否处理私人材料。
5. 沿用播放、暂停、倍速、停止及导出按钮。每段完整缓冲、核对后返回 24 kHz 单声道 PCM WAV，不是边收音频边即时播放。桌面默认每段 200 字符，可设 50–800；移动播放使用 200 字符小段。缓存限制及导出确认仍然有效。

## 准确性与费用

- 每段获取一个短期令牌并建立独立 WebSocket 会话，不携带前文、文档名称、麦克风音频或工具；只发送当前朗读段落。密钥和令牌不写入设置、日志或导出音频。
- 实时语音模型是生成式模型，不等于确定性的 TTS。插件要求音频、转写及最终响应全部完成，再将输入与生成转写核对；忽略大小写及普通标点，但保留数字和数学运算符。这能发现转写差异，不能独立保证实际听到的每个字都正确。
- 事件缺失、重复、不一致，转写不符、不支持的音频或过大输出均停止当前段，不播放、不自动跳到下一段。数字与数字读法、缩写及混合语言可能触发保守拦截；建议改用常规 TTS，不提供关闭此检查的选项。
- 停止、撤销授权或修改语音配置会关闭合成连接。暂停可能让已发起的合成先完成、保留供继续播放。不自动重试，已生成的音频仍可能收费。按音频 token 计费，不等于按字符收费；请核对[官方价格](https://developers.openai.com/api/docs/pricing)和账户限额，不承诺更省钱或更快。
- 移动端使用有大小限制、拒绝重定向的 HTTPS 请求和短期令牌 WebSocket。如被 CORS 或设备策略阻止会明确失败，不经过开发者中转、不降低隐私限制。iPhone、iPad 和 Android 均需真机验证；移动后台播放仍为实验性且默认关闭。

## 隐私与迁移

文本会发送给 OpenAI。BYOK 无法核实或强制账户的“不训练”或 ZDR 设置；接口具备 ZDR 资格，不代表你的组织已经启用。请核对 [OpenAI 数据控制说明](https://developers.openai.com/api/docs/guides/your-data)。不会将 OpenRouter 的 ZDR 配置自动迁移为直连 OpenAI。

OpenAI 公告 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts` 将于 2027-01-06 停用。插件仅对指向官方 Speech 地址的受影响配置显示提醒，不修改第三方兼容接口、MiMo、Edge、Azure 或 OpenRouter 配置。原配置及授权保持不变；不能在 `/v1/audio/speech` 中只替换为 Realtime 模型名。

参考：[停用公告](https://developers.openai.com/api/docs/deprecations)、[Realtime 接入](https://developers.openai.com/api/docs/guides/realtime)、[WebSocket 认证](https://developers.openai.com/api/docs/guides/voice-websockets?api=realtime)、[会话与响应事件](https://developers.openai.com/api/docs/guides/realtime-conversations)。

自动化测试只使用合成响应及公开示例，覆盖会话隔离、凭据、授权、转写拦截、完成状态、停止、超时、大小上限和 WAV 转换；不能替代真实服务、听感和移动后台测试。
