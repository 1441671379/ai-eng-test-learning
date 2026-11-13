import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from windows_service import native_kernel_cache


class KernelCacheTests(unittest.TestCase):
    def test_ascii_profile_keeps_its_own_cache(self):
        with tempfile.TemporaryDirectory(prefix='english-kernel-') as folder:
            cache = Path(native_kernel_cache(Path(folder)))
            self.assertEqual(cache, Path(folder) / 'kernel-cache')
            self.assertTrue(cache.is_dir())

    def test_unicode_profile_uses_a_separate_stable_ascii_cache(self):
        with tempfile.TemporaryDirectory(prefix='english-kernel-') as folder:
            system = Path(folder) / 'system'
            with patch.dict(os.environ, {'SystemRoot': str(system)}):
                first = native_kernel_cache(Path(folder) / '学习者')
                self.assertTrue(first.isascii())
                self.assertTrue(Path(first).is_relative_to(system / 'Temp'))
                self.assertEqual(first, native_kernel_cache(Path(folder) / '学习者'))
                self.assertNotEqual(first, native_kernel_cache(Path(folder) / '另一个学习者'))


if __name__ == '__main__':
    unittest.main()
