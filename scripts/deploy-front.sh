#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
APP_ID="${AMPLIFY_APP_ID:-d12j7lvonlrr45}"
BRANCH="${AMPLIFY_BRANCH:-dev}"
FRONT_DIR="front"
ZIP_FILE="deploy.zip"

# ─── Step 1: Clean up previous deploy zip ────────────────────────────────────
if [ -f "$ZIP_FILE" ]; then
  echo "Removing existing $ZIP_FILE..."
  rm "$ZIP_FILE"
fi

# ─── Step 2: Build the frontend ─────────────────────────────────────────────
echo "Building frontend..."
npm run build --workspace="$FRONT_DIR"

# ─── Step 3: Create deploy.zip from dist ─────────────────────────────────────
echo "Creating $ZIP_FILE..."
if command -v zip &> /dev/null; then
  (cd "$FRONT_DIR/dist" && zip -r "../../$ZIP_FILE" .)
else
  # Compress-Archive uses backslashes on Windows which Amplify cannot resolve.
  # Use .NET ZipFile directly with forward-slash entry names instead.
  ABS_ZIP="$(cd "$(dirname "$ZIP_FILE")" && pwd -W)/$(basename "$ZIP_FILE")"
  ABS_DIST="$(cd "$FRONT_DIR/dist" && pwd -W)"
  MKZIP_SCRIPT="$(mktemp /tmp/mkzip-XXXXXX.ps1)"
  cat > "$MKZIP_SCRIPT" <<'PS1'
param($distDir, $zipPath)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $zipPath) { Remove-Item $zipPath }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
Get-ChildItem -Path $distDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($distDir.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relativePath) | Out-Null
}
$zip.Dispose()
PS1
  powershell -ExecutionPolicy Bypass -File "$MKZIP_SCRIPT" "$ABS_DIST" "$ABS_ZIP"
  rm -f "$MKZIP_SCRIPT"
fi

# ─── Step 4: Create Amplify deployment ───────────────────────────────────────
echo "Creating Amplify deployment for branch '$BRANCH'..."
DEPLOYMENT=$(aws amplify create-deployment \
  --app-id "$APP_ID" \
  --branch-name "$BRANCH" \
  --output json)

JOB_ID=$(echo "$DEPLOYMENT" | grep -o '"jobId"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"jobId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
UPLOAD_URL=$(echo "$DEPLOYMENT" | python -c "import sys,json; print(json.load(sys.stdin)['zipUploadUrl'])")

if [ -z "$JOB_ID" ] || [ -z "$UPLOAD_URL" ]; then
  echo "Error: Failed to parse deployment response"
  echo "$DEPLOYMENT"
  exit 1
fi

echo "Job ID: $JOB_ID"

# ─── Step 5: Upload zip to pre-signed URL ───────────────────────────────────
echo "Uploading $ZIP_FILE..."
curl --fail --silent --show-error -T "$ZIP_FILE" "$UPLOAD_URL"

# ─── Step 6: Start the deployment ───────────────────────────────────────────
echo "Starting deployment..."
aws amplify start-deployment \
  --app-id "$APP_ID" \
  --branch-name "$BRANCH" \
  --job-id "$JOB_ID" \
  --output json > /dev/null

# ─── Step 7: Return job info ────────────────────────────────────────────────
echo ""
echo "Deployment started successfully!"
echo "  App ID:  $APP_ID"
echo "  Branch:  $BRANCH"
echo "  Job ID:  $JOB_ID"
echo ""
echo "Check status with:"
echo "  aws amplify get-job --app-id $APP_ID --branch-name $BRANCH --job-id $JOB_ID"
