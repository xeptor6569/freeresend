#!/bin/bash

# FreeResend Email Testing with cURL
# Usage: FRS_API_KEY=frs_... FROM_EMAIL=hello@yourdomain.com TO_EMAIL=you@example.com ./test-curl.sh

API_KEY="${FRS_API_KEY:?Set FRS_API_KEY (from the API Keys tab)}"
FROM_EMAIL="${FROM_EMAIL:?Set FROM_EMAIL (an address on a verified domain)}"
TO_EMAIL="${TO_EMAIL:?Set TO_EMAIL}"
BASE_URL="${FRS_URL:-http://localhost:3000}"

echo "🚀 Testing FreeResend with cURL"
echo "================================"

# Test 1: Send a simple email
echo "📧 Sending test email..."

curl -X POST "$BASE_URL/api/emails" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$FROM_EMAIL\",
    \"to\": [\"$TO_EMAIL\"],
    \"subject\": \"🧪 FreeResend cURL Test\",
    \"html\": \"<h1>Success!</h1><p>This email was sent using <strong>FreeResend</strong> via cURL!</p><p>Your email setup is working! 🎉</p>\",
    \"text\": \"Success! This email was sent using FreeResend via cURL!\"
  }" | jq '.'

echo ""
echo "================================"

# Test 2: Check email logs
echo "📊 Checking recent email logs..."

curl -X GET "$BASE_URL/api/emails/logs?limit=3" \
  -H "Authorization: Bearer $API_KEY" | jq '.'

echo ""
echo "🎉 Testing complete!"
echo "📧 Check your email inbox"
echo "📊 Check FreeResend dashboard for logs"
