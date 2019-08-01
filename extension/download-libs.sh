#!/bin/bash
# Copyright 2019 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# @fileoverview Shell script to download Suspicious Site Reporter dependencies
#

type curl >/dev/null 2>&1 || {
  echo >&2 "Curl is required to build Suspicious Site Reporter dependencies."
  exit 1
}
type git >/dev/null 2>&1 || {
  echo >&2 "Git is required to build Suspicious Site Reporter dependencies."
  exit 1
}

if [ ! -d lib ]; then
  mkdir lib
fi
cd lib

# Checkout Closure library
if [ ! -d closure-library/.git ]; then
  git clone --depth 1 https://github.com/google/closure-library/ closure-library
fi

# Checkout Closure compiler
if [ ! -d closure-compiler/.git ]; then
  if [ -d closure-compiler ]; then # remove binary release directory
    rm -rf closure-compiler
  fi
  git clone --depth 1 https://github.com/google/closure-compiler/ closure-compiler
fi

# Build Closure compiler
if [ -d closure-compiler ]; then
  cd closure-compiler
  mkdir target; cd target
  curl https://dl.google.com/closure-compiler/compiler-20190528.zip -O
  unzip compiler-20190528.zip
  rm compiler-20190528.zip
  cd ../..
fi

# Check for Chrome extension externs
if [ ! -f chrome_extensions.js ]; then
  curl https://raw.githubusercontent.com/google/closure-compiler/master/contrib/externs/chrome_extensions.js -O
fi

cd ..
