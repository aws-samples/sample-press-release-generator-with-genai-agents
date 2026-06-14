#!/bin/bash
# Test Strands endpoint with synthetic data

echo "Testing Strands endpoint with trusted data source..."
echo ""

curl -s -X POST http://localhost:3001/api/v1/strands/generate-strands \
  -H "Content-Type: application/json" \
  -d '{
    "markets": ["los-angeles-long-beach-anaheim"],
    "masterPR": "**Residential Real Estate Market Shows Mixed Signals as Inventory Surges 23.4% Nationwide** July 15, 2025 by Sarah Mitchell. The U.S. residential real estate market is experiencing significant transformation as inventory levels reach their highest point in 4.2 years.",
    "dataSource": "trusted",
    "options": {"formats": ["json"]}
  }' | python3 -m json.tool

echo ""
echo "Test complete. Check backend logs for processing details."