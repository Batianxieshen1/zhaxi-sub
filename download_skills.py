#!/usr/bin/env python3
"""下载 taste-skill 仓库全部子 skill 到 .reasonix/skills/（保留 frontmatter）"""
import urllib.request, os

BASE = 'https://raw.githubusercontent.com/Leonxlnx/taste-skill/main/skills/'
SKILLS = {
    'design-taste-frontend':     'taste-skill/SKILL.md',
    'gpt-taste':                 'gpt-tasteskill/SKILL.md',
    'image-to-code':             'image-to-code-skill/SKILL.md',
    'imagegen-frontend-web':     'imagegen-frontend-web/SKILL.md',
    'imagegen-frontend-mobile':  'imagegen-frontend-mobile/SKILL.md',
    'brandkit':                  'brandkit/SKILL.md',
    'high-end-visual-design':    'soft-skill/SKILL.md',
    'full-output-enforcement':   'output-skill/SKILL.md',
    'minimalist-ui':             'minimalist-skill/SKILL.md',
    'industrial-brutalist-ui':   'brutalist-skill/SKILL.md',
    'stitch-design-taste':       'stitch-skill/SKILL.md',
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.reasonix', 'skills')
os.makedirs(OUT, exist_ok=True)
ok = fail = 0
for name, path in SKILLS.items():
    try:
        data = urllib.request.urlopen(BASE + path, timeout=30).read().decode('utf-8')
        with open(os.path.join(OUT, name + '.md'), 'w', encoding='utf-8') as f:
            f.write(data)
        print(f'OK   {name}.md ({len(data)} chars)')
        ok += 1
    except Exception as e:
        print(f'FAIL {name}: {e}')
        fail += 1
print(f'--- done: {ok} ok, {fail} fail ---')
