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
# @fileoverview Shell script to facilitate build-related tasks for Suspicious
# Site Reporter.
#

PYTHON_CMD="python"
JSCOMPILE_CMD="java -jar lib/closure-compiler/target/closure-compiler-v20190528.jar"
BUILD_DIR="build"
cd ${0%/*}

ssr_assert_dependencies() {
  # Check that required binaries are present
  type "$PYTHON_CMD" >/dev/null 2>&1 || {
    echo >&2 "Python is required to build Suspicious Site Reporter dependencies."
    exit 1
  }
  type java >/dev/null 2>&1 || {
    echo >&2 "Java is required to build Suspicious Site Reporter dependencies."
    exit 1
  }
  jversion=$(java -version 2>&1 | grep version | awk -F '"' '{print $2}')
  if [[ $jversion < "1.8" ]]; then
    echo "Java 1.8 or higher is required to build."
    exit 1
  fi
  # Check that required files are present
  files=(lib/closure-library \
    lib/closure-compiler/target/closure-compiler-v20190528.jar \
    lib/protoc/bin/protoc \
    lib/chrome_extensions.js \
  )
  for var in "${files[@]}"
  do
    if [ ! -e $var ]; then
      echo $var "not found"
      echo >&2 "Download libraries needed to build first. Use $0 install_deps."
      exit 1
    fi
  done
  echo "All dependencies met."
}

ssr_assert_jsdeps() {
  if [ ! -f "$BUILD_DIR/deps.js" ]; then
    ssr_generate_jsdeps
  fi
}

ssr_generate_jsdeps() {
  echo "Generating build/deps.js file..."
  mkdir -p "$BUILD_DIR"

  # Compile proto to JS
  PROTO_LIB_DIR="lib/protoc/protobuf-3.8.0/js"
  PROTO_FILES=(map.js message.js binary/arith.js binary/constants.js binary/decoder.js
    binary/encoder.js binary/reader.js binary/utils.js binary/writer.js)
  BUILD_PROTO_DIR="$BUILD_DIR/proto"
  echo "Compiling protobuf..."
  rm -rf "$BUILD_PROTO_DIR"
  mkdir -p "$BUILD_PROTO_DIR"
  lib/protoc/bin/protoc --js_out=library=$BUILD_PROTO_DIR/client_request,binary:. \
    ./client_request.proto
  for file in "${PROTO_FILES[@]}"
  do
    cp -f "$PROTO_LIB_DIR/$file" $BUILD_PROTO_DIR
  done
  echo ""

  $PYTHON_CMD lib/closure-library/closure/bin/build/depswriter.py \
    alerts.js background.js background_page.js content.js popup.js popup_page.js \
    --root_with_prefix="build/proto build/proto/" \
    > "$BUILD_DIR/deps.js"
}

ssr_build_clean() {
  echo "Cleaning all builds..."
  rm -rfv "$BUILD_DIR"
  echo "Done cleaning all builds."
}

ssr_clean_deps() {
  echo "Removing all build dependencies. Install them with ./do.sh install_deps."
  rm -rfv lib
  echo "Done removing build dependencies."
}

ssr_install_deps() {
  echo "Installing build dependencies..."
  ./download-libs.sh

  cd lib
  mkdir protoc; cd protoc
  OS="$1"
  if [ ! $OS == "win" ]; then
    wget https://github.com/google/protobuf/releases/download/v3.8.0/protoc-3.8.0-$OS-x86_64.zip
    unzip protoc-3.8.0-$OS-x86_64.zip
    rm protoc-3.8.0-$OS-x86_64.zip
  else
    wget https://github.com/google/protobuf/releases/download/v3.8.0/protoc-3.8.0-win64.zip
    unzip protoc-3.8.0-win64.zip
    rm protoc-3.8.0-win64.zip
  fi
  wget https://github.com/google/protobuf/releases/download/v3.8.0/protobuf-js-3.8.0.zip
  unzip protobuf-js-3.8.0.zip
  rm protobuf-js-3.8.0.zip
  cd ../..

  echo "Done installing build dependencies."
}

ssr_test() {
  echo "Test runner implementation in progress."
}

ssr_build_extension() {
  ssr_assert_dependencies
  set -e
  ssr_assert_jsdeps

  BUILD_EXT_DIR="$BUILD_DIR/extension"
  BUILD_PROTO_DIR="$BUILD_DIR/proto"
  echo "Building extension to $BUILD_EXT_DIR"
  rm -rf "$BUILD_EXT_DIR"
  mkdir -p "$BUILD_EXT_DIR"
  SRC_DIRS=( lib/closure-library/closure/goog )

  jscompile_ssr="$JSCOMPILE_CMD"
  for var in "${SRC_DIRS[@]}"
  do
    jscompile_ssr+=" --js='$var/**.js' --js='!$var/**_test.js'"
  done
  jscompile_ssr+=" --js='./alerts.js'"
  jscompile_ssr+=" --js='./background.js'"
  jscompile_ssr+=" --js='./background_page.js'"
  jscompile_ssr+=" --js='./content.js'"
  jscompile_ssr+=" --js='./popup.js'"
  jscompile_ssr+=" --js='./popup_page.js'"
  jscompile_ssr+=" --js='./tld/publicsuffixpatterns.js'"
  jscompile_ssr+=" --js='./tld/tld.js'"
  for var in "${BUILD_PROTO_DIR[@]}"
  do
    jscompile_ssr+=" --js='$var'"
  done

  # Compile JS files
  echo "Compiling JS files..."
  if [ ! "$1" == "dev" ]; then
    echo -n "." && $jscompile_ssr --entry_point "suspiciousSiteReporter.backgroundPage" \
      --js_output_file "$BUILD_EXT_DIR/background_bin.js" \
      --define API_URL='https://safebrowsing.google.com'
  else
    echo -n "." && $jscompile_ssr --entry_point "suspiciousSiteReporter.backgroundPage" \
      --js_output_file "$BUILD_EXT_DIR/dev_background_bin.js"
  fi
  echo -n "." && $jscompile_ssr --entry_point "suspiciousSiteReporter.popupPage" --js_output_file "$BUILD_EXT_DIR/popup_bin.js"
  echo -n "." && $jscompile_ssr --entry_point "suspiciousSiteReporter.Content" --js_output_file "$BUILD_EXT_DIR/content_bin.js"
  echo -n "." && $jscompile_ssr --entry_point "suspiciousSiteReporter.alerts" --js_output_file "$BUILD_EXT_DIR/alerts_bin.js"
  echo ""

  # Copy extension files
  echo "Copying extension files..."
  cp -f *.css "$BUILD_EXT_DIR"
  cp -f topsites.json "$BUILD_EXT_DIR"
  if [ "$1" == "dev" ]; then
    cp -f dev_manifest.json "$BUILD_EXT_DIR/manifest.json"
  else
    cp -f manifest.json "$BUILD_EXT_DIR"
  fi
  cp -f *.html "$BUILD_EXT_DIR"
  cp -fR images "$BUILD_EXT_DIR"

  echo "Done building extension."
}

RETVAL=0

CMD=$1
shift

case "$CMD" in
  check_deps)
    ssr_assert_dependencies;
    ;;
  install_deps)
    ssr_install_deps ${1:-linux};
    ;;
  build)
    ssr_build_extension "$1";
    ;;
  clean)
    ssr_build_clean;
    ;;
  clean_deps)
    ssr_clean_deps;
    ;;
  test)
    ssr_test;
    ;;
  *)
    echo "Usage:     $0 PARAMETER"
    echo "Setup:     $0 {install_deps [win/osx/linux]|check_deps}"
    echo "Build:     $0 {build} [dev]"
    echo "Cleanup:   $0 {clean|clean_deps}"
    echo "Test:      $0 {test}"
    RETVAL=1
esac

exit $RETVAL
