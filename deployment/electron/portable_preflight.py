"""Check the assembled interpreter without development environment paths."""
import importlib.metadata as metadata
import importlib.util
import json
import os
from pathlib import Path
import sys
root = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve()
python_root = root / 'runtime/python'
assert Path(sys.prefix).resolve() == python_root
assert Path(sys.base_prefix).resolve() == python_root
os.environ.update(HF_HOME=str(root / 'models'), HF_HUB_OFFLINE='1', ENGLISH_EXTERNAL_LLM_ONLY='1')
import torch
import torchaudio
import kokoro
import spacy
assert Path(torch.__file__).resolve().is_relative_to(python_root)
assert Path(kokoro.__file__).resolve().is_relative_to(python_root)
assert spacy.util.is_package('en_core_web_sm')
for removed in ['pytorch_lightning', 'peft', 'g2p_en', 'nltk', 'jieba', 'pypinyin', 'onnxruntime']:
    assert importlib.util.find_spec(removed) is None, removed
manifest = json.loads((root / 'bundle-manifest.json').read_text(encoding='utf-8'))
assert manifest['ttsProvider'] == 'kokoro'
assert not (root / 'gpt-sovits').exists()
result = {'portablePrefix': sys.prefix, 'python': sys.version.split()[0], 'torch': torch.__version__,
          'cuda': torch.version.cuda, 'cudaAvailable': torch.cuda.is_available(),
          'kokoro': metadata.version('kokoro'), 'transformers': metadata.version('transformers'),
          'provider': 'kokoro', 'voiceIds': manifest['voiceIds'], 'localLlmIncluded': False}
destination.mkdir(parents=True, exist_ok=True)
(destination / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
