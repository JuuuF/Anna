#!/bin/sh
# Gives all files of the page a new version (see tools/bump.py). Run from the repository root before committing a change to the page.
exec python3 "$(dirname "$0")/bump.py"
