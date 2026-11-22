# Godot 分支约定

- 在 `godot-mini-game` 开发微信小游戏和 Godot 网页版；两个导出目标共用此目录的源工程。
- `main` 是原 React 网页版。Godot 功能不改动、推送或合入 `main`；根目录的 Web 源文件保留为旧版参考和素材来源。
- 编辑入口为 `project.godot`。提交场景、脚本、素材、资源导入配置和工具；不提交 `.godot/`、导出包、实际 AppID、本机预览地址或任何凭据。
- 保留仓库根目录 `AGENTS.md` 的关卡规则和浏览器验收要求。Godot 回归先运行 `tests/`；改 Web 导出再核对实际 HTML/WASM，微信运行环境单独验证。
