import type { LevelConfig } from '../types';
import rules from '@/content/first-aid/cpr/rules.json';
import view from '@/content/first-aid/cpr/presentation.json';
import skin from '@/content/first-aid/cpr/skin.json';
export { view as cprPresentation, skin as cprSkin };
export const cprLevel: LevelConfig = {
  id: rules.id, engine: 'first-aid-cpr', order: 407, kind: 'response',
  title: rules.title, shortTitle: rules.title, location: '社区广场 · 成人突然倒地',
  knowledge: rules.safety, task: '分工呼救、定位手位、练习节奏并完成交接',
  briefing: view.opening, duration: '从容练习 · 不设倒计时', riskSeconds: 0,
  accent: '#537e70', sceneRoom: 'aid', sceneMood: 'calm', goals: rules.goals,
  playable: true, previewImage: skin.scene,
};
export const cprLesson = {
  summary: '及时呼救、立即开始CPR、尽早取得AED；游戏输入不等于真实CPR技能。',
  publisher: '北京市卫生健康委员会（北京友谊医院）',
  url: 'https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jksh/202409/t20240912_3865801.html',
  result: '流程与输入节奏练习完成，协助者继续模拟救助',
  message: '接力已经接上，帮助仍在继续。这里只完成了游戏练习，不代表患者已经恢复。',
  points: [
    { title: '呼救与帮助并行', body: '成人无反应且无正常呼吸时，及时呼救、开始CPR并尽早使用AED；不为找手机、收道具或连击而等待。' },
    { title: '记住位置与节奏', body: '掌根在胸部中央、胸骨下半部，双手重叠、双臂伸直；成人按压节奏每分钟100—120次，并让胸廓充分回弹。' },
    { title: '接替不是停止', body: '按AED提示行动，分析和电击时所有人离开患者；随后按提示立即恢复CPR。屏幕不能测量深度，也不代替真实操作培训。' },
  ],
  sources: [{ publisher: '北京市卫健委 · 北京友谊医院急救科普', url: 'https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jksh/202409/t20240912_3865801.html' }],
};
