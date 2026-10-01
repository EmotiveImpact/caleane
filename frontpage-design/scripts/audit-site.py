"""Audit static page destinations, anchors, local resources and shared navigation."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import re

ROOT = Path(__file__).resolve().parents[2] / 'web'

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.ids = set()
        self.duplicates = []
        self.refs = []
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            if attrs['id'] in self.ids: self.duplicates.append(attrs['id'])
            self.ids.add(attrs['id'])
        for key in ('href', 'src', 'poster'):
            if key in attrs: self.refs.append((tag, key, attrs[key]))

pages = {p.name: Page(p) for p in ROOT.glob('*.html')}
errors = []
for name, page in sorted(pages.items()):
    errors.extend(f'{name}: duplicate id {value}' for value in page.duplicates)
    for tag, attribute, value in page.refs:
        ref = urlsplit(value)
        if ref.scheme or ref.netloc: continue
        if not value or value == '#':
            errors.append(f'{name}: empty destination on {tag}')
            continue
        target = (page.path.parent / unquote(ref.path)).resolve() if ref.path else page.path
        if not target.exists():
            errors.append(f'{name}: missing {attribute} {value}')
        elif ref.fragment and target.suffix == '.html':
            destination = pages.get(target.name)
            if destination and unquote(ref.fragment) not in destination.ids:
                errors.append(f'{name}: missing anchor {value}')
    text = page.path.read_text()
    for shell in ('header', 'footer'):
        found = re.search(r'<' + shell + r'\b[^>]*>.*?</' + shell + '>', text, re.S)
        if not found: errors.append(f'{name}: missing {shell}')
        elif shell == 'footer' and found.group() != re.search(r'<footer\b[^>]*>.*?</footer>', (ROOT / 'partials/footer.html').read_text(), re.S).group():
            errors.append(f'{name}: footer differs from shared template')
for path in ROOT.glob('*.css'):
    for value in re.findall(r'url\([\'"]?([^\)\'"\s]+)', path.read_text()):
        if not urlsplit(value).scheme and not (path.parent / urlsplit(value).path).exists():
            errors.append(f'{path.name}: missing CSS resource {value}')
footer_pages = {urlsplit(url).path for links in json.loads((ROOT / 'site-map.json').read_text())['footer'].values() for _, url in links}
missing = set(pages) - {'index.html', 'audience-mock.html'} - footer_pages
errors.extend(f'Footer omits {page}' for page in missing)
report = {'pages': len(pages), 'footer_destinations': len(footer_pages), 'errors': errors}
print(json.dumps(report, indent=2))
raise SystemExit(bool(errors))
