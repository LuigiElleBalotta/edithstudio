#!/usr/bin/env python3
"""Cerca nel repository cose che non devono finire su un repository pubblico:
chiavi e password scritte nel codice, indirizzi IP, email vere, chiavi private.

Uso: python3 scripts/check_privacy.py   (esce con 1 se trova qualcosa)
Un esempio finto lo si puo' lasciare scrivendo `privacy-ok` nella stessa riga.
"""
import re
import subprocess
import sys

REGOLE = [
    ('chiave privata', re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----')),
    ('token GitHub', re.compile(r'\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}')),
    ('token generico lungo', re.compile(r'(?i)\b(api[_-]?key|secret|token|passw(or)?d)\b\s*[:=]\s*["\'][A-Za-z0-9/+_\-]{16,}["\']')),
    ('indirizzo IP', re.compile(r'\b(?!127\.0\.0\.1\b|0\.0\.0\.0\b)(\d{1,3}\.){3}\d{1,3}\b')),
    ('email', re.compile(r'\b[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b')),
]
# file che non sono testo (immagini) o che non vanno controllati
SALTA = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2')
SALTA_FILE = {'LICENSE', 'scripts/check_privacy.py'}


def main():
    files = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, check=True).stdout.split('\n')
    problemi = []
    for f in files:
        if not f or f in SALTA_FILE or f.lower().endswith(SALTA):
            continue
        try:
            testo = open(f, encoding='utf-8').read()
        except (UnicodeDecodeError, OSError):
            continue
        for n, riga in enumerate(testo.split('\n'), 1):
            if 'privacy-ok' in riga:
                continue
            for nome, rx in REGOLE:
                m = rx.search(riga)
                if m:
                    problemi.append('%s:%d: %s -> %s' % (f, n, nome, m.group(0)[:60]))
    if problemi:
        print('Trovato qualcosa che non dovrebbe stare in un repository pubblico:')
        print('\n'.join(problemi))
        return 1
    print('Nessun segreto, IP o email nei %d file controllati.' % len([f for f in files if f]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
