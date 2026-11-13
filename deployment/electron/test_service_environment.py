"""Reproduce the packaged PATH, rather than relying on a developer terminal."""
import json
import os
from pathlib import Path
import subprocess
import unittest
from windows_service import service_environment

ROOT = Path(__file__).resolve().parents[2]


class ServiceEnvironmentTests(unittest.TestCase):
    def test_only_the_web_service_receives_the_trusted_windows_helper_directory(self):
        original = {'SYSTEMROOT': 'C:/Windows', 'Path': 'fixture-runtime', 'ENGLISH_EXTERNAL_LLM_ONLY': '1'}
        result = service_environment('web', original)
        self.assertEqual(result['PATH'], str(Path('C:/Windows/System32/WindowsPowerShell/v1.0')) + os.pathsep + 'fixture-runtime')
        self.assertEqual(result['ENGLISH_EXTERNAL_LLM_ONLY'], '1')
        self.assertEqual(service_environment('ai', original), original)
        self.assertEqual(original['Path'], 'fixture-runtime')
        self.assertEqual([key for key in result if key.upper() == 'PATH'], ['PATH'])

    @unittest.skipUnless(os.name == 'nt', 'Windows DPAPI')
    def test_real_dpapi_roundtrip_with_the_packaged_node_and_restricted_environment(self):
        system = os.environ['SystemRoot']
        env = {key: os.environ[key] for key in ['SystemRoot', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'] if key in os.environ}
        env['PATH'] = str(ROOT/'deployment/electron/build/EnglishLearning/resources/runtime/python') + ';' + system + '\\System32;' + system
        node = ROOT/'deployment/electron/build/EnglishLearning/resources/runtime/node.exe'
        probe = 'const {execFile}=require("node:child_process");execFile("powershell.exe",["-NoProfile","-Command","[Console]::Write(1)"],{windowsHide:true},e=>console.log(JSON.stringify({errorCode:e?.code||null})))'
        before = subprocess.run([str(node), '-e', probe], env=env, capture_output=True, text=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertEqual(json.loads(before.stdout)['errorCode'], 'ENOENT')
        # The actual app credential implementation, dummy-only data and private
        # temporary directories. This test never reads or overwrites saved keys.
        after = subprocess.run([str(node), '--test', '--import', './tests/register.mjs', 'tests/experiments/tencent-credentials.test.ts'],
            cwd=ROOT/'apps/web', env=service_environment('web', env), capture_output=True, text=True, encoding='utf-8',
            timeout=90, creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertEqual(after.returncode, 0, after.stdout + after.stderr)
        self.assertIn('pass 2', after.stdout)


if __name__ == '__main__':
    unittest.main()
