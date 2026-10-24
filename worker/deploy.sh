#!/usr/bin/env bash
# Velura — deploy the photoreal renderer and switch it on in photo.html.
# Run from the repo root:   bash worker/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "› Checking Cloudflare login"
npx --yes wrangler@4 whoami >/dev/null 2>&1 || npx --yes wrangler@4 login

if grep -q '^# \[\[kv_namespaces\]\]' wrangler.toml; then
  echo "› Creating usage-limit store (KV)"
  out=$(npx --yes wrangler@4 kv namespace create RATE 2>&1 || true)
  id=$(printf '%s' "$out" | grep -oE '[0-9a-f]{32}' | head -1 || true)
  if [ -z "$id" ]; then
    id=$(npx --yes wrangler@4 kv namespace list 2>/dev/null | grep -B2 -A2 'velura-render-RATE\|"RATE"' | grep -oE '[0-9a-f]{32}' | head -1 || true)
  fi
  if [ -n "$id" ]; then
    sed -i.bak -e 's/^# \[\[kv_namespaces\]\]/[[kv_namespaces]]/' -e 's/^# binding = "RATE"/binding = "RATE"/' -e "s/^# id = \"PASTE_ID_HERE\"/id = \"$id\"/" wrangler.toml && rm -f wrangler.toml.bak
    echo "  KV ready: $id"
  else
    echo "  ! Could not create KV — deploying WITHOUT usage limits. Output was:"; echo "$out"
  fi
fi

printf "› fal.ai API key for photoreal renders (fal.ai → Dashboard → Keys), or press Enter to skip for now: "
read -r -s FK; echo
if [ -n "$FK" ]; then printf '%s' "$FK" | npx --yes wrangler@4 secret put FAL_KEY; else echo "  Skipped — quotes and leads will still work; renders stay off until you add it."; fi

if ! npx --yes wrangler@4 secret list 2>/dev/null | grep -q ADMIN_KEY; then
  echo "› Creating a password for your leads dashboard"
  ADMIN_KEY=$(openssl rand -hex 12)
  printf '%s' "$ADMIN_KEY" | npx --yes wrangler@4 secret put ADMIN_KEY
  echo "$ADMIN_KEY" > ../.leads-key && chmod 600 ../.leads-key
  grep -qx '.leads-key' ../.gitignore 2>/dev/null || echo '.leads-key' >> ../.gitignore
  echo "  Saved to .leads-key (not committed). You'll need it to open leads.html."
fi

echo "› Deploying"
dep=$(npx --yes wrangler@4 deploy 2>&1 | tee /dev/stderr)
url=$(printf '%s' "$dep" | grep -oE 'https://velura-render\.[a-z0-9-]+\.workers\.dev' | head -1)
[ -n "$url" ] || { echo "! Couldn't find the Worker URL in the output above."; exit 1; }

echo "› Checking $url/health"
curl -s "$url/health"; echo

cd ..
sed -i.bak "s#https://velura-render.YOUR-SUBDOMAIN.workers.dev#$url#" velura.js && rm -f velura.js.bak

if grep -q "whatsapp: ''," velura.js; then
  printf "› WhatsApp number for enquiries (country code + number, digits only, e.g. 919876543210), or press Enter to skip: "
  read -r WA
  WA=$(printf '%s' "$WA" | tr -cd '0-9')
  if [ -n "$WA" ]; then sed -i.bak "s#whatsapp: '',#whatsapp: '$WA',#" velura.js && rm -f velura.js.bak; echo "  WhatsApp set."; fi
fi
echo
echo "✓ Renderer live at $url"
echo "  velura.js now points at it. Publish with:"
echo "    git add -A && git commit -m 'Switch on photoreal render' && git push"
