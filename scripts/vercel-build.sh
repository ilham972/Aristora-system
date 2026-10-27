#!/bin/sh
# Vercel build: push the Convex backend, then build the phone app (npm run build).
# Prints plain messages so a failed build says what to fix. Never prints the key.
set -e

branch="${VERCEL_GIT_COMMIT_REF:-unknown}"
echo "Aristora build: Vercel environment '${VERCEL_ENV:-not set}', branch '${branch}'"

if [ -z "${CONVEX_DEPLOY_KEY}" ]; then
  echo "ARISTORA SETUP PROBLEM: CONVEX_DEPLOY_KEY is missing in this build."
  echo "Fix: Vercel > aristora-system > Settings > Environment Variables > add CONVEX_DEPLOY_KEY with Production ticked, then Redeploy."
  exit 1
fi

case "${CONVEX_DEPLOY_KEY}" in
  prod:*) echo "Convex: production deploy key found." ;;
  *)
    echo "ARISTORA SETUP PROBLEM: CONVEX_DEPLOY_KEY is not a production key (it must start with prod:)."
    echo "Fix: Convex dashboard > Settings > create a Production deploy key, paste it into Vercel, then Redeploy."
    exit 1
    ;;
esac

# Only main may deploy the backend. Other branches stop here.
if [ "${branch}" != "main" ] && [ "${branch}" != "unknown" ]; then
  echo "Branch '${branch}' is not main: not deploying the backend to production."
  exit 1
fi

# Convex's own check refuses when Vercel doesn't report "production" for this build.
# The branch check above does that job, so the Convex check is switched off.
exec npx convex deploy --check-build-environment disable --cmd "npm run build" --cmd-url-env-var-name CONVEX_URL
