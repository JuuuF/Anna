#!/bin/sh
# Gives all files of the page a new version, so that browsers load the new files together.
# Run from the repository root before committing a change to the page:  sh tools/bump.sh
v=$(date +%Y%m%d%H%M)
sed -i -E "s/\\?v=[0-9a-z]+/?v=$v/g" index.html
echo "version $v"
