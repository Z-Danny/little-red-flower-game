# 微信小游戏本地导出

Godot 4.6.2 官方标准版编辑器只导出项目数据。组装脚本把 `.pck` 原样放入 godot-minigame 4.6.2.5 模板的 `engine/demo-pck.bin`，生成可在微信开发者工具中选择的小游戏目录。源工程保留在 `godot-prototype/`。组装无需原生插件，也不需要 Godot 官方导出模板；完整浏览器版仍走原来的 Web 导出。

## 构建输入

- Godot 4.6.2 官方标准版编辑器，GDScript、Compatibility 渲染器。`Web` 预设关闭线程和 GDExtension，导出不加密。建议预设排除 `tools/`、测试和说明文档。
- [小游戏模板 `minigame4.6.2.5.tpz`](https://github.com/godothub/godot-minigame/releases/download/4.6.2/minigame4.6.2.5.tpz)。版本 `4.6.2.5` 是资产文件名，Release tag 是 [`4.6.2`](https://github.com/godothub/godot-minigame/releases/tag/4.6.2)。[GitHub 资产元数据](https://api.github.com/repos/godothub/godot-minigame/releases/assets/539011279)公布 SHA-256：`577484dad9ef070dcf5a3346729fe81f8cdb723d506efb0fdd0f4a1f39f29ae7`。脚本校验字节数和摘要后才读 ZIP。
- Python 3.10+ 标准库运行组装脚本。Node.js 24 可选，用于复核最终文件及 JS、WASM 格式；校验不执行模板代码。

## 导出命令

在仓库根目录运行。下例编辑器来自 [Godot 4.6.2 官方发布](https://github.com/godotengine/godot-builds/releases/tag/4.6.2-stable)，运行前核对下载包 SHA-256 和解压后的文件。同版本的正式 Web 导出如已验证，也可直接取它的 `index.pck`，无需再次导包。

```powershell
$godot = (Resolve-Path 'outputs/godot-tools/editor/Godot_v4.6.2-stable_win64_console.exe').Path
$src = (Resolve-Path 'godot-prototype').Path
$work = (New-Item -ItemType Directory -Force 'outputs/godot-wechat-tools').FullName
$tpl = Join-Path $work 'minigame4.6.2.5.tpz'
$pck = Join-Path $work 'full.pck'
$split = Join-Path $work 'split'
$report = Join-Path $work 'wechat-manifest.json'
$out = Join-Path $work 'wechat'
# 改为实际的 HTTPS 素材目录，末尾保留斜杠。
$assetUrl = 'https://assets.example.test/little-red-flower/packs/'

Invoke-WebRequest 'https://github.com/godothub/godot-minigame/releases/download/4.6.2/minigame4.6.2.5.tpz' -OutFile $tpl
Get-FileHash -Algorithm SHA256 -LiteralPath $tpl
& $godot --headless --path $src --import
if ($LASTEXITCODE) { throw 'Godot import failed' }
& $godot --headless --path $src --export-pack Web $pck
if ($LASTEXITCODE) { throw 'Godot PCK export failed' }
python -B godot-prototype/tools/split-release-pck.py --pck $pck --output $split --base-url $assetUrl
if ($LASTEXITCODE) { throw 'Godot PCK split failed' }
python -B godot-prototype/tools/assemble-wechat.py --template $tpl --pck (Join-Path $split 'core.pck') --output $out --report $report --project-name '小红花应急行动'
if ($LASTEXITCODE) { throw 'WeChat assembly failed' }
node --experimental-vm-modules godot-prototype/tools/check-wechat-runtime.mjs $out $report
```

组装脚本要求新输出目录和报告路径，不覆盖原构建。相同输入的文件内容、SHA-256 和清单相同。脚本检查 PCK v3、4.6.2 包头、文件目录及各项 MD5、Compatibility 渲染器和启动场景，再校验最终文件。MD5 用于核对 Godot 格式内的文件记录；清单同时列出各输出的 SHA-256。

## 小游戏目录与运行条件

- 微信开发者工具选择「小游戏 → 导入」，选择含 `project.config.json` 的目录，即上例的 `$out`。默认填写游客占位 `touristappid`；工具若没有游客入口，需改用项目有权限的小游戏 AppID 或[小游戏测试号](https://developers.weixin.qq.com/minigame/dev/devtools/sandbox.html)。`--appid` 只修改本地项目配置。未使用模板作者 AppID，也未保留其私有 DevTools 配置。
- 根 `game.js` 加载 adapter、GLX 配置和 loader，后者调用 `wx.loadSubpackage({name: "engine"})`；`engine/game.js` 先加载 SDK，再调用 `startGame('/engine/godot', '/engine/demo-pck.bin')`。SDK 的 `fsUtils.localFetch` 从代码包读 PCK；运行器用 `--main-pack` 启动。WASM 由 `WXWebAssembly` 按代码包路径读取 `.wasm.br`，此模板的 WASM 内存声明不共享。以上路径不经过 HTML、CDN 或浏览器跨源隔离配置。组装时去掉样例读包函数和更新弹窗，并移除 SDK 在 iOS 启动时对只读 `devicePixelRatio` 的赋值。引擎 WASM 和适配器保持发布版本字节。
- [godot-minigame 插件源码](https://github.com/godothub/godot-minigame/blob/de3200265fc50f4c757be037e64529814cd9ecdd/src/editor/wechat_export_platform.cpp#L402-L465)也以 `save_pack` 写 `engine/demo-pck.bin`，发布 ZIP 内《小游戏工程说明.md》明确允许替换 PCK。插件的 `wechat` 等特性标签与官方 `Web` 预设不同；有特性覆盖、GDExtension 或依赖特定导出钩子的其他工程应单独验证。
- 模板内引擎是 `Godot Engine for Wechat v4.6.2.rc.custom_build`；官方编辑器是 4.6.2 stable。模板自带示例和官方导出的样例都是 4.6.2／PCK v3。格式相同，仍需分别验证微信运行时的渲染、触控、音频和 `user://` 保存。Node 仅验 JS 语法与解压后的 WASM，微信开发者工具导入、编译包大小、模拟器、真机均另记。
- [WXWebAssembly 文档](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-webassembly.html)列出基础库 v2.14.0 之后的 `.wasm.br` 支持。[GLX](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-emscriptenglx.html)要求更高（基础库 ≥3.8.12；iOS 高性能+或支持的 Android）。模板默认 GLX，不可用时回退 WebGL2。遇到黑屏可用 `--webgl2` 新组装一份诊断包，仍需设备支持 WebGL2。模板保留 `iOSHighPerformance` 和 `iOSHighPerformance+`；[微信文档](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-high-performance-plus.html)说明高性能+的账号开通和客户端要求，`game.json` 不能代替这些条件。此次未修改系统或 DevTools 的实验开关。

## 包体与资源托管

[微信分包文档](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.html)规定主包不超过 4M，主包与分包合计不超过 30M，单个普通分包无单独上限，独立分包不超过 4M。脚本按十进制 4,000,000／30,000,000 字节保守核算，计入目录里的配置和许可证。此数值用于本地验收；开发者工具编译后的计数仍需实测。

模板的 `engine/godot.wasm.br` 是 7,881,201 B，放在普通 `engine/` 分包，不能挪进主包或标成独立分包。WASM 解压后约 67.8 MB，磁盘包体通过不代表首次下载或内存峰值已验证。单关原型可随包交付；26 关版需外置地图和关卡大资源。

26 关版的完整 Web PCK 超过微信合计上限。先用 `split-release-pck.py --pck <完整Web PCK> --output <新目录> --base-url https://<资源域名>/<目录>/` 生成 `core.pck` 和 `packs/`；只将 `core.pck` 传给 `assemble-wechat.py`。地图、贴图和音频在 `packs/`，引擎、规则和存档代码仍在包内。Godot 网页的按需下载和缓存已通过浏览器测试；微信适配环境的网络、文件持久化和挂载另测。当前的内网 HTTPS 预览地址只用于本地校验，不作正式小游戏的资源地址。外置资源才需要 HTTPS 对象存储/CDN，配置微信允许的 `downloadFile` 域名及备案，按版本缓存并核对状态码和摘要。[网络要求](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.html) · [单次下载最多 200 MB](https://developers.weixin.qq.com/minigame/dev/api/network/download/wx.downloadFile.html) · [普通本地缓存和用户文件合计 200 MB](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/file-system.html)。外置资源需要另做下载、用户目录存储和挂载逻辑；不能把模板的 PCK 路径直接换成 URL。模板使用的 `WXWebAssembly.instantiate` 也只接受代码包内路径，WASM 继续随代码分包。
