# Note and PDF Voice Reader

**语言：** [English](README.md) | 简体中文

Note and PDF Voice Reader 是一个隐私优先的桌面端 Obsidian 语音朗读插件，支持 Markdown 笔记和文本型 PDF。默认使用本地 CosyVoice，也可以由用户明确选择并同意使用 Microsoft Edge 在线语音、Microsoft Azure Speech 或 OpenRouter TTS。

## 核心亮点

- **隐私优先：** 默认使用本地 CosyVoice；每种在线引擎都必须单独获得用户明确同意后才能接收文本。
- **分范围音频导出需再次确认：** Markdown 笔记和文本型 PDF 均可选择导出全部内容、仅选中内容或从选中位置到末尾；开始合成前必须确认准确的可朗读字符数、分段/请求数、范围和预计保存路径。
- **理解 PDF 版面：** 本地提取会利用文字坐标识别常见双栏论文，按左栏后右栏朗读，并保留通栏标题和章节边界。
- **渐进式 PDF 快速开始：** Markdown 笔记和文本型 PDF 均在本地解析；普通文本型 PDF 通常几秒内即可产生第一批朗读分段，后续页面会继续解析。
- **隐私友好的可选续读：** 朗读位置记录默认关闭；开启后只保存有上限的恢复元数据和短文本锚点，不保存完整笔记或 PDF 正文。
- **有界的在线预合成：** 在线模式默认最多提前合成下一段，以改善分段衔接；需要严格按需合成时可把预合成设为 `0`。
- **灵活的 PDF 选区朗读：** 可以从 PDF 选中位置继续朗读，也可以只朗读选中文字。

这里的“文本型 PDF”是指包含可选择嵌入文本的 PDF；扫描版或纯图片 PDF 需要先完成 OCR。

## 界面截图

当前右侧朗读控制面板，包含分范围音频导出入口：

![Voice Reader 控制面板](docs/images/reader-controls.png)

隐私与资源控制设置。截图不包含 API 密钥、Obsidian 库名、笔记内容或本地路径：

![Note and PDF Voice Reader 设置页](docs/images/plugin-settings.zh-CN.png)

## 功能

- 朗读当前 Markdown 笔记或文本型 PDF、两种视图中的当前选中文本，或从 Markdown/PDF 的选中位置开始朗读到当前文件结尾。
- 使用 Obsidian 内置 PDF.js 在本地逐页提取 PDF 文本，利用坐标改善常见双栏页面的朗读顺序，边解析边加入朗读队列，并支持从控制面板停止。
- 分段时优先保留段落、行、句子和分句边界，同时把用户设置的字符数作为不可突破的上限。
- 可以选择记住并继续当前 Markdown 或 PDF 的朗读位置；该功能默认关闭，并提供单独的清除记录按钮。
- 可以把 Markdown 笔记或文本型 PDF 的全部内容、选中内容或选中位置之后的内容导出为一个音频文件：本地模式生成 WAV，在线模式生成 MP3；可保存到 Obsidian 附件目录、源文件同目录或指定的库内目录，Markdown 还可在成功后直接嵌入原笔记。
- 在右侧边栏打开 `Voice Reader` 控制面板。
- 显示合成、播放状态、整体朗读进度、百分比和当前文本预览。
- 支持暂停、继续、停止；控制面板获得焦点时可用空格暂停/继续，可连续按左右方向键按 5 秒步进前后跳转；进度条两侧提供上一段/下一段按钮；也支持在当前已加载音频块内点击或拖动进度条。
- 右侧边栏提供语速按钮：`1x`、`1.25x`、`1.5x`、`2x`、`1.1x`、`1.2x`、`1.3x`、`1.4x`。
- 设置页可以选择 `Local CosyVoice`、`Microsoft Edge online voice`、`Microsoft Azure Speech` 或 `OpenRouter TTS`。默认是本地 CosyVoice。
- 设置页顶部可以在英文和中文之间切换，切换后整页设置名称、说明、选项和按钮都会改用所选语言。
- Edge、Azure 与 OpenRouter 三种在线模式分别设置同意开关，未显式同意时插件不会发送文本。
- 本地与在线模式使用独立分段设置；在线笔记和 PDF 默认使用 `200,400,800`，并默认最多提前合成一个后续分段。
- 在 Obsidian 1.11.4 及以上版本中，Azure 和 OpenRouter 密钥默认使用 Obsidian SecretStorage，也可切换到库外密钥文件兼容模式。
- 设置页提供常用中文、粤语、台湾中文和英文音色预设、按 OpenRouter 模型联动的音色目录，也保留自定义 Voice ID。
- 在合成前清理 Markdown 和常见 LaTeX 标记，并把 Markdown 表格转换为适合朗读的列名与逐行字段说明，自动跳过空单元格。
- 将 `[28]`、`[28, 29]`、`[28-30]` 等数字文献引用转换为可朗读的“参考文献”表述，同时保留 `[s]`、`[%]` 等单位标记。
- 设置页提供 `Restore defaults` 按钮，可以把插件设置恢复为默认值。
- 设置页提供 [GitHub Issues](https://github.com/laginae/note-reader-cosyvoice/issues) 反馈入口，用于报告问题和提出功能建议。
- 提供 `Math reading language` 设置：
  - 默认使用 `English`，例如 `$a_b$` 会处理为 `a subscript b`。
  - `Chinese` 会使用中文数学读法，例如 `$a_b$` 会处理为 `a 下标 b`。
  - `$|Y_{k,h}|$` 这类短绝对值公式会转换成可朗读文字，不再把原始竖线发送给语音模型。
  - `Skip math` 会跳过短公式和长公式。
  - 超过 12 个非空白字符的公式会被跳过，避免长公式被逐字朗读。
  - 常见希腊字母命令保留为英文名，例如 `\alpha`、`\beta`、`\pi` 会变为 `alpha`、`beta`、`pi`。
  - 会处理常见非希腊符号和样式命令，例如 `\leq`、`\times`、`\textbf{...}`、`\mathbf{...}`、`\boldsymbol{...}`。
  - 短 `\frac{a}{b}` 在英文模式下处理为 `a over b`，在中文模式下处理为 `a 分之 b`。

## 安全与隐私

插件默认使用本地语音合成。在 `Local CosyVoice` 模式下，插件本身不会把笔记内容或从 PDF 提取的文本发送到 Microsoft、OpenAI 或其他远程 TTS 服务；但你配置的包装脚本属于同一信任边界，它仍可能按照自身实现发起网络请求。

PDF 提取使用 Obsidian 内置 PDF.js 和 `Vault.readBinary`，此功能不会上传 PDF 文件本身。为支持 PDF 选择位置命令，插件只在内存中临时保留所选页码、页内相对坐标和最多 2,000 个字符的定位文本；这些选区定位信息都不会写入设置或诊断日志。如果选择在线语音引擎并开启对应同意开关，从 PDF 提取出的文本分段会按照与笔记文本相同的规则发送。扫描版或纯图片 PDF 必须先完成 OCR 才能朗读。

`记住朗读位置` 默认关闭。开启后，`data.json` 只保存文件路径、文件时间、PDF 页码或朗读分段序号、更新时间，以及不超过 180 个字符的规范化文本锚点，不保存完整笔记或 PDF 正文。可以用 `清除已保存的朗读位置` 删除全部锚点；关闭该设置会停止后续使用和更新，但不会在未提示的情况下自动删除已有记录。

Edge、Azure 与 OpenRouter 都是主动选择的在线模式。Edge 模式把每个文本分段交给配置的 `edge-tts` 程序；Azure 模式通过 HTTPS 把分段发送到所选云环境和区域下的 Azure Speech 资源；OpenRouter 模式把分段发送到 OpenRouter 及符合条件的上游 TTS 供应商。三种模式都必须先分别开启在线处理同意开关。OpenRouter 的同意开关只表示允许在线传输，不表示允许非 ZDR 路由。默认情况下，插件可能在播放当前分段时提前合成下一段，但不会提前超过一段；提前停止时最多可能留下一个未播放的预合成分段。把预合成设为 `0` 后可严格按需合成。不同服务的计费单位并不相同，因此这一机制只能限制可避免的额外工作，而不是保证固定比例的费用下降。

每次音频导出都会再次要求确认。对于 PDF 全部导出或从选中位置导出，插件会先完成本地解析与选区定位，再显示确认窗口。窗口会列出所选范围、清理后的可朗读字符数、准确的计划分段数和预计库内路径；使用在线引擎时，只会把该范围内的可朗读文本按顺序发送，可能消耗服务商额度或产生费用。临时失败仍可能触发有限重试，因此实际网络尝试次数可能高于计划分段数。导出不会为播放连续性额外预合成，只有全部分段和后处理成功后才会创建库内音频附件，也可以随时用 `Stop` 取消。

临时文本和音频存放在操作系统临时目录下按 Obsidian 库隔离的子目录中，不再写入库内。启用 `Clean temporary audio` 时，明文分段在完成合成后立即删除，朗读结束或停止时删除其余会话文件，插件启动时还会清理遗留文件和旧版库内缓存。唯一有意保留的情况是：所有导出分段均已合成，但拼接或附件后处理失败；此时音频分段会在当前插件会话中暂存，使 `Retry merge only` 能够复用而不再次调用 TTS。重试成功、执行“清除临时数据”，或在默认清理开启时卸载插件，都会删除这些分段。诊断日志默认关闭；即使开启，也只记录有大小上限的失败元数据，不记录笔记名、笔记文本或子进程输出。

在 Obsidian 1.11.4 及以上版本中，Azure 和 OpenRouter 密钥默认使用 Obsidian SecretStorage。插件的 `data.json` 只保存所选 Secret 的标识符，不保存密钥值。Obsidian 官方把 SecretStorage 说明为按库区分的本地保密存储；不能据此宣称它一定使用 Windows 凭据管理器或 macOS Keychain。插件仍保留“库外单行密钥文件”兼容模式，已有密钥文件配置升级后会继续使用原模式。参见 [Obsidian SecretStorage 官方指南](https://docs.obsidian.md/plugins/guides/secret-storage)。

Microsoft 说明其实时文本转语音接口不保留输入文本或生成音频；但文本仍会传输到所选 Azure Speech 服务并由其处理。使用前还应确认所选云环境和订阅适用的条款。参见 [Azure Speech 文本转语音数据隐私与安全](https://learn.microsoft.com/zh-cn/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security)。

每个 OpenRouter 请求都强制携带 `provider.zdr: true` 和 `provider.data_collection: "deny"`；如果没有满足条件的端点，合成会直接失败，不会降低隐私策略。OpenRouter 说明请求正文默认不保存，除非账户主动开启输入输出日志或数据共享；但其仍会保存不含正文的请求元数据。朗读私密内容前应确认这些账户开关保持关闭。参见 [OpenRouter 数据收集说明](https://openrouter.ai/docs/guides/privacy/data-collection)和[零数据保留说明](https://openrouter.ai/docs/guides/features/zdr)。

需要注意：

- 网络请求：本地模式启动你配置的包装脚本；Edge 模式使用 `edge-tts`；Azure 模式使用根据所选云环境和合法区域生成的官方地址；OpenRouter 模式固定使用 `https://openrouter.ai/api/v1/audio/speech`。
- Shell 执行：本地模式启动配置的 PowerShell 包装脚本，Edge 模式启动配置的 `edge-tts` 可执行文件；Azure 和 OpenRouter 模式不启动 Shell 命令。
- 存储访问：插件在操作系统临时目录下写入临时文件；本地模式检查包装脚本，Azure 与 OpenRouter 模式从 Obsidian SecretStorage 或配置的库外密钥文件读取凭据。
- 遥测：插件不包含客户端或服务端遥测。
- 自动更新：插件不包含自更新机制。

只建议配置你自己检查过的本地脚本。不要把不可信脚本路径填入插件设置。

## 共享架构

不依赖平台的文本清理、语义分段、PDF 坐标排序、朗读位置锚点和播放状态位于独立的 [`note-reader-core`](https://github.com/laginae/note-reader-core) 仓库。本桌面仓库继续负责文件系统、子进程、本地 CosyVoice、`edge-tts`、音频拼接和导出；独立的 [`note-reader-mobile`](https://github.com/laginae/note-reader-mobile) 插件复用同一核心，但不包含桌面 API 或本地可执行程序调用。

## 安装插件

1. 从 GitHub Release 下载安装包，或下载 `main.js`、`manifest.json`、`styles.css`。
2. 在你的 Obsidian 库中创建插件目录：

```text
<你的库>/.obsidian/plugins/note-reader-cosyvoice
```

3. 把以下文件放入该目录：

```text
manifest.json
main.js
styles.css
README.md
INSTALL.md
LICENSE
```

4. 重新打开 Obsidian，进入 `Settings -> Community plugins`，启用 `Note and PDF Voice Reader`。
5. 进入插件设置，选择 `Speech engine`。默认本地模式需要填写 CosyVoice 包装脚本路径；Edge 模式需要安装 `edge-tts`；Azure 模式需要 Azure Speech 资源及 SecretStorage 或库外密钥文件；OpenRouter 模式需要 OpenRouter 账户、额度及 SecretStorage 或库外 API 密钥文件。

## 本地 CosyVoice 要求

如果使用默认的 `Local CosyVoice` 模式，需要先准备好一个本地 CosyVoice 运行环境，并提供一个 PowerShell 包装脚本。插件调用脚本时使用以下参数：

```powershell
cosyvoice-wrapper.ps1 -InputPath <txt> -OutputPath <wav> -Speed <speed>
```

脚本需要做到：

- 读取 `InputPath` 指向的 UTF-8 文本文件。
- 调用你的本地 CosyVoice 运行时生成语音。
- 把有效 WAV 文件写入 `OutputPath`。
- 成功时退出码为 `0`。
- 失败时输出清晰的错误信息。

推荐脚本路径：

```text
%LOCALAPPDATA%\note-reader-cosyvoice\cosyvoice-wrapper.ps1
```

你也可以使用其他路径，只要在插件设置页中正确填写即可。更完整的本地安装、硬件建议、系统建议和脚本示例见 [Local CosyVoice setup](docs/local-cosyvoice-setup.md)。

## Microsoft Edge 在线语音模式

如果在设置页把 `Speech engine` 改为 `Microsoft Edge online voice`，插件会跳过本地 CosyVoice 脚本，直接调用 `edge-tts` 生成 MP3 音频。你需要先安装 `edge-tts` CLI，并让 Obsidian 能通过 PATH 或绝对路径找到该程序。

[`edge-tts`](https://github.com/rany2/edge-tts) 是发布在 [PyPI](https://pypi.org/project/edge-tts/) 上的第三方 Python 包，用来调用 Microsoft Edge 的在线文本转语音服务。它不是本插件自带的程序，也不是本地离线语音模型。

推荐使用 `pipx` 安装命令行工具：

```powershell
pipx install edge-tts
```

如果还没有安装 `pipx`：

```powershell
py -m pip install --user pipx
py -m pipx ensurepath
```

然后重新打开 PowerShell，再运行 `pipx install edge-tts`。

如果你直接管理 Python 包，也可以使用：

```powershell
py -m pip install --user edge-tts
```

安装后重新打开 PowerShell，先确认命令可用：

```powershell
edge-tts --help
```

列出可用语音：

```powershell
edge-tts --list-voices
```

然后进入 `Settings -> Note and PDF Voice Reader`：

1. 把 `Speech engine` 改为 `Microsoft Edge online voice`。
2. 开启 `Allow Edge online processing`。
3. 在 `Edge TTS executable` 中填写 `edge-tts` 或可执行文件的绝对路径。
4. 从常用音色中选择，或填写自定义 Voice ID。
5. 按需调整 `Speed`。插件会把它转换为 `edge-tts --rate` 参数。

常用音色包括中文女声 `zh-CN-XiaoxiaoNeural`、`zh-CN-XiaoyiNeural`，中文男声 `zh-CN-YunxiNeural`、`zh-CN-YunyangNeural`，粤语 `zh-HK-HiuMaanNeural`，台湾中文 `zh-TW-HsiaoChenNeural`，以及英文 `en-US-JennyNeural`、`en-US-GuyNeural`、`en-US-AriaNeural`、`en-GB-SoniaNeural`、`en-GB-RyanNeural`。Edge 与 Azure 的新默认音色均为英式男声 `en-GB-RyanNeural`，更偏克制的长文与学术朗读。完整 Edge 音色列表以本机 `edge-tts --list-voices` 输出为准。

如果 Obsidian 找不到 `edge-tts`，请在插件设置中填写绝对可执行文件路径并完全重启 Obsidian。除非你明确决定信任并维护该安装，否则不要依赖其他应用的私有虚拟环境。

隐私提醒：Edge 模式会把每个文本分段发送给 Microsoft Edge TTS。私密或敏感笔记建议继续使用默认的 `Local CosyVoice`。

## 保存 Azure 与 OpenRouter 密钥

在 Obsidian 1.11.4 及以上版本中，建议保留默认的 `Obsidian SecretStorage`。在插件设置页的 Secret 控件中创建或选择一个 Secret，并把原始 API 密钥保存其中。插件自己的 `data.json` 只保存该 Secret 的标识符，密钥值保留在 Obsidian 按库区分的本地 Secret 存储中。

旧版 Obsidian 或已有文件配置可选择 `库外单行密钥文件`。密钥文件必须放在所有 Obsidian 库之外，只包含一行非空密钥，且不要同步、提交或分享。已有密钥文件路径会在升级时自动迁移到这个兼容模式。

## Microsoft Azure Speech 模式

Azure 模式使用官方实时 Speech REST 接口，支持 Azure 公有云和由世纪互联运营的 Azure 中国区。先在相应云环境中创建 Speech 资源，并记下资源区域和一个订阅密钥。HTTPS 请求、SSML、认证请求头和音频格式遵循 Microsoft 的[文本转语音 REST API 参考](https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/rest-text-to-speech)。

如果选择库外密钥文件兼容模式，可使用类似路径：

```text
%LOCALAPPDATA%\note-reader-cosyvoice\azure-speech-key.txt
```

然后进入 `Settings -> Note and PDF Voice Reader`：

1. 把 `Speech engine` 改为 `Microsoft Azure Speech`。
2. 开启 `Allow Azure online processing`。
3. 选择 `Azure public cloud` 或 `Azure China operated by 21Vianet`。
4. 填写资源区域，例如 `eastasia`、`southeastasia`、`chinaeast2` 或 `chinanorth3`。
5. 选择 `Obsidian SecretStorage` 并创建/选择 Azure 密钥 Secret，或选择库外文件并填写绝对路径。
6. 选择常用音色，或填写自定义 Azure Voice ID。

可选预设包括普通话女声 `zh-CN-XiaoxiaoNeural`、`zh-CN-XiaoyiNeural`，普通话男声 `zh-CN-YunxiNeural`、`zh-CN-YunyangNeural`，粤语和台湾中文，以及常用美式英语 `en-US-JennyNeural`、`en-US-GuyNeural`、`en-US-AriaNeural` 和英式英语 `en-GB-SoniaNeural`、`en-GB-RyanNeural`。实际可用性取决于资源区域，应以当前的 [Azure Speech 语言与音色列表](https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/language-support)为准。

插件只会根据经过校验的区域和云环境生成 HTTPS 服务地址，不允许填写任意 Azure 请求地址。Azure 中国区的地址差异见 [Azure Speech 主权云文档](https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/sovereign-clouds)。

## OpenRouter TTS 模式

OpenRouter 提供与 OpenAI Audio Speech 兼容的专用 TTS 接口，输入文本后直接返回 MP3 或 PCM 原始音频。本插件固定请求 MP3，并在保存前检查 HTTP 状态和 `Content-Type`，避免把 JSON 错误响应当成音频。接口说明见 [OpenRouter TTS 官方文档](https://openrouter.ai/docs/guides/overview/multimodal/tts)。

对于临时性的 `408`、`425`、`429`、`500`、`502`、`503`、`504` 和瞬时网络故障，插件会采用短间隔、有限退避，最多尝试 3 次。密钥、模型、音色、隐私策略、请求格式或返回内容类型错误不会重试。若最终仍显示 `HTTP 502`，表示 OpenRouter 或上游供应商在有限重试后仍不可用，通常不是文本中存在“不支持字符”。

在 [OpenRouter API Keys](https://openrouter.ai/settings/keys) 创建专用 API 密钥。建议设置较低的消费上限和适当的到期时间。如果选择库外密钥文件兼容模式，可使用类似路径：

```text
%LOCALAPPDATA%\note-reader-cosyvoice\openrouter-api-key.txt
```

然后进入 `Settings -> Note and PDF Voice Reader`：

1. 把 `Speech engine` 改为 `OpenRouter TTS`。
2. 开启 `Allow OpenRouter online processing`。
3. 选择 `Obsidian SecretStorage` 并创建/选择 OpenRouter 密钥 Secret，或选择库外文件并填写绝对路径。
4. 选择内置的 ZDR 兼容模型及其音色，或填写自定义模型 ID 与音色 ID。
5. 确认 OpenRouter 账户中的输入输出日志和输入输出数据共享保持关闭。

整体默认模型为 `hexgrad/kokoro-82m`，默认音色为英式英语男声 `bm_george`，更偏克制的长文与学术朗读。切换到其他内置模型时，插件会在发布方明确标注性别的前提下优先使用英语男声：Microsoft MAI 默认使用美式英语男声 `Ethan`；Gemini 因 Google 未公开固定性别或英美口音标签，改用信息型 `Charon`，但不把它标为已确认男声。不同模型的音色 ID 不能混用。OpenRouter 已公开的音色 ID 和微软官方 MAI 音色目录均于 2026-08-27 核对：

- `microsoft/mai-voice-2-flash`：默认使用微软官方发布的美式英语男声 `en-US-Ethan:MAI-Voice-2-Flash`；除 OpenRouter 当前公开的 4 个 ID 外，还加入微软官方发布的美式英语和普通话音色作为兼容预设。
- `microsoft/mai-voice-2`：默认使用微软官方发布的美式英语男声 `en-US-Ethan:MAI-Voice-2`；其他美式英语男声及普通话 ShortName 也作为兼容预设提供，因为 OpenRouter 可能接受其元数据没有列出的音色。
- `google/gemini-3.1-flash-tts-preview`：默认使用信息型 `Charon`，并从 OpenRouter 当前公开的 30 个音色中精选 12 个。Google 按朗读风格而非固定性别或英美口音描述这些多语言音色，因此插件不会把 Gemini 预设无依据地标为男声或特定口音。
- `hexgrad/kokoro-82m`：提供 12 个预设，中文女声、中文男声、美式英语女声、美式英语男声、英式英语女声和英式英语男声六类各 2 个。

目前内置 OpenRouter 模型中，Kokoro 明确同时提供美式英语男声和英式英语男声。微软当前公开的 MAI 官方目录有美式英语男声，但没有英式英语 MAI 音色。若 OpenRouter 或其上游端点拒绝元数据未公开的音色 ID，兼容预设仍可能失败；用户也可以在自定义音色字段中填写自行验证过的 ID。

设置页会根据当前模型显示特点，并只展示该模型对应的音色预设。模型、音色和 ZDR 端点会随时间变化；OpenRouter 实时 [`speech + ZDR` 模型接口](https://openrouter.ai/api/v1/models?output_modalities=speech&zdr=true)用于核对其公开的路由元数据，微软官方 [MAI 音色目录](https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/mai-voices)用于核对 MAI ShortName。Gemini 风格名称来自 [Google Gemini TTS 官方音色表](https://ai.google.dev/gemini-api/docs/speech-generation?hl=zh-cn)，Kokoro 的语言与性别分组来自其[上游音色目录](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)。自定义模型仍可填写，但如果没有符合条件的 ZDR 端点，插件会报错，而不会取消隐私约束后继续发送。

## 模型存储空间、其他语音模型与分段设置

插件不会下载模型。安装本地语音模型前，需要先为模型、运行环境和缓存预留磁盘空间：

- 当前常见 CosyVoice 模型仓库通常是数 GB 级别。截至 2026-06，公开 Hugging Face 示例中，300M 模型约 `2.5 GB`，0.5B CosyVoice3 模型约 `9 GB`。
- 实际占用会大于模型文件本体，因为还包括 Git LFS 或下载缓存、Conda/Python 环境、依赖、日志和多个模型副本。单模型建议至少预留 `10-20 GB`，如果要同时保留多个模型或实验环境，建议预留 `30 GB+`。
- 模型和缓存建议放在本地 SSD 上，不建议放在会自动同步的大型网盘目录中。

这个插件名字里包含 CosyVoice，但底层只要求“输入文本文件、输出 WAV 文件”的包装脚本。因此也可以接入其他本地语音模型，只要脚本满足同一调用约定：读取 `-InputPath` 的 UTF-8 文本，把有效 WAV 写到 `-OutputPath`，接受 `-Speed` 参数，失败时返回非零退出码并输出清晰错误。更换模型时需要注意模型许可证、中文/英文支持、输出音频格式、语速控制方式、首次启动延迟，以及是否会把文本发送到本机以外的服务。

Edge、Azure 与 OpenRouter 是和本地包装脚本并列的在线语音模式，不走上述 WAV 包装脚本约定。三者都会生成临时 MP3，并分别使用对应的音色设置。OpenRouter 某些供应商不支持语速参数时可能忽略 `Speed`。

`Local chunk limits` 用来控制本地 CosyVoice 的文本分块大小。它影响首段音频出现速度、合成稳定性和朗读连贯性：

- CPU-only 或低性能 GPU：可从 `30,60,90,120,160,200` 开始。
- 中端 GPU：建议先使用默认值 `40,80,120,160,280,320`。
- 性能较好的 GPU 或稳定的本地低延迟服务：可尝试 `80,140,220,320,480,640`。
- 如果合成超时、失败或第一段音频等待太久，就把数值调小；如果朗读过于碎片化且模型稳定，再逐步调大。

`Online chunk limits` 同时用于 Edge、Azure、OpenRouter 模式下的笔记和 PDF，默认值是 `200,400,800`。首段相对较短，便于尽快开始；后续分段较长，可减少请求次数并改善连续性。

`Online synthesis prefetch` 默认为 `1`：播放当前分段时，插件可以提前准备下一段，从而改善段间衔接。插件不会提前超过一段，因此提前停止时最多可能留下一个未使用的预合成请求。更看重完全避免未使用请求、可以接受段间等待时，可改为 `0`。

## 本地模型与系统建议

插件不决定硬件需求，真正的资源占用取决于 CosyVoice 运行时、模型大小和部署方式。

- CPU-only：适合测试短句，正式朗读长笔记通常会比较慢。
- NVIDIA GPU：更适合日常朗读，尤其是长文本或频繁使用。
- Windows：建议把 CosyVoice 运行在 WSL2 或 Linux 环境中，再通过本地 HTTP 服务让 PowerShell 脚本调用。
- Linux：通常是部署 CosyVoice 最直接的环境。
- macOS：如遇到本地部署困难，可以考虑在 Linux 主机或局域网服务器上运行 CosyVoice，再通过本地或局域网接口调用。

部署 CosyVoice 时应优先参考上游项目的当前说明：

- CosyVoice: `https://github.com/FunAudioLLM/CosyVoice`
- FastAPI runtime: `https://github.com/FunAudioLLM/CosyVoice/tree/main/runtime/python/fastapi`

## 使用方式

插件提供以下命令：

- `Open voice reader controls`
- `Read current note or PDF aloud`
- `Export audio from current note or PDF`
- `Export audio from the current note and insert it`
- `Retry pending audio export merge only`
- `Resume reading current note or PDF`
- `Read current PDF aloud`
- `Read current PDF from selection aloud`
- `Read selection aloud`
- `Read from selection aloud`
- `Pause or resume voice reading`
- `Seek backward 5 seconds`
- `Seek forward 5 seconds`
- `Move to previous reading chunk`
- `Move to next reading chunk`
- `Stop voice reading`

也可以使用编辑器中的按钮或右侧边栏控制面板。语速按钮会影响后续合成的音频块；已经合成并正在播放的音频不会被重新变速，除非停止后重新开始朗读。

## 音频导出

打开 Markdown 笔记或文本型 PDF 后，点击控制面板的 `Export audio`。范围选择框提供“全部内容”“仅选中内容”和“从选中位置到末尾”；后两项要求当前存在文字选区。对于 PDF 全部导出或从选中位置导出，插件会先在本地完成解析和可靠定位。随后确认窗口会显示准确的可朗读字符数、语音引擎、合成分段数、范围和预计保存路径；必须勾选确认框后才会开始合成。

本地模式把 PCM WAV 分段合并为一个 WAV；Edge、Azure 和 OpenRouter 把经过校验的 MP3 帧合并为一个 MP3。设置中的“音频导出保存位置”可选择 Obsidian 附件目录（默认）、源文件同目录或本库内自定义目录。全部、选中和继续导出的文件名分别类似 `笔记名 - narration.mp3`、`笔记名 - selection narration.mp3` 和 `笔记名 - continued narration.mp3`，同名时自动添加数字后缀。Markdown 可使用 `Export & insert audio` 在当前光标插入结果，或追加到原笔记；PDF 本身不能插入 Obsidian 嵌入，因此 PDF 导出只保存音频附件。

导出只按顺序处理确认窗口列出的分段，不使用播放任务的提前预合成。如果合成失败或用户停止任务，库内不会留下不完整附件。如果所有分段已经合成，但拼接或附件后处理失败，控制面板会出现 `Retry merge only`；它只复用已保留的本地分段，不会再次调用 TTS API。在重试成功或通过设置中的“清除临时数据”放弃这些分段之前，插件会阻止开始另一项导出，避免覆盖可重试状态。

## 键盘与进度条说明

右侧边栏 `Voice Reader` 控制面板获得焦点时，空格可以暂停或继续朗读。播放中只要当前音频可用，左方向键或右方向键会按 5 秒步进后退或前进。

进度条两侧的三角按钮可以跳到上一段文本分段或下一段文本分段。已经合成过的分段会尽量复用；如果目标分段尚未合成，插件会先合成再播放。

右侧边栏进度条显示的是整段朗读任务的整体进度。播放时可以点击或拖动进度条，但跳转范围受当前已加载音频块限制。如果拖动到当前音频块外，插件会自动夹到当前块边界。

## PDF 朗读

先在 Obsidian 中打开库内 PDF，再点击控制面板中的 `Read file`，或者执行支持 PDF 的命令。插件会在本地逐页提取文本；达到第一段设置长度后即可开始合成和播放，同时继续解析后续页面。停止按钮会同时取消解析、播放和仍在进行的合成请求。

若要从指定位置开始，请先在 PDF 文本层选中文字，再点击 `Read from selection`，或执行 `Read current PDF from selection aloud`。插件会结合选区的页内相对坐标与文字匹配，从而区分摘要和后续栏位中重复出现的语句，然后朗读到 PDF 末尾。`Read selection` 只朗读当前选中的 PDF 文字。无法取得坐标时仍会使用文字匹配作为兼容回退；两种定位都失败时，插件会显示提示并改为从所选页开头朗读。

PDF 必须包含可选择的内嵌文本。加密、损坏、扫描版或纯图片 PDF 无法直接提取，需要先解锁或执行 OCR。0.4.0 及以上版本会利用文字坐标识别常见双栏页面，在每个垂直区段中按左栏后右栏朗读，并把通栏标题作为边界；非常规版式、旋转文字、侧栏和复杂表格仍可能需要从选中位置开始，或改用文本结构更规范的源 PDF。

开启 `记住朗读位置` 后，可以点击控制面板的 `Resume file`，或执行 `Resume reading current note or PDF`。PDF 会从保存的页码开始重新定位短锚点；Markdown 会匹配同一规范化锚点，笔记发生修改且锚点失效时则回退到最接近的已保存分段。

## 开发与构建

可维护源码位于 `src/`。发布前应构建并运行全部测试：

```powershell
npm install
npm test
```

构建过程会把 `src/main.js` 及本地模块打包为 Obsidian 社区安装器需要的根目录单文件 `main.js`；`obsidian` 由宿主应用在运行时提供，不会打进发布文件。

## 常见问题

- PDF 提示没有可提取文本：该文件通常是扫描版或纯图片 PDF，请先做 OCR；也请确认文件未加密且没有损坏。
- 提示脚本不存在：检查插件设置中的脚本路径是否正确。
- 本地模式提示无法朗读：先在 PowerShell 中单独测试包装脚本，确认它能生成有效 WAV 文件。
- Edge 模式提示无法朗读：在 PowerShell 中运行 `edge-tts --help`，确认 `edge-tts` 已安装且 Obsidian 能找到这个命令。
- Azure 模式提示无法朗读：核对云环境、区域、所选 SecretStorage 条目或库外密钥文件、资源状态、配额和音色。
- OpenRouter 模式提示无法朗读：核对所选 SecretStorage 条目或库外密钥文件、账户余额、模型和音色；如果提示没有可用端点，说明当前没有供应商同时满足所选模型与强制隐私策略。
- 生成速度慢：本地模型首次加载和首次推理可能较慢，CPU-only 环境也会明显变慢。
- 语速按钮无效：检查你的包装脚本或本地服务是否真正使用了 `-Speed` 参数。
- 公式朗读不符合预期：在插件设置中切换 `Math reading language`，或使用 `Skip math` 跳过公式。

## 共享包内容

安装包只应包含：

- `manifest.json`
- `main.js`
- `styles.css`
- `README.md`
- `INSTALL.md`
- `LICENSE`

不要打包 `data.json`、旧版 `cache`/`last-error.log`、系统临时数据、本地测试文件或任何包含个人路径、密钥、令牌的信息。

## 许可证

MIT.
