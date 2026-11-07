# Toolchain-upgrade shell helpers. Load in every new shell, from the repo root:
#   source .claude/specs/toolchain-upgrade/helpers.sh
# Defines CTX (CDK context for dev) and verify().

CTX=(-c env=dev -c googleOAuthClientId=368028870-r89ptm9ri1l5hs8akpn8b6j7varhjiin.apps.googleusercontent.com)

_verify_detail() {
  case $1 in
    tsc-*)                echo "$(grep -c 'error TS' "$2") type errors" ;;
    test-back|test-front) sed 's/\x1b\[[0-9;]*m//g' "$2" | grep -E '^ *Tests ' | tail -1 | sed 's/^ *//' ;;
    test-infra)           grep -E '^Tests:' "$2" | tail -1 ;;
  esac
}

# Runs one check, saves its output to <logdir>/<name>.log and records a one-line result.
_verify_run() {
  local name=$1 result=ok
  shift
  "$@" >"$_verify_dir/$name.log" 2>&1 || result=FAIL
  _verify_results+=("$(printf '%-11s %-5s %s' "$name" "$result" "$(_verify_detail "$name" "$_verify_dir/$name.log")")")
}

# Compare the summary with the baseline in upgrade-runbook.md: a step passes when
# nothing got worse. Full output of each check is in the printed logs folder.
verify() {
  [ -f cdk.json ] && [ -d infra ] || { echo "verify: run it from the repo root"; return 1; }
  npm ci || return 1
  _verify_dir="${TMPDIR:-/tmp}/laski-verify/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$_verify_dir"
  _verify_results=()
  _verify_run tsc-root   npx tsc --noEmit -p tsconfig.json
  _verify_run tsc-infra  npx tsc --noEmit -p infra/tsconfig.json
  _verify_run tsc-front  npx tsc --noEmit -p front/tsconfig.json
  _verify_run test-back  npm test --workspace=back/lambdas
  _verify_run test-infra npm test --workspace=infra
  _verify_run test-front npm test --workspace=front
  _verify_run cdk-synth  npx cdk synth --strict "${CTX[@]}"
  echo
  printf '%s\n' "${_verify_results[@]}"
  echo "logs: $_verify_dir"
}
