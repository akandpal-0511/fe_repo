#!/usr/bin/env bash
# Deploy both apps to Databricks workspace.
# Usage:
#   ./deploy.sh              → deploy + run both apps
#   ./deploy.sh ops-monitor  → deploy + run ops-monitor only
#   ./deploy.sh data-entry   → deploy + run data-entry only

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
PROFILE="${DATABRICKS_CONFIG_PROFILE:-ashutosh}"

APP=${1:-all}

build() {
  local name=$1
  echo "▶ Building frontend: $name"
  cd "$ROOT/apps/$name/frontend"
  npm run build
}

run_app() {
  local resource=$1
  echo "▶ Starting app: $resource"
  cd "$ROOT/databricks_apps"
  DATABRICKS_CONFIG_PROFILE=$PROFILE databricks bundle run "$resource" -t dev
}

# build frontends
if [[ "$APP" == "all" || "$APP" == "ops-monitor" ]]; then build ops-monitor; fi
if [[ "$APP" == "all" || "$APP" == "data-entry"  ]]; then build data-entry;  fi

# deploy files to workspace
echo "▶ Deploying bundle..."
cd "$ROOT/databricks_apps"
DATABRICKS_CONFIG_PROFILE=$PROFILE databricks bundle deploy -t dev

# run apps
if [[ "$APP" == "all" || "$APP" == "ops-monitor" ]]; then run_app ops_monitor_app; fi
if [[ "$APP" == "all" || "$APP" == "data-entry"  ]]; then run_app data_entry_app;  fi

echo ""
echo "✓ Done!"
echo "  ops-monitor → https://fe-demo-app-7474658295188082.aws.databricksapps.com"
echo "  data-entry  → https://fe-data-entry-7474658295188082.aws.databricksapps.com"
