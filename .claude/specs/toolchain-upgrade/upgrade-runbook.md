# Toolchain and Dependency Upgrade Runbook

**Prepared**: 2026-11-06 · **Executed by**: you, manually · **Environment**: dev (`us-west-2`, dev account)
**When**: before Phase 1 of `.claude/specs/relational-migration/`. Freeze versions afterwards until the migration cutover is done.

## Why now (and not during or after the migration)

- **A failure is clearly the upgrade's fault.** The current DynamoDB app works and has tests, so any break comes from the upgrade, not the migration.
- **Migration code is written once.** About 20 handlers, the repositories and the CDK changes get written on the final TypeScript, Vitest, CDK and Node versions.
- **Each step can be verified for real.** The old app still deploys, so every step can be checked in dev.
- **Your rules require it.** Version upgrades are dedicated tasks (`.claude/steering/shared-standards.md`), and a dependency shared by several workspaces is upgraded in all of them in the same commit.

## Environment when this was prepared

| Item | Value |
|---|---|
| OS | Ubuntu 26.04.1 LTS on WSL2, x86_64, zsh |
| Node | v24.21.0 via nvm 0.40.1 (`~/.nvm`) |
| npm | 12.2.0 |
| AWS CLI | v2.37.12, official installer (`/usr/local/aws-cli`) |
| psql | not installed |
| Repo | one root `package-lock.json`; workspaces `back/*`, `front`, `infra` |

## Target versions (checked 2026-11-06)

Versions may have moved by the time you run this. Check with `npm view <pkg> version`, and always pin exact versions (`--save-exact`).

| Package | Where | From | To | Note |
|---|---|---|---|---|
| Node (local) | nvm | 24.21.0 | 24.22.2 (LTS "Krypton") | |
| npm (global) | nvm | 12.2.0 | 12.2.2 | |
| `@aws-sdk/*` (6 packages) | back/lambdas | 3.470.0 | 3.1164.0 | Task 0.1 of the migration |
| `aws-cdk-lib` | root + infra | 2.244.0 | 2.275.0 | |
| `aws-cdk` (CLI) | root | `^2.1112.0` | 2.1148.0 | removes `^` |
| `constructs` | root | `^10.6.0` | 10.8.1 | removes `^` |
| `esbuild` | root | `^0.19.11` | 0.28.2 | removes `^` |
| Lambda runtime | infra | `NODEJS_22_X` | `NODEJS_24_X` | `nodejs24.x` is supported in Lambda; Node 20 was deprecated 2026-04-30 |
| `@types/node` | root | 20.19.27 | 24.19.2 | matches Node 24 |
| `typescript` | root + front | 5.9.3 | **6.0.3** | **not 7.0.2** (see below) |
| `vitest` | back + front | 3.2.4 / 4.1.0 | 5.1.0 | major jump; aligns both workspaces |
| `fast-check` | back + front | 3.23.2 / 4.6.0 | 4.10.2 | major jump in back |
| `jest` / `@types/jest` / `ts-jest` | infra | 29.7.0 / 29.5.14 / 29.3.4 | 30.5.2 / 30.0.0 / 29.4.15 | |
| `zod` | back + front | 4.3.6 | 4.6.7 | |
| `@anthropic-ai/sdk` | back | 0.39.0 | 1.6.0 | major; used by the statement LLM parser |
| `@types/aws-lambda` | back | 8.10.130 | 8.10.164 | |
| `dotenv` | back | 17.2.3 | remove if unused, else 18.0.9 | no usage found in `src/` |
| `uuid` / `@types/uuid` | back | 9.0.1 / 9.0.7 | **leave as is** | the migration removes them (`crypto.randomUUID()`) |
| React / react-dom / react-is | front | 19.2.4 | 19.3.1 | |
| `@types/react` / `@types/react-dom` | front | 19.2.14 / 19.2.3 | 19.3.0 / 19.3.0 | |
| `@chakra-ui/react` | front | 3.34.0 | 3.38.0 | `@emotion/react` 11.14.0 is already latest |
| `aws-amplify` | front | 6.16.3 | 6.22.2 | |
| `recharts` | front | 3.8.1 | 3.10.1 | |
| `react-router-dom` | front | 7.13.1 | 7.18.5 | |
| `vite` / `@vitejs/plugin-react` | front | 8.0.1 / 6.0.1 | 8.3.6 / 6.2.1 | |
| `jsdom` | front | 29.0.1 | 31.0.0 | major |
| `@testing-library/*` | front | dom 10.4.0, jest-dom 6.9.1, react 16.3.2, user-event 14.6.1 | 10.4.2, **7.0.1**, 16.3.3, 14.6.8 | jest-dom is a major jump |

**Why TypeScript 6 and not 7:** `ts-jest@29.4.15` declares `typescript: ">=4.3 <7"`, and the CDK app runs through `ts-node` (`cdk.json`: `npx ts-node --prefer-ts-exts infra/bin/infra.ts`), which depends on the classic compiler API that TypeScript 7's native rewrite changes. Treat TypeScript 7 as a separate task once your tooling supports it, for example by moving the CDK app to `tsx`.

## Progress checklist

- [x] Step 0: Ubuntu toolchain
- [x] Step 1: branch, helpers, baseline (recorded 2026-11-07, see **Baseline** below)
- [x] Step 2: AWS SDK alignment, deployed to dev (commit `679ef8f`, all 4 stacks `UPDATE_COMPLETE` 2026-11-07 18:50)
- [x] Step 3: CDK, constructs, esbuild, deployed to dev (`66833ca`)
- [x] Step 4: Lambda `nodejs24.x`, `@types/node` 24, `.nvmrc`, deployed and smoke-tested (`c25552b`; smoke test = direct read-only Lambda invocations)
- [x] Step 5a: TypeScript 6 (`66fda69`)
- [x] Step 5b: Vitest 5, fast-check 4, Jest 30 (`1540a38`, follow-up `62435e1`)
- [x] Step 6: backend libraries, deployed (`3224bb0`); statement upload tested in dev by hand (works with default sampling)
- [x] Step 7: frontend, built, `deploy-front.sh` (Amplify job 29) (`d4964dc`, `7fd8077`); manual pass done (email + Google login, lists, forms, link widget)
- [x] PR merged (https://github.com/LaskiTech/laski-finances-serverless/pull/8, merged 2026-11-07); migration spec updated (`NODEJS_24_X`, CDK 2.275.0, design §Toolchain baseline, Tasks 0.1/0.4/1.1/7.2)

### Where the 2026-11-07 run differed from the steps below

- **Step 3:** CDK 2.275 warns about the unset cross-stack reference strength, which fails `synth --strict`. Set `"@aws-cdk/core:defaultCrossStackReferences": "strong"` in `cdk.json` (no template change). Also `CfnResource.addDependency` → `addResourceDependency`.
- **Step 4:** also updated `.claude/agents/infra-cdk.md` and the test name at `stacks.test.ts:246`. `tsc-root` gained 1 DOM-type error (`Crypto`, same pre-existing category).
- **Step 5a:** `ts-jest` 29.4.15 moved here from 5b (29.3.4 rejects TS 6). TS 6 defaults `types` to `[]`: root uses `["node", "jest"]`, infra `["node", "jest"]`. `baseUrl` and the unused `paths` were dropped, and infra moved to `Node16`.
- **Step 5b:** Vitest 5 needs `vite` as a peer, pinned at 8.3.6 in root, back and front (moved forward from Step 7) so npm hoists it. The back test mocks that are constructed with `new` use `function` instead of arrows. Front setup imports `@testing-library/jest-dom/vitest`. fast-check 4 `fc.date` needs `noInvalidDate: true`.
- **Step 6:** `dotenv` **is** imported (by `src/transactions/invoke-local.ts`, never called), so it went to 18.0.9. Anthropic SDK 1.x sends API `2026-10-21`, so `temperature: 0` was removed (owner's choice).
- **Step 7:** `front/.env` was missing on this machine. It was recreated (gitignored) from the values in the live dev bundle; note that `VITE_API_URL` has **no** trailing slash. The front build was broken on a clean checkout (`*.d.ts` is gitignored, so `vite-env.d.ts` never existed). It now has `"types": ["vite/client"]` and `"rootDir": "./src"` (TS 6 TS5011).

**Baseline after the run:** `tsc-root` 1161 (pre-existing category, plus 3 upstream jest-dom/Vitest 5 lib errors), `tsc-infra` 0, `tsc-front` 0, `test-back` 2 failed (missing `.kiro` fixtures), `test-infra` 95/95, `test-front` 100/100, `cdk-synth` ok.

---

## Resuming in a new shell

`CTX` and `verify()` live only in the shell that loaded them, from `helpers.sh` in this folder. Run this whenever you open a new terminal to continue:

```bash
cd ~/github/laski/laski-finances-serverless
git switch chore/toolchain-upgrade
nvm use 24
source .claude/specs/toolchain-upgrade/helpers.sh
type verify | head -1           # must print "verify is a shell function"
git log --oneline main..HEAD    # shows which steps are already committed
```

**Run each step's commands one at a time, never the whole block at once.** A pasted block keeps going after a failure, so a failed `verify` or `cdk diff` would still reach `deploy` and `git commit`.

**`verify` prints nothing after `npm ci` until every check has finished** (about 1–2 minutes). Don't interrupt it. Interrupting skips the remaining checks, including `cdk-synth`.

### Baseline (2026-11-07, Node 24.22.2, npm 12.2.2)

`verify` prints one line per check. A step passes when no line is worse than this:

```
tsc-root    FAIL  1176 type errors
tsc-infra   FAIL  4 type errors
tsc-front   FAIL  6 type errors
test-back   FAIL  Tests  2 failed | 196 passed | 39 skipped (237)
test-infra  FAIL  Tests:       1 failed, 94 passed, 95 total
test-front  ok    Tests  100 passed (100)
cdk-synth   ok
```

These failures came before the upgrade, and none of them involves `@aws-sdk`:
- **tsc-root:** the root `tsconfig.json` has no `include`, so it type-checks `front/` and its libraries without the DOM types (`lib: ["es2022"]`). The `back/` errors are in the statement parsers: `pdfjs-dist` isn't a dependency, `import.meta` is used in CommonJS output, and `parseText` and `category` don't exist on the types they're used with.
- **tsc-infra:** `@types/d3-array` and `@types/react-dom` (installed for `front`) get loaded without the DOM types.
- **tsc-front:** `import.meta.env` has no type, because the `vite/client` types aren't referenced.
- **test-back:** the statement tests read PDF fixtures from `.kiro/specs/statement-import/fixtures/`, which commit `91d9890` deleted.
- **test-infra:** `stacks.test.ts` reads `front/.env`, a local file that is gitignored and doesn't exist on this machine.

Step 5a (TypeScript 6) is expected to change the `tsc` counts. Compare the error lines in the logs folder that `verify` prints.

---

## Step 0: Ubuntu toolchain (no repo changes)

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y postgresql-client unzip curl
psql --version                      # must be >= 14 (needed for scripts/db-psql.sh)

# Node 24 LTS via nvm, then npm 12
nvm install 24 --reinstall-packages-from=24.21.0
nvm alias default 24
npm install -g npm@12.2.2
node -v && npm -v                   # v24.22.2 / 12.2.2

# AWS CLI v2 (official installer, in-place update)
cd "$(mktemp -d)"
curl -fsSLo awscliv2.zip https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip
unzip -q awscliv2.zip
sudo ./aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update
aws --version
cd -

# Use the CDK CLI pinned in the repo (npx cdk), not a global one
npm ls -g --depth=0                 # if aws-cdk is listed:
npm uninstall -g aws-cdk
```

Once everything later works, you can remove the old Node with `nvm uninstall 24.21.0`.

## Step 1: Branch, helpers and baseline

```bash
cd ~/github/laski/laski-finances-serverless
git switch main && git pull
git switch -c chore/toolchain-upgrade
```

Then run the **Resuming in a new shell** commands above (without the `git switch` line) to load `CTX` and `verify`, and run:

```bash
verify          # BASELINE: compare with the Baseline section above
```

Notes:
- **Keep `git add` explicit.** Every `git add` below lists exact paths, so untracked spec folders (`.claude/specs/relational-migration/`, `.claude/specs/toolchain-upgrade/`) stay out of the upgrade commits. Avoid `git add -A`.
- **npm 12 blocks install scripts by default.** `esbuild` still works, as the DSQL spike confirmed. If another package needs its install script, approve it with `npm install-scripts approve <pkg>`.

## Step 2: AWS SDK alignment (Task 0.1 of the migration)

```bash
npm install --save-exact -w back/lambdas \
  @aws-sdk/client-s3@3.1164.0 @aws-sdk/client-secrets-manager@3.1164.0 @aws-sdk/s3-request-presigner@3.1164.0
npm install --save-exact --save-dev -w back/lambdas \
  @aws-sdk/client-dynamodb@3.1164.0 @aws-sdk/lib-dynamodb@3.1164.0 @aws-sdk/client-cognito-identity-provider@3.1164.0
verify
npx cdk diff "${CTX[@]}"
npx cdk deploy --all "${CTX[@]}"
git add back/lambdas/package.json package-lock.json
git commit -m "chore(deps): align @aws-sdk/* to 3.1164.0"
```

`NodejsFunction` currently leaves `@aws-sdk/*` out of the bundles, so the deployed Lambdas use the SDK built into the runtime. These pins mostly affect tests and types until the migration starts bundling the SDK.

## Step 3: CDK, constructs and esbuild (also removes the `^` ranges)

```bash
npm install --save-exact --save-dev aws-cdk-lib@2.275.0 aws-cdk@2.1148.0 constructs@10.8.1 esbuild@0.28.2
npm install --save-exact -w infra aws-cdk-lib@2.275.0
verify
npx cdk diff "${CTX[@]}"
npx cdk deploy --all "${CTX[@]}"
git add package.json infra/package.json package-lock.json
git commit -m "chore(deps): CDK 2.275.0, CLI 2.1148.0, pin constructs and esbuild"
```

In the diff, expect asset-hash and metadata changes. **Stop if anything shows `replace`** on the Cognito user pool or a table. A replaced user pool loses your users.

**Pitfall hit on 2026-11-07: `Cannot find module '@aws-cdk/cloud-assembly-schema'`.** Between the two installs, infra still pinned 2.244.0, so npm nested schema 55.x under `node_modules/aws-cdk-lib/node_modules/`. Because the bundled `@aws-cdk/cloud-assembly-api` peer-depends on it, npm then marked it `inBundle` in the lock. The tarball doesn't ship it, so `npm ci` never installs it. Fix: delete the `node_modules/aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-schema*` entries from `package-lock.json` and run `npm install` (not `--package-lock-only`: npm 12 refuses to open bundled tarballs there, `EALLOWREMOTE`). Check: `ls node_modules/@aws-cdk/` lists `cloud-assembly-schema`.

## Step 4: Lambda runtime Node 24, `@types/node` 24, Node pin

```bash
grep -rlE 'NODEJS_22_X|nodejs22\.x' infra/lib infra/test | xargs sed -i -e 's/NODEJS_22_X/NODEJS_24_X/g' -e 's/nodejs22\.x/nodejs24.x/g'
sed -i -e 's/NODEJS_22_X/NODEJS_24_X/g' -e 's/Node\.js 22\.x/Node.js 24.x/g' \
  .claude/steering/architecture.md .claude/steering/infra-standards.md .claude/steering/api-contract.md
grep -rnE 'NODEJS_22_X|nodejs22\.x' infra/lib infra/test     # must print nothing
npm install --save-exact --save-dev @types/node@24.19.2
npm pkg set engines.node=">=24 <25"
echo "24" > .nvmrc
verify
npx cdk diff "${CTX[@]}"      # every function: Runtime nodejs22.x -> nodejs24.x
npx cdk deploy --all "${CTX[@]}"
# smoke test in the app: login, list, create an expense, upload a statement
git add infra/lib infra/test .claude/steering package.json package-lock.json .nvmrc
git commit -m "chore(runtime): Lambda nodejs24.x, @types/node 24, pin Node 24"
```

The first `sed` touched 21 references when this was prepared: 4 in `api-stack.ts`, 1 in `auth-stack.ts`, 10 in `stacks.test.ts` and 6 in `statements-api-stack.test.ts`.

## Step 5a: TypeScript 6

```bash
npm install --save-exact --save-dev typescript@6.0.3
npm install --save-exact --save-dev -w front typescript@6.0.3
verify
git add package.json front/package.json package-lock.json   # add any tsconfig you changed
git commit -m "chore(deps): TypeScript 6.0.3"
```

If `tsc` (or `cdk synth`, which type-checks through `ts-node`) reports deprecated options: `infra/tsconfig.json` uses `"moduleResolution": "node"` and all three configs set `baseUrl`. TypeScript 6 is expected to flag both.
- **Proper fix in infra:** `"module": "Node16", "moduleResolution": "Node16"`.
- **`baseUrl`:** drop it wherever nothing uses `paths`.
- **Temporary stopgap:** `"ignoreDeprecations": "6.0"`.

## Step 5b: Test tooling (same versions in every workspace)

```bash
npm install --save-exact --save-dev -w back/lambdas vitest@5.1.0 fast-check@4.10.2
npm install --save-exact --save-dev -w front vitest@5.1.0 fast-check@4.10.2
npm install --save-exact --save-dev -w infra jest@30.5.2 @types/jest@30.0.0 ts-jest@29.4.15
verify
git add back/lambdas/package.json front/package.json infra/package.json package-lock.json   # plus any test or config fixes
git commit -m "chore(deps): Vitest 5, fast-check 4, Jest 30"
```

These are major jumps (back goes from Vitest 3 and fast-check 3). Expect fixes in property tests and possibly in Vitest config. Check each project's migration guide when something fails.

## Step 6: Backend libraries (Zod in both workspaces, same commit)

```bash
grep -rn "dotenv" back/lambdas --include=*.ts --exclude-dir=node_modules   # nothing found in src/
# if nothing:  npm uninstall -w back/lambdas dotenv    (otherwise add dotenv@18.0.9 below)
npm install --save-exact -w back/lambdas zod@4.6.7 @anthropic-ai/sdk@1.6.0
npm install --save-exact --save-dev -w back/lambdas @types/aws-lambda@8.10.164
npm install --save-exact -w front zod@4.6.7
verify
npx cdk diff "${CTX[@]}" && npx cdk deploy --all "${CTX[@]}"
# real check: upload a statement in dev. That exercises the Anthropic SDK (0.39 -> 1.x, a major jump)
git add back/lambdas/package.json front/package.json package-lock.json
git commit -m "chore(deps): zod 4.6.7, Anthropic SDK 1.6.0, @types/aws-lambda"
```

## Step 7: Frontend

```bash
npm install --save-exact -w front react@19.3.1 react-dom@19.3.1 react-is@19.3.1 \
  @chakra-ui/react@3.38.0 aws-amplify@6.22.2 recharts@3.10.1 react-router-dom@7.18.5
npm install --save-exact --save-dev -w front @types/react@19.3.0 @types/react-dom@19.3.0 \
  vite@8.3.6 @vitejs/plugin-react@6.2.1 jsdom@31.0.0 @testing-library/dom@10.4.2 \
  @testing-library/jest-dom@7.0.1 @testing-library/react@16.3.3 @testing-library/user-event@14.6.8
verify
npm run build -w front
npm run front:dev       # manual pass: email + Google login, lists, forms, link widget, statement import
./scripts/deploy-front.sh
git add front/package.json package-lock.json   # plus any test-setup fixes
git commit -m "chore(deps): frontend upgrades (React 19.3, Chakra 3.38, Amplify 6.22, Vite 8.3)"
```

`@testing-library/jest-dom` 7 and jsdom 31 are major jumps. If tests fail on matchers, check the jest-dom import in your test setup file first.

## Finish

```bash
git push -u origin chore/toolchain-upgrade     # open the PR, merge, then freeze versions until the cutover
```

Each step is its own commit, so you can revert one (`git revert <sha>`) without losing the others.

## After merging

- **Freeze versions** until the relational-migration cutover (Phase 7) is done. The only exception is the migration's new packages (`kysely`, `pg`, `pg-connection-string`, `@aws/aurora-dsql-node-postgres-connector`, `@types/pg`). Re-check those at migration Task 1.1.
- **Ask Claude** to update the migration spec to `NODEJS_24_X`, the new CDK version and the final pinned versions before starting Phase 1.
