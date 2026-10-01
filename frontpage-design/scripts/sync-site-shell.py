"""Keep the static site's navigation and footer identical, without client-side injection."""
from pathlib import Path
from html import escape
import json
import re

ROOT = Path(__file__).resolve().parents[2] / 'web'
site_map = json.loads((ROOT / 'site-map.json').read_text())
HOME = {'index.html', 'audience-mock.html'}
STORIES = {'stories.html', 'brand-story.html', 'event-story.html', 'interior-story.html'}
FEATURES = {'studio-operations.html', 'client-relationships.html', 'shared-briefs.html', 'design-reviews.html', 'approvals.html'}

def active_page(page):
    if page in FEATURES: return 'platform.html'
    if page in STORIES: return 'stories.html'
    if page == 'pricing-research.html': return 'pricing.html'
    return page

def header(page):
    links = ''.join(f'<a href="{url}"' + (' aria-current="page"' if url == active_page(page) else '') + f'>{escape(label)}</a>' for label, url in site_map['navigation'])
    return f'''<header class="site-header cal-header">
  <div class="cal-header-inner">
    <a class="cal-brand" href="index.html#top" aria-label="Caleane home"><img src="assets/calenne-symbol-ivory.svg" alt="" width="25" height="25"><span>Caleane</span></a>
    <nav class="cal-nav" id="site-navigation" aria-label="Main navigation">{links}</nav>
    <div class="cal-header-actions"><a class="cal-login" data-app-link="login" href="get-started.html?mode=login">Log in</a><a class="cal-start" data-app-link="start" href="get-started.html">Start now</a></div>
    <button class="cal-menu-toggle" data-site-menu aria-controls="site-navigation" aria-expanded="false">Menu</button>
  </div>
</header>'''

def footer():
    groups = ''.join('<div class="cal-footer-column"><h3>' + escape(title) + '</h3>' + ''.join(f'<a href="{url}">{escape(label)}</a>' for label, url in links) + '</div>' for title, links in site_map['footer'].items())
    return f'''<footer class="cal-footer" id="site-footer">
  <div class="cal-footer-inner">
    <div class="cal-footer-top">
      <div class="cal-footer-brand"><a class="cal-brand" href="index.html#top" aria-label="Caleane home"><img src="assets/calenne-symbol-ivory.svg" alt="" width="25" height="25"><span>Caleane</span></a><p>A workspace for creative studios.<br>The people, the work and every decision, together.</p></div>
      <nav class="cal-footer-nav" aria-label="Footer navigation">{groups}</nav>
    </div>
    <div class="cal-footer-bottom"><span>© <span id="year">2026</span> Caleane</span><span>Illustrative projects &amp; concept photography</span><a href="#top">Back to top</a></div>
  </div>
</footer>'''

for path in sorted(ROOT.glob('*.html')):
    text = path.read_text()
    text = re.sub(r'<header\b[^>]*>.*?</header>', lambda _: header(path.name), text, count=1, flags=re.S)
    text = re.sub(r'<footer\b[^>]*>.*?</footer>', lambda _: footer(), text, count=1, flags=re.S)
    extra = ' platform-page' if path.name == 'platform.html' else ' reference-page' if path.name == 'design-reference.html' else ''
    text = re.sub(r'<body\b[^>]*>', '<body id="top" class="' + ('cal-home' if path.name in HOME else 'cal-page' + (' cal-story' if path.name in STORIES else '')) + extra + '">', text, count=1)
    text = re.sub(r'\s*<link rel="stylesheet" href="site-tokens.css[^"\n]*">', '', text)
    text = re.sub(r'\s*<link rel="stylesheet" href="site-shell.css[^"\n]*">', '', text)
    text = re.sub(r'\s*<link rel="stylesheet" href="page-polish.css[^"\n]*">', '', text)
    text = re.sub(r'\s*<script src="site-shell.js[^"\n]*" defer></script>', '', text)
    text = re.sub(r'\s*<script src="assets/website-ui.js[^"\n]*" defer></script>', '', text)
    text = re.sub(r'\s*<link rel="stylesheet" href="ui/website-ui.css[^"\n]*">', '', text)
    text = text.replace('</head>', '\n<link rel="stylesheet" href="site-tokens.css?v=20261001reference1">\n<link rel="stylesheet" href="site-shell.css?v=20261001radix1">\n<link rel="stylesheet" href="page-polish.css?v=20261001radix1">\n<link rel="stylesheet" href="ui/website-ui.css?v=20261001radix1">\n<script src="site-shell.js?v=20261001radix1" defer></script>\n</head>')
    text = re.sub(r'<script\b', '<script src="assets/website-ui.js?v=20261001radix1" defer></script>\n<script', text, count=1)
    text = re.sub(r'src="config.js(?:\?[^"\n]*)?"', 'src="config.js?v=20261001flow"', text)
    text = text.replace('href="audience-mock.html#', 'href="index.html#')
    text = text.replace('marketing.js?v=3', 'marketing.js?v=20261001flow').replace('site.js?v=20261001wire', 'site.js?v=20261001flow')
    text = re.sub(r'(src="(?:site|marketing|reference|platform-tour|product-review|page-finish)\.js)(?:\?[^"\n]*)?', r'\1?v=20261001radix1', text)
    path.write_text(text)
(ROOT / 'partials/header.html').write_text(header('') + '\n')
(ROOT / 'partials/footer.html').write_text(footer() + '\n')
print('Synced header and footer on', len(list(ROOT.glob('*.html'))), 'pages.')
