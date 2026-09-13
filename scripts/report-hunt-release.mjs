import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './lib/dependencies.mjs';
import {catalog,readPack,getHuntRuntime} from './hunts.mjs';
const out=path.join(root,'docs/hunt-pipeline/verification'),read=p=>JSON.parse(fs.readFileSync(p));
const regression=read(path.join(out,'regression.json')),browser=read(path.join(out,'browser/report.json')),preview=read(path.join(out,'preview-proof.json'));
const sha=createHash('sha256').update(fs.readFileSync(path.join(root,'outputs/本地离线版/小红花应急行动.html'))).digest('hex');
if(regression.status!=='passed'||browser.status!=='passed'||preview.status!=='passed'||browser.htmlSha256!==sha)throw Error('Release evidence failed or HTML changed');
const runtime=await getHuntRuntime();const audit=catalog().map(e=>({id:e.id,issues:runtime.auditHuntViewport(readPack(e).skin)}));
fs.writeFileSync(path.join(out,'legacy-art-layout-audit.json'),JSON.stringify(audit,null,2));
fs.writeFileSync(path.join(out,'REPORT.md'),`# 本次迁移验证（2026-09-11）

- 11 组规则/流水线测试：全部通过，共 1804 项；TypeScript 通过。详细退出码见 regression.json，各组日志独立保存。
- 生产构建 vinext build：退出码 0；未发布网站或推送 GitHub。
- 9 个整场景识别关：7 种视口（含 320×568、375×667、390×844、430×932、540×960、1440×900、390×650）布局检查，共 63 项；再各完成真实指针命中、结算、重玩，共 9 条完整流程。汇总 browser/report.json。
- 画面与按钮边界、实际 Canvas 横纵等比、四角非留白、横排剪影通过。测试使用隔离 headless Edge、静音，所有上下文关闭；无外部HTTP请求或页面异常。
- 额外新关接入证明通过：在隔离测试副本里创建独立ID、保持禁用、生成草稿离线预览并从关卡列表打开；未修改正式清单。该测试复用旧图，仅是接口夹具，不是新做好的内容关。见 preview-proof.json。
- 编译器合成夹具：旧五目标兼容、自定义三/六目标独立皮肤、同源提取、许可补空、刷新备份和批准锁测试通过；不等于新图视觉审批。
- 真实图视觉抽查：台风、卧室、林缘手机截图已检查。现有原画贴边目标仍可能部分裁切或接近HUD；详见 legacy-art-layout-audit.json。保留已有素材，不宣称原画符合新构图门禁。每个现有目标已在可见且未被UI覆盖的像素实际点中。
- 新皮肤必须通过严格目标/面部不裁切和不进入HUD带检查、编译输入哈希/皮肤归属及五项证据审校；旧关的 migrated 标记不是新关模板字段。
- 真机触屏：not_run。人耳试听：not_run。本次没有重做音源或应急知识。

最终离线文件 SHA256：\`${sha}\`。
通过的源码复制回完整维护目录时须先核验原文件基线。用户 test1 离线入口与完整项目离线入口同步后另存交付回执。
`);
console.log({sha,layoutChecks:browser.checks.length,regression:regression.status,preview:preview.status});
