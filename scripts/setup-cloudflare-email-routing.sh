#!/bin/bash

# =========================================================================
# Cloudflare Email Routing Setup Script
# =========================================================================
# Purpose: Configure support@stockroomnj.com -> thestockroomnj@gmail.com forwarding.
# Requirement: Read CF_API_TOKEN from environment. Do not leak or hardcode token.
# =========================================================================

set -e

# 1. Verify CF_API_TOKEN exists in the shell environment
if [ -z "$CF_API_TOKEN" ]; then
  echo "========================================================================="
  echo "ERROR: Missing Cloudflare API Token"
  echo "========================================================================="
  echo "Please set the CF_API_TOKEN environment variable in your terminal session:"
  echo "  export CF_API_TOKEN=\"my_cloudflare_api_token\""
  echo "========================================================================="
  exit 1
fi

DOMAIN="stockroomnj.com"
DESTINATION_EMAIL="thestockroomnj@gmail.com"
FORWARD_EMAIL="support@stockroomnj.com"
RULE_NAME="Forward support@stockroomnj.com to Gmail"

echo "Starting Cloudflare Email Routing Setup for $DOMAIN..."

# Helper to verify command success without printing secret credentials
check_response() {
  local res="$1"
  local action_desc="$2"
  local success
  success=$(node -e "
    try {
      const r = JSON.parse(process.argv[1]);
      console.log(r.success ? 'true' : 'false');
    } catch (e) {
      console.log('false');
    }
  " "$res")

  if [ "$success" != "true" ]; then
    echo "ERROR: Failed to $action_desc."
    echo "Response received: $res"
    exit 1
  fi
}

# 2. Use the Cloudflare API to find the Zone ID and Account ID for the domain
echo "[Step 1/5] Fetching Zone ID and Account ID for $DOMAIN..."
ZONE_RESP=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

check_response "$ZONE_RESP" "fetch Zone ID"

ZONE_ID=$(node -e "const r = JSON.parse(process.argv[1]); console.log(r.result && r.result[0] ? r.result[0].id : '');" "$ZONE_RESP")
ACCOUNT_ID=$(node -e "const r = JSON.parse(process.argv[1]); console.log(r.result && r.result[0] && r.result[0].account ? r.result[0].account.id : '');" "$ZONE_RESP")

if [ -z "$ZONE_ID" ] || [ -z "$ACCOUNT_ID" ]; then
  echo "ERROR: Could not resolve Zone ID or Account ID for $DOMAIN from response."
  exit 1
fi

echo "  -> Zone ID: $ZONE_ID"
echo "  -> Account ID: $ACCOUNT_ID"

# 3. Enable Cloudflare Email Routing DNS for the zone
echo "[Step 2/5] Checking Email Routing DNS status..."
ROUTING_STATUS_RESP=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

check_response "$ROUTING_STATUS_RESP" "check Email Routing status"

IS_ENABLED=$(node -e "const r = JSON.parse(process.argv[1]); console.log(r.result && r.result.enabled ? 'true' : 'false');" "$ROUTING_STATUS_RESP")

if [ "$IS_ENABLED" != "true" ]; then
  echo "  -> Email Routing is not enabled. Enabling DNS routing settings..."
  DNS_ENABLE_RESP=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/dns" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{}')
  check_response "$DNS_ENABLE_RESP" "enable Email Routing DNS"
  echo "  -> Email Routing DNS unlocked/enabled."
else
  echo "  -> Email Routing DNS is already enabled."
fi

# 4. Add destination address if it doesn't already exist
echo "[Step 3/5] Checking if destination address $DESTINATION_EMAIL exists..."
ADDRESSES_RESP=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/email/routing/addresses" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

check_response "$ADDRESSES_RESP" "fetch destination addresses"

VERIFIED_STATUS=$(node -e "
  const r = JSON.parse(process.argv[1]);
  const addr = r.result ? r.result.find(a => a.email.toLowerCase() === '$DESTINATION_EMAIL'.toLowerCase()) : null;
  if (!addr) {
    console.log('not_exists');
  } else {
    console.log(addr.verified ? 'verified' : 'pending');
  }
" "$ADDRESSES_RESP")

if [ "$VERIFIED_STATUS" = "not_exists" ]; then
  echo "  -> Destination address $DESTINATION_EMAIL does not exist. Adding address..."
  ADD_RESP=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/email/routing/addresses" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"email\": \"$DESTINATION_EMAIL\"}")
  
  check_response "$ADD_RESP" "add destination address"
  echo "  -> Destination address added successfully."
  VERIFIED_STATUS="pending"
else
  echo "  -> Destination address already exists. Current status: $VERIFIED_STATUS"
fi

# 5. Tell the user to check and click the verification email if pending
if [ "$VERIFIED_STATUS" = "pending" ]; then
  echo ""
  echo "========================================================================="
  echo "ACTION REQUIRED: VERIFICATION EMAIL PENDING"
  echo "========================================================================="
  echo "Cloudflare has sent a verification email to: $DESTINATION_EMAIL"
  echo "Please check your inbox, click the verification link, and then"
  echo "rerun this script to complete the routing rule creation."
  echo ""
  echo "Command to rerun:"
  echo "  export CF_API_TOKEN=\"your_cloudflare_api_token\""
  echo "  ./scripts/setup-cloudflare-email-routing.sh"
  echo "========================================================================="
  exit 0
fi

# 6. Check and create the forwarding rule
echo "[Step 4/5] Checking if Email Routing rule '$RULE_NAME' already exists..."
RULES_RESP=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

check_response "$RULES_RESP" "fetch routing rules"

RULE_EXISTS=$(node -e "
  const r = JSON.parse(process.argv[1]);
  const rule = r.result ? r.result.find(rule => 
    rule.matchers && rule.matchers.some(m => m.type === 'literal' && m.field === 'to' && m.value.toLowerCase() === '$FORWARD_EMAIL'.toLowerCase()) &&
    rule.actions && rule.actions.some(a => a.type === 'forward' && a.value && a.value.some(v => v.toLowerCase() === '$DESTINATION_EMAIL'.toLowerCase()))
  ) : null;
  console.log(rule ? 'true' : 'false');
" "$RULES_RESP")

if [ "$RULE_EXISTS" = "true" ]; then
  echo "  -> Email Routing rule already exists. Skipping duplicate creation."
else
  echo "[Step 5/5] Creating Email Routing rule..."
  CREATE_RESP=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{
      \"name\": \"$RULE_NAME\",
      \"enabled\": true,
      \"matchers\": [{
        \"type\": \"literal\",
        \"field\": \"to\",
        \"value\": \"$FORWARD_EMAIL\"
      }],
      \"actions\": [{
        \"type\": \"forward\",
        \"value\": [\"$DESTINATION_EMAIL\"]
      }]
    }")

  check_response "$CREATE_RESP" "create forwarding rule"
  echo "  -> Email Routing rule created successfully."
fi

# 7. Print final checklist
echo ""
echo "========================================================================="
echo "FINAL CONFIGURATION CHECKLIST"
echo "========================================================================="
echo "[✓] Email Routing DNS enabled"
echo "[✓] Destination address added ($DESTINATION_EMAIL)"
echo "[✓] Destination address verified"
echo "[✓] Route created ($FORWARD_EMAIL -> $DESTINATION_EMAIL)"
echo ""
echo "TEST EMAIL INSTRUCTION:"
echo "Send a test email from any external email address (do not use the"
echo "destination email itself) to:"
echo "  $FORWARD_EMAIL"
echo "and verify that it is forwarded successfully to:"
echo "  $DESTINATION_EMAIL"
echo "========================================================================="
