#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
node --test tests/*.test.js
