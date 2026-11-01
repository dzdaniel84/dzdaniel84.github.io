import hashlib
import json
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import quote
from xml.etree import ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_site import BuildError, PAGES, RUNTIME, build, site_url, stage_site


class PublicBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.test-', dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for directory in ('generated', 'assets', 'content/galleries/example', 'content/carousel', 'templates'):
            (self.root / directory).mkdir(parents=True)
        self.image = self.root / 'content/galleries/example/photo one.jpg'
        Image.new('RGB', (32, 24), 'blue').save(self.image)
        Image.new('RGB', (32, 24), 'red').save(self.image.with_name('unused.jpg'))
        self.src = quote(self.image.relative_to(self.root).as_posix())
        self.photo = dict(id='example', src=self.src, title='Example', location='Paris', country='France')
        (self.root / 'site.json').write_text(json.dumps(dict(url='https://example.com', name='Daniel Zhang', description='Photographs.')))
        self.catalog = dict(photos=[self.photo], carousel=[self.photo], galleries=[], countryAlbums=[])
        (self.root / 'generated/content.json').write_text(json.dumps(self.catalog))
        (self.root / 'generated/pages.json').write_text('[]')
        for name in PAGES:
            (self.root / name).write_text('<html><head><title>Example</title><meta name="description" content="Old description"></head><body><main id="main"><h1>Example</h1><section id="engineering"></section><a href="about.html#engineering">About</a><img src="' + self.src + '" alt="Rain &amp; light"></main></body></html>')
        world = self.root / 'world-albums.html'
        world.write_text(world.read_text().replace('</main>', '<section id="country-albums"></section></main>'))
        for name in RUNTIME:
            (self.root / name).write_text('')
        (self.root / 'cv.pdf').write_bytes(b'%PDF-test')
        (self.root / '.nojekyll').write_text('')
        (self.root / 'assets/favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
        (self.root / 'assets/LICENSE.txt').write_text('Vendor license')
        (self.root / 'content/galleries/example/metadata.json').write_text('{"internal":true}')
        (self.root / 'content/galleries/example/photos.csv').write_text('filename\nphoto one.jpg\n')
        (self.root / 'README.md').write_text('Build instructions')

    def stage(self, name='public', base=None):
        output = self.root / name
        output.mkdir()
        return output, stage_site(self.root, output, base)

    def test_only_runtime_and_referenced_images_are_published(self):
        self.image.chmod(0o600)
        output, report = self.stage()
        self.assertTrue((output / self.image.relative_to(self.root)).is_file())
        self.assertEqual(stat.S_IMODE((output / self.image.relative_to(self.root)).stat().st_mode), 0o644)
        self.assertFalse((output / self.image.with_name('unused.jpg').relative_to(self.root)).exists())
        self.assertTrue((output / 'generated/content.json').is_file())
        self.assertTrue((output / 'assets/LICENSE.txt').is_file())
        self.assertTrue((output / 'cv.pdf').is_file())
        for name in ('README.md', 'site.json', 'generated/pages.json', 'content/galleries/example/photos.csv',
                     'content/galleries/example/metadata.json', 'templates', 'scripts', 'tests', 'work', '.venv'):
            self.assertFalse((output / name).exists(), name)
        self.assertEqual(report['pages'], len(PAGES))

    def test_metadata_sitemap_and_robots_follow_the_configured_domain(self):
        output, _ = self.stage(base='https://new.example')
        page = (output / 'index.html').read_text()
        self.assertIn('rel="canonical" href="https://new.example/"', page)
        self.assertIn('https://new.example/' + self.src, page)
        self.assertIn('twitter:card', page)
        self.assertEqual(page.count('name="description"'), 1)
        self.assertIn('name="description" content="Photographs."', page)
        self.assertIn('Rain &amp; light', page)
        self.assertIn('content="noindex,follow"', (output / '404.html').read_text())
        self.assertIn('canonical" href="https://new.example/about/"', (output / 'work.html').read_text())
        urls = [node.text for node in ET.parse(output / 'sitemap.xml').iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
        self.assertNotIn('https://new.example/404.html', urls)
        self.assertNotIn('https://new.example/work.html', urls)
        self.assertEqual(len(urls), len(PAGES) - 2)
        self.assertIn('https://new.example/sitemap.xml', (output / 'robots.txt').read_text())

    def test_missing_asset_preserves_the_last_valid_artifact(self):
        with patch('build_site.sync'):
            build(self.root)
            before = (self.root / '_site/index.html').read_bytes()
            self.image.unlink()
            with self.assertRaisesRegex(BuildError, 'Missing public file'):
                build(self.root)
            self.assertEqual((self.root / '_site/index.html').read_bytes(), before)

    def test_broken_fragments_and_mismatched_custom_domains_fail(self):
        p = self.root / 'about.html'
        p.write_text(p.read_text().replace('href="about.html#engineering"', 'href="about.html#typo"'))
        with self.assertRaisesRegex(BuildError, 'missing anchor'):
            self.stage()
        p.write_text(p.read_text().replace('about.html#typo', 'about.html#engineering'))
        (self.root / 'CNAME').write_text('another.example')
        with self.assertRaisesRegex(BuildError, 'CNAME differs'):
            self.stage('other')

    def test_symlinked_images_are_rejected(self):
        target = self.root / 'outside-photo.jpg'
        self.image.rename(target)
        self.image.symlink_to(target)
        with self.assertRaisesRegex(BuildError, 'real files inside the project'):
            self.stage()

    def test_repeated_builds_produce_identical_public_bytes(self):
        first, _ = self.stage('first')
        second, _ = self.stage('second')
        def hashes(directory):
            return {p.relative_to(directory).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in directory.rglob('*') if p.is_file()}
        self.assertEqual(hashes(first), hashes(second))

    def test_fresh_checkout_builds_without_generated_files_or_backup_folders(self):
        shutil.rmtree(self.root / 'generated')
        self.image.with_name('unused.jpg').unlink()
        self.image.with_name('metadata.json').unlink()
        self.image.with_name('photos.csv').write_text('filename,title,location,country\nphoto one.jpg,Example,Paris,France\n')
        for name in ('manual-gallery.html', 'manual-country.html'):
            shutil.copyfile(ROOT / 'templates' / name, self.root / 'templates' / name)
        # The homepage playlist is an explicit source input, independent of any old catalog.
        shutil.copyfile(self.image, self.root / 'content/carousel/slide.jpg')
        (self.root / 'content/carousel/photos.csv').write_text('filename,title,location,country\nslide.jpg,Example,Paris,France\n')
        self.assertFalse((self.root / 'work').exists())
        report = build(self.root)
        self.assertGreater(report['images'], 1)
        self.assertTrue((self.root / '_site/generated/content.json').is_file())
        self.assertTrue(list((self.root / '_site/generated/thumbnails').rglob('*.webp')))
        self.assertFalse(list((self.root / '_site/generated/thumbnails').rglob('*.json')))

    def test_clean_routes_support_direct_loads_and_legacy_bookmarks(self):
        self.catalog['countryAlbums'] = [dict(name='Norway', page='country-norway.html')]
        self.catalog['galleries'] = [dict(page='cityscapes.html')]
        (self.root / 'generated/content.json').write_text(json.dumps(self.catalog))
        (self.root / 'generated/pages.json').write_text(json.dumps(['country-norway.html', 'cityscapes.html']))
        for name in ('country-norway.html', 'cityscapes.html'):
            (self.root / name).write_text((self.root / 'about.html').read_text().replace('</main>', '<a href="#main">Top</a></main>'))
        output, _ = self.stage()
        self.assertIn('href="/about/#engineering"', (output / 'albums/index.html').read_text())
        page = (output / 'world-albums/norway/index.html').read_text()
        self.assertIn('<base href="/">', page)
        self.assertIn('href="/world-albums/norway/#main"', page)
        self.assertIn('0;url=/world-albums/norway/', (output / 'country-norway.html').read_text())
        self.assertIn('0;url=/world-albums/norway/', (output / 'norway/index.html').read_text())
        self.assertIn('0;url=/world-albums/', (output / 'country-albums/index.html').read_text())
        catalog = json.loads((output / 'generated/content.json').read_text())
        self.assertEqual(catalog['countryAlbums'][0]['page'], '/world-albums/norway/')
        self.assertEqual(catalog['galleries'][0]['page'], '/cityscapes/')
        self.assertIn('https://example.com/world-albums/norway/', (output / 'sitemap.xml').read_text())
        self.assertNotIn('country-norway.html', (output / 'sitemap.xml').read_text())

    def test_site_url_rejects_wrong_origins(self):
        for value in ('http://example.com', 'https://example.com/path', 'https://user:pass@example.com'):
            with self.assertRaises(BuildError):
                site_url(value)


if __name__ == '__main__':
    unittest.main()
