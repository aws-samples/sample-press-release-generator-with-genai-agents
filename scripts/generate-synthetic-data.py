#!/usr/bin/env python3
"""
Generate synthetic market data for all 100 US markets.
Creates realistic real estate data aligned with the Real Estate template.
"""

import json
import random
import re
from datetime import datetime
from pathlib import Path

def slugify(text):
    """Convert market name to slug format."""
    # Remove special characters and convert to lowercase
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip('-')

def generate_market_data(market_info, index):
    """Generate synthetic real estate data for a market."""
    
    # Base values vary by market size (larger metros have higher values)
    size_factor = 1.0 - (index * 0.005)  # Gradual decrease for smaller markets
    
    # Generate realistic values with variation
    median_home_price = int(random.uniform(250000, 850000) * size_factor)
    price_change = round(random.uniform(-5.0, 12.0), 1)
    inventory_level = int(random.uniform(2000, 25000) * size_factor)
    days_on_market = int(random.uniform(25, 75))
    active_listings = int(random.uniform(1500, 20000) * size_factor)
    
    # Demographics
    population = int(random.uniform(500000, 20000000) * size_factor)
    median_income = int(random.uniform(45000, 95000) * size_factor)
    household_size = round(random.uniform(2.3, 2.9), 1)
    
    # Economic indicators
    employment_rate = round(random.uniform(92.0, 97.5), 1)
    gdp_growth = round(random.uniform(1.5, 5.5), 1)
    
    # Major industries vary by region
    region = market_info.get('region', 'South')
    industries = {
        'Northeast': ['Finance', 'Healthcare', 'Technology', 'Education', 'Professional Services'],
        'South': ['Healthcare', 'Energy', 'Manufacturing', 'Technology', 'Retail'],
        'Midwest': ['Manufacturing', 'Healthcare', 'Agriculture', 'Technology', 'Finance'],
        'West': ['Technology', 'Healthcare', 'Entertainment', 'Aerospace', 'Tourism']
    }
    
    major_industries = random.sample(industries.get(region, industries['South']), 3)
    
    return {
        "market": market_info['name'],
        "realEstate": {
            "medianHomePrice": median_home_price,
            "priceChange": price_change,
            "inventoryLevel": inventory_level,
            "daysOnMarket": days_on_market,
            "activeListings": active_listings
        },
        "demographics": {
            "population": population,
            "medianIncome": median_income,
            "householdSize": household_size
        },
        "economic": {
            "employmentRate": employment_rate,
            "gdpGrowth": gdp_growth,
            "majorIndustries": major_industries
        },
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "source": "synthetic"
    }

def main():
    """Generate synthetic data for all markets."""
    
    # Read markets list
    markets_file = Path("data/top-100-markets.json")
    if not markets_file.exists():
        print(f"Error: {markets_file} not found")
        return 1
    
    with open(markets_file, 'r') as f:
        markets_data = json.load(f)
    
    markets = markets_data['markets']
    
    # Create output directory
    output_dir = Path("trusteddata/markets")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating synthetic data for {len(markets)} markets...")
    print(f"Output directory: {output_dir}")
    print()
    
    created_count = 0
    
    for index, market in enumerate(markets):
        # Generate slug for filename
        slug = slugify(market['name'])
        
        # Generate market data
        market_data = generate_market_data(market, index)
        
        # Write to file
        output_file = output_dir / f"{slug}.json"
        with open(output_file, 'w') as f:
            json.dump(market_data, f, indent=2)
        
        created_count += 1
        
        # Progress indicator
        if (created_count % 10) == 0:
            print(f"  Created {created_count}/{len(markets)} files...")
    
    print()
    print(f"✅ Successfully created {created_count} market data files")
    print(f"   Location: {output_dir}")
    print()
    print("Sample file structure:")
    
    # Show sample of first file
    first_slug = slugify(markets[0]['name'])
    sample_file = output_dir / f"{first_slug}.json"
    with open(sample_file, 'r') as f:
        sample_data = json.load(f)
    
    print(f"   {sample_file.name}:")
    print(f"   - Market: {sample_data['market']}")
    print(f"   - Median Home Price: ${sample_data['realEstate']['medianHomePrice']:,}")
    print(f"   - Population: {sample_data['demographics']['population']:,}")
    print(f"   - Major Industries: {', '.join(sample_data['economic']['majorIndustries'])}")
    
    return 0

if __name__ == "__main__":
    exit(main())