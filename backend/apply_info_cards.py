#!/usr/bin/env python3
"""Apply information_cards migration directly."""
import asyncio
import sys
sys.path.insert(0, '/root/fnb-super-app/backend')

from sqlalchemy import text
from app.core.database import engine

async def apply_migration():
    async with engine.begin() as conn:
        # Check if table exists
        result = await conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'information_cards'
            )
        """))
        exists = result.scalar()
        
        if exists:
            print("information_cards table already exists")
            return
        
        # Create table
        await conn.execute(text("""
            CREATE TABLE information_cards (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                short_description VARCHAR(500),
                icon VARCHAR(50),
                action_type VARCHAR(20) DEFAULT 'detail',
                action_url VARCHAR(500),
                long_description TEXT,
                image_url VARCHAR(500),
                store_id INTEGER REFERENCES stores(id),
                start_date TIMESTAMP WITH TIME ZONE,
                end_date TIMESTAMP WITH TIME ZONE,
                is_active BOOLEAN DEFAULT TRUE NOT NULL,
                position INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """))
        
        # Create index
        await conn.execute(text("""
            CREATE INDEX idx_information_cards_id ON information_cards(id)
        """))
        
        print("information_cards table created successfully")

if __name__ == "__main__":
    asyncio.run(apply_migration())
