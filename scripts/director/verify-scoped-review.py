"""Apply migrations and rollback-only review fixtures to an isolated Unix-socket PostgreSQL cluster."""
import os
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", choices=("review", "planning", "roles", "all"), default="review")
    args = parser.parse_args()
    server = shutil.which('postgres')
    candidates = [Path(server).resolve().parent] if server else []
    for root in ('/opt/homebrew/opt', '/usr/local/opt'):
        candidates.extend(sorted(Path(root).glob('postgresql*/bin'), reverse=True))
    bindir = next((path for path in candidates if (path / 'postgres').is_file()), None)
    binaries = {name: str(bindir / name) if bindir else shutil.which(name) for name in ('initdb', 'pg_ctl', 'psql')}
    if not all(binaries.values()):
        raise SystemExit('Local PostgreSQL tools are required; no shared database is used.')
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}

    def run(command, **kwargs):
        result = subprocess.run(command, text=True, capture_output=True, env=env, **kwargs)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        return result

    with tempfile.TemporaryDirectory(prefix='review-pg-', dir='/private/tmp') as temporary:
        directory = Path(temporary)
        data = directory / 'data'
        run([binaries['initdb'], '-D', str(data), '-U', 'review_fixture', '--auth=trust', '--no-locale'])
        options = "-c listen_addresses='' -c unix_socket_directories=" + str(directory) + ' -c shared_buffers=16MB -c fsync=off -c synchronous_commit=off -c full_page_writes=off'
        started = False
        try:
            run([binaries['pg_ctl'], '-D', str(data), '-l', str(directory / 'server.log'), '-o', options, '-w', 'start'])
            started = True
            psql = [binaries['psql'], '-X', '-h', str(directory), '-U', 'review_fixture', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
            run(psql, input="""
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
""")
            migrations = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
            for migration in migrations:
                print('Apply', migration.name, flush=True)
                run([*psql, '-f', str(migration)])
            fixtures = ['director-scoped-review.sql'] if args.fixture == 'review' else ['planning-admission.sql'] if args.fixture == 'planning' else ['workflow-role-recovery.sql'] if args.fixture == 'roles' else ['director-scoped-review.sql', 'planning-admission.sql', 'workflow-role-recovery.sql']
            for fixture in fixtures:
                result = run([*psql, '-f', str(ROOT / 'supabase/tests' / fixture)])
                print(result.stdout + result.stderr)
            print(f'Disposable PostgreSQL: {len(migrations)} migrations and {len(fixtures)} fixture(s) passed.')
        finally:
            if started:
                run([binaries['pg_ctl'], '-D', str(data), '-m', 'immediate', '-w', 'stop'])


if __name__ == '__main__':
    main()
