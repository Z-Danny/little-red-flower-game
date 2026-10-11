import type { Lesson } from '../journey/knowledge';

/** Same reviewed scope as the AED response rules; not a training certification. */
export const aedLesson: Lesson = {
  summary: '按设备提示准备与贴片，分析和电击时清场，随后立即恢复CPR。',
  publisher: '美国红十字会',
  url: 'https://www.redcross.org/take-a-class/aed/using-an-aed/aed-steps',
  result: 'AED设备操作与双人配合练习完成，救助仍在继续',
  message: '设备操作与救助接力已经完成。这里完成的是游戏练习，不代表患者已经恢复，也不代替实际急救培训。',
  points: [
    { title: '准备时继续配合', body: '协助者继续CPR；你放置并开启AED，按题设露出并擦干贴片区域，按设备图示贴好电极片。' },
    { title: '让设备判断是否电击', body: '分析和电击时确认所有人不接触患者；只有设备建议电击且准备就绪时，才按提示执行电击。不是每次开机都要电击。' },
    { title: '两种分支都要接上CPR', body: '电击后或设备提示不建议电击时，按提示立即恢复CPR，保持电极片连接，继续配合并向急救人员交接。' },
  ],
  sources: [{ publisher: '美国红十字会 · AED Steps', url: 'https://www.redcross.org/take-a-class/aed/using-an-aed/aed-steps' }],
};
