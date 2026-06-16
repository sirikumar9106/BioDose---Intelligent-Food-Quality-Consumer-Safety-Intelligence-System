#!/usr/bin/env python
import os
import sys

# Ensure the backend directory itself is on sys.path so that
# top-level packages (models/, utils/, apps/) can all be imported.
BASE = os.path.dirname(os.path.abspath(__file__))
if BASE not in sys.path:
    sys.path.insert(0, BASE)


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "biodose.settings")

    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()