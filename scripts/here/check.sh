#!/bin/bash
# The checks in a chat that can't install npm packages (docs/making-changes.md, "No packages here"). Everything comes
# from source: esbuild, TypeScript and Playwright from /opt/npm-tools, Chrome from /usr/bin/google-chrome, and the
# libraries (convex, convex-test, preact, fflate) cloned from GitHub into $HERE/src. GitHub's check (a ci-<topic>
# branch) stays the judge before main: the fonts, web-push and the size budgets are only real there.
#
#   scripts/here/check.sh setup                    once per chat (about a minute)
#   scripts/here/check.sh tc                       typecheck, both projects (only the repo's own errors are shown)
#   scripts/here/check.sh unit [tests/x.test.ts]   one unit test file, or all of them
#   scripts/here/check.sh build                    dist/
#   scripts/here/check.sh e2e "<name part>" [class|family]   run-throughs (build first); screenshots in $HERE/shots
set -e
HERE=${HERE:-/home/claude/runner}
export HERE
MINE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$MINE/../.." && pwd)"
S="$HERE/src"
TSC=/opt/npm-tools/node_modules/typescript/bin/tsc
cd "$REPO"
case "$1" in
  setup)
    mkdir -p "$S" "$HERE/types"
    cd "$S"
    [ -d convex-js ] || git clone -q --depth 1 https://github.com/get-convex/convex-js
    [ -d convex-test ] || git clone -q --depth 1 https://github.com/get-convex/convex-test
    [ -d preact ] || git clone -q --depth 1 --branch 10.29.8 https://github.com/preactjs/preact
    [ -d fflate ] || git clone -q --depth 1 https://github.com/101arrowz/fflate
    cat > "$HERE/types/stubs.d.ts" <<'TYPES'
declare module "*?raw" { const s: string; export default s; }
declare module "*.css" { const s: string; export default s; }
interface ImportMeta {
  glob(pattern: string, opts?: { eager?: boolean; query?: string; import?: string }): Record<string, any>;
  env: Record<string, string | undefined>;
}
declare module "vitest" {
  export const describe: any; export const test: any; export const it: any; export const expect: any; export const vi: any;
  export const beforeEach: any; export const afterEach: any; export const beforeAll: any; export const afterAll: any;
}
declare module "web-push" { const x: any; export default x; }
declare module "nosleep.js/src/media.js" { const media: { webm: string; mp4: string }; export default media; }
TYPES
    PATHS="\"convex/server\": [\"$S/convex-js/src/server/index.ts\"], \"convex/values\": [\"$S/convex-js/src/values/index.ts\"], \"convex/browser\": [\"$S/convex-js/src/browser/index.ts\"], \"preact\": [\"$S/preact/src/index.d.ts\"], \"preact/hooks\": [\"$S/preact/hooks/src/index.d.ts\"], \"preact/jsx-runtime\": [\"$S/preact/jsx-runtime/src/index.d.ts\"], \"fflate\": [\"$S/fflate/src/index.ts\"], \"convex-test\": [\"$S/convex-test/index.ts\"]"
    COMMON="\"strict\": true, \"moduleResolution\": \"Bundler\", \"jsx\": \"react-jsx\", \"jsxImportSource\": \"preact\", \"skipLibCheck\": true, \"allowSyntheticDefaultImports\": true, \"module\": \"ESNext\", \"isolatedModules\": true, \"noEmit\": true, \"ignoreDeprecations\": \"6.0\", \"baseUrl\": \".\", \"types\": []"
    echo "{ \"compilerOptions\": { \"allowJs\": true, \"target\": \"ESNext\", \"lib\": [\"ES2023\", \"dom\"], $COMMON, \"paths\": { $PATHS } }, \"include\": [\"$REPO/convex/**/*\", \"types/stubs.d.ts\"], \"exclude\": [\"$REPO/convex/_generated\"] }" > "$HERE/ts-convex.json"
    echo "{ \"compilerOptions\": { \"target\": \"ES2020\", \"lib\": [\"ES2022\", \"DOM\", \"DOM.Iterable\"], $COMMON, \"paths\": { $PATHS } }, \"include\": [\"$REPO/src\", \"$REPO/tests\", \"types/stubs.d.ts\"], \"exclude\": [\"$REPO/tests/e2e\"] }" > "$HERE/ts-src.json"
    echo "ready: $HERE"
    ;;
  tc)
    # The libraries' own complaints are dropped; tests/chime.test.ts shows 4 lines of "any" from the vitest stand-in's types.
    cd "$HERE"
    for p in ts-convex.json ts-src.json; do
      node $TSC -p $p 2>&1 | awk '/^[^ ]/ { show = ($0 !~ /^src\/(convex-js|convex-test|preact|fflate)\//) } show' | sed "s/^/[$p] /"
    done
    echo "typecheck done"
    ;;
  unit)
    if [ -n "$2" ]; then
      TZ=Asia/Colombo node --enable-source-maps "$MINE/runner.mjs" "$2" "$3"
    else
      total=0; bad=0
      for f in tests/*.test.ts; do
        out=$(TZ=Asia/Colombo node --enable-source-maps "$MINE/runner.mjs" "$f" 2>&1) || { bad=$((bad+1)); echo "$out" | grep -A6 "✗" | head -40; }
        n=$(echo "$out" | tail -1 | grep -o "^[0-9]* passed" | grep -o "[0-9]*"); total=$((total+${n:-0}))
      done
      echo "$total unit tests passed, $bad files with failures"
      [ "$bad" = 0 ]
    fi
    ;;
  build)
    CONVEX_URL=${CONVEX_URL:-https://qualified-fish-602.convex.cloud} node "$MINE/build.mjs" 2>&1 | tail -3
    ;;
  e2e)
    SHOTS=${SHOTS:-$HERE/shots} TZ=Asia/Colombo NODE_PATH=/opt/npm-tools/node_modules node --enable-source-maps "$MINE/runner.mjs" "tests/e2e/${3:-class}.e2e.ts" "$2"
    ;;
  *)
    sed -n '2,12p' "$0"
    ;;
esac
