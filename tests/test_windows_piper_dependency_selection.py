from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_python315_runtime_with_isolated_python312_worker():
    builder = (ROOT / 'scripts/build_windows_py315.py').read_text()
    assert "'--python', '3.12'" in builder
    assert "'piper-tts==1.8.0'" in builder
    assert "'--managed-python'" in builder
    assert "'onnxruntime'" in builder


def test_build_always_requires_piper_and_bundles_it():
    builder = (ROOT / 'scripts/build_windows_py315.py').read_text()
    assert 'worker = build_worker(main_python)' in builder
    assert 'archive = verify_single_file_release(worker, main_python)' in builder
    assert 'subprocess.run' in builder
    assert "'--onefile'" in builder
    assert 'OpenmuktiPiperWorker.exe' in builder
    assert "'--collect-all', 'onnxruntime'" in builder
    strict = (ROOT / 'Build-With-Piper.bat').read_text()
    assert 'Build-Portable-EXEs.bat' in strict
