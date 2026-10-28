#!/usr/bin/env python3
"""Check and optionally push the exact tested source to the existing Pages branch."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
REMOTE = 'https://github.com/codusk2/kansai-events.git'
BRANCH = 'main'


def run(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-head', required=True)
    parser.add_argument('--owner', required=True)
    parser.add_argument('--push', action='store_true', help='Without this flag, only validate.')
    args = parser.parse_args()
    if run('git', 'status', '--porcelain'):
        raise SystemExit('Commit the reviewed source first; working tree must be clean.')
    if run('git', 'remote', 'get-url', 'origin') != REMOTE:
        raise SystemExit('Unexpected repository; do not publish.')
    lock = ROOT / '.publish-lock'
    try:
        lock.mkdir()
    except FileExistsError:
        raise SystemExit('Another publisher owns this checkout. Inspect before retrying.')
    try:
        (lock / 'owner.json').write_text(json.dumps({'owner': args.owner, 'baseline': args.expected_head}))
        remote_head = run('git', 'ls-remote', REMOTE, 'refs/heads/' + BRANCH).split()[0]
        if remote_head != args.expected_head:
            raise SystemExit('Remote baseline changed; fetch, review and reconcile.')
        subprocess.run(['git', 'merge-base', '--is-ancestor', args.expected_head, 'HEAD'], cwd=ROOT, check=True)
        head = run('git', 'rev-parse', 'HEAD')
        subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests'], cwd=ROOT, check=True)
        subprocess.run(['node', '--test', 'tests/storage.test.cjs'], cwd=ROOT, check=True)
        subprocess.run([sys.executable, 'build_v2.py', '--events', 'events.json', '--template', 'template.html', '--output', 'index.html'], cwd=ROOT, check=True)
        if run('git', 'status', '--porcelain') or run('git', 'rev-parse', 'HEAD') != head:
            raise SystemExit('Rebuild changed reviewed source; review and recommit before publishing.')
        receipt = {'owner': args.owner, 'expectedHead': args.expected_head, 'commit': head,
                   'htmlSha256': hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest(),
                   'checkedAt': datetime.now(timezone.utc).isoformat(), 'pushed': False}
        if args.push:
            # Use the existing gh login in this process only. Never write tokens
            # or change global Git credential configuration.
            git = ['git']
            if shutil.which('gh'):
                git += ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential']
            subprocess.run(git + ['push', 'origin', 'HEAD:refs/heads/' + BRANCH], cwd=ROOT, check=True)
            if run('git', 'ls-remote', REMOTE, 'refs/heads/' + BRANCH).split()[0] != head:
                raise SystemExit('Push readback mismatch; inspect before retrying.')
            receipt['pushed'] = True
        directory = ROOT / '.local'
        directory.mkdir(exist_ok=True)
        (directory / 'publication.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt))
        print('Git push is separate from Pages deployment. Verify the Pages build and live HTML hash.')
    finally:
        (lock / 'owner.json').unlink(missing_ok=True)
        lock.rmdir()


if __name__ == '__main__':
    main()
