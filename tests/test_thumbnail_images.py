import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from thumbnail_images import attach_thumbnails, prune_thumbnails
try:
    from PIL import Image
except ImportError:
    Image = None


@unittest.skipIf(Image is None, 'Run these encoder tests with .venv/bin/python or install requirements.txt')
class ThumbnailTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.test-', dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def build(self, path):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        photo = dict(atlas=True, collections=[], albums=[])
        retained = attach_thumbnails(self.root, {'test': photo}, {'test': dict(path=path, digest=digest)})
        return photo, retained

    def test_responsive_webp_dimensions_cache_and_original_integrity(self):
        source = self.root / 'photograph.jpg'
        Image.effect_noise((1800, 1200), 64).convert('RGB').save(source, quality=92)
        before = source.read_bytes()
        photo, retained = self.build(source)
        self.assertEqual([(v['width'], v['height']) for v in photo['thumbnailVariants']], [(480, 320), (960, 640)])
        for variant in photo['thumbnailVariants']:
            target = self.root / variant['src']
            with Image.open(target) as image:
                self.assertEqual(image.format, 'WEBP')
                self.assertEqual(image.size, (variant['width'], variant['height']))
            self.assertLess(target.stat().st_size, len(before))
        mtimes = {name: (self.root / 'generated/thumbnails' / name).stat().st_mtime_ns for name in retained}
        self.build(source)
        self.assertEqual(mtimes, {name: (self.root / 'generated/thumbnails' / name).stat().st_mtime_ns for name in retained})
        self.assertEqual(source.read_bytes(), before)
        # A missing derivative is automatically rebuilt, rather than leaving a broken grid URL.
        (self.root / photo['thumbnailSrc']).unlink()
        self.build(source)
        self.assertTrue((self.root / photo['thumbnailSrc']).is_file())

    def test_exif_rotation_is_applied_without_changing_source(self):
        source = self.root / 'portrait.jpg'
        image = Image.new('RGB', (1200, 800), 'royalblue')
        exif = Image.Exif()
        exif[274] = 6
        image.save(source, exif=exif)
        before = source.read_bytes()
        photo, _ = self.build(source)
        self.assertEqual((photo['displayWidth'], photo['displayHeight']), (800, 1200))
        with Image.open(self.root / photo['thumbnailSrc']) as thumbnail:
            self.assertEqual(thumbnail.size, (320, 480))
            self.assertIsNone(thumbnail.getexif().get(274))
        self.assertEqual(source.read_bytes(), before)

    def test_small_transparent_image_is_not_upscaled(self):
        source = self.root / 'transparent.png'
        Image.new('RGBA', (64, 40), (80, 140, 220, 128)).save(source)
        photo, _ = self.build(source)
        self.assertEqual(len(photo['thumbnailVariants']), 1)
        with Image.open(self.root / photo['thumbnailSrc']) as thumbnail:
            self.assertEqual(thumbnail.size, (64, 40))
            self.assertEqual(thumbnail.getchannel('A').getextrema(), (128, 128))

    def test_replaced_image_uses_new_urls_and_prunes_only_generated_files(self):
        source = self.root / 'replace.jpg'
        Image.new('RGB', (1000, 600), 'red').save(source)
        first, old_files = self.build(source)
        note = self.root / 'generated/thumbnails/keep.txt'
        note.write_text('not an owned thumbnail')
        Image.new('RGB', (1000, 600), 'green').save(source)
        second, retained = self.build(source)
        self.assertNotEqual(first['thumbnailSrc'], second['thumbnailSrc'])
        prune_thumbnails(self.root, retained)
        self.assertTrue(all(not (self.root / 'generated/thumbnails' / name).exists() for name in old_files))
        self.assertTrue(note.is_file())
        self.assertTrue((self.root / second['thumbnailSrc']).is_file())


if __name__ == '__main__':
    unittest.main()
