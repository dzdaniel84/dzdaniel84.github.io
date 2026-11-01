"""Shared public routes for the local preview and GitHub Pages artifact."""
import html
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

AUTHORED_PAGES = ('index.html', 'about.html', 'photography.html', 'world-albums.html', 'work.html', '404.html')
ALIASES = {'photography': 'albums'}


def public_route(filename):
    if filename == 'index.html':
        return '/'
    if filename == '404.html':
        return '/404.html'
    slug = Path(filename).stem
    if slug.startswith('country-'):
        return '/world-albums/' + slug[len('country-'):] + '/'
    return '/' + ALIASES.get(slug, slug) + '/'


def output_path(filename):
    route = public_route(filename)
    return filename if filename in {'404.html', 'work.html'} else route.lstrip('/') + 'index.html'


def clean_ref(value, current):
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return value
    path = parsed.path
    if path.rstrip('/') == '/country-albums':
        path = '/world-albums/'
    elif not path:
        path = public_route(current)
    elif re.fullmatch(r'/?[a-z0-9-]+\.html', path):
        path = public_route(path.lstrip('/'))
    return urlunsplit(('', '', path, parsed.query, parsed.fragment))


def clean_html(text, filename):
    # A root base keeps existing runtime fetches and photo paths working at any depth.
    text = re.sub(r'<base\b[^>]*>', '', text, flags=re.I)
    text = text.replace('<head>', '<head>\n<base href="/">', 1)
    text = re.sub(r'(\bhref\s*=\s*)(["\'])(.*?)\2',
                  lambda m: m[1] + m[2] + html.escape(clean_ref(html.unescape(m[3]), filename), quote=True) + m[2],
                  text, flags=re.I)
    text = re.sub(r'(url=)([a-z0-9-]+\.html(?:#[a-z0-9-]+)?)',
                  lambda m: m[1] + clean_ref(m[2], filename), text, flags=re.I)
    return text


def clean_catalog(catalog):
    for section in ('galleries', 'countryAlbums'):
        for entry in catalog.get(section, []):
            entry['page'] = clean_ref(entry['page'], 'index.html')
    return catalog


def legacy_routes(filename):
    if filename == 'world-albums.html':
        return ['/country-albums/']
    if Path(filename).stem.startswith('country-'):
        return ['/' + Path(filename).stem[len('country-'):] + '/']
    return []


def redirect_html(filename):
    target = public_route(filename)
    if filename == 'work.html':
        target = '/about/#engineering'
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="robots" content="noindex,follow">'
            '<meta http-equiv="refresh" content="0;url=' + target + '">'
            '<link rel="canonical" href="' + target + '"><title>Page moved</title>'
            '<script>location.replace(' + json.dumps(target.split('#')[0]) +
            '+location.search+(location.hash||' + json.dumps('#engineering' if filename == 'work.html' else '') +
            '));</script></head><body><a href="' + target + '">Continue</a></body></html>')


def write_preview_routes(root, generated_pages):
    names = set(generated_pages) | {name for name in AUTHORED_PAGES if (root / name).is_file()}
    destinations = {}
    for name in names:
        destination = output_path(name)
        if destination in destinations:
            raise ValueError('Conflicting public routes: ' + name + ', ' + destinations[destination])
        destinations[destination] = name
    for name in names:
        target = root / output_path(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(clean_html((root / name).read_text(), name))
        for old_route in legacy_routes(name):
            legacy = root / old_route.lstrip('/') / 'index.html'
            legacy.parent.mkdir(parents=True, exist_ok=True)
            legacy.write_text(redirect_html(name))
