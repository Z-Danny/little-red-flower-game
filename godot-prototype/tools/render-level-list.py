"""Render the verified migration list as static, portable HTML."""
import argparse
from html import escape
import json
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    source = load(PROJECT / 'data/original_levels.json')
    all_levels = {s['id']: s for m in source['maps'] for s in m['stops']}
    migrated = {'oil-fire'}
    for gate in (PROJECT / 'assets').glob('*_runner/verified.json'):
        migrated.update(id_ for id_, record in load(gate)['levels'].items() if record.get('ready') is True)
    start = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>九岛关卡对照表</title>
<style>body{margin:0;background:#f5f2e7;color:#243e32;font-family:system-ui,sans-serif}main{max-width:780px;margin:auto;padding:24px}h1{font-size:28px}h2{margin:30px 0 8px;font-size:22px}a{color:#175f49}.summary{border-left:4px solid #b88143;padding:8px 14px;background:#fff8e5}ul{list-style:none;padding:0;background:#fffefa;border-radius:12px}li{display:grid;grid-template-columns:2.1em 1fr auto;gap:5px 12px;padding:11px 12px;border-bottom:1px solid #eee6d8}li:last-child{border:0}.id,.unlock{color:#5c675d;grid-column:2;font-size:13px;overflow-wrap:anywhere}.status{color:#645331;font-size:14px}.ready{color:#24624a}</style><main>
<a href="./">返回试玩</a><h1>九岛关卡对照表</h1>'''
    rows = [start, f'<p class="summary">{len(migrated)} 个旧版可玩关已迁移。6 个旧预告和 28 个新占位只显示介绍，保持锁定。按岛内从下往上的地图编号排列。</p>']
    for i, map_ in enumerate(source['maps'], start=1):
        rows.append(f'<h2>{i:02d}　{escape(map_["name"])}</h2><ul>')
        for s in map_['stops']:
            id_ = s['id']
            ready = s['was_playable'] and id_ in migrated
            text = '已迁移' if ready else '旧关待迁移' if s['was_playable'] else '旧预告' if s['status'] == 'preview' else '新占位'
            before = s['unlock_after']
            condition = f'前置：{all_levels[before]["title"]}' if ready and before in all_levels else ('可直接进入' if ready else '尚未开放')
            rows.append(f'<li><span>{s["number"]:02d}</span><strong>{escape(s["title"])}</strong><span class="status{" ready" if ready else ""}">{text}</span><span class="id">{escape(id_)}</span><span class="unlock">{escape(condition)}</span></li>')
        rows.append('</ul>')
    rows.append('</main></html>')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text('\n'.join(rows)+'\n', encoding='utf-8')
    print(f'{len(migrated)} migrated / {len(all_levels)} entries: {args.output}')


if __name__ == '__main__':
    main()
