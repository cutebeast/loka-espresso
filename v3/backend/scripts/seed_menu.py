"""Seed premium menu for Loka Espresso (Pavilion KL & KLIA)."""
import sys, os
sys.path.insert(0, "/root/fnb-super-app/v3/backend")

import asyncio
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from datetime import datetime, timezone

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://fnb_user:fnb_pass@localhost:13334/fnb_enterprise_v3")
engine = create_async_engine(DATABASE_URL)
Session = async_sessionmaker(engine)

ALL_DIETARY = ["vegetarian", "vegan", "halal", "gluten_free", "dairy_free", "sugar_free"]
ALL_ALLERGENS = ["gluten", "dairy", "eggs", "seafood", "nuts", "sesame", "soy"]

# ── Modifier definitions ──
MODIFIER_OPTIONS = {
    "Milk Choice": [("Full Cream Milk", 0.50), ("Oat Milk", 0.50), ("Soy Milk", 0.50), ("Almond Milk", 0.50)],
    "Size Upgrade": [("Regular", 0.00), ("Large", 0.50)],
    "Sweetness": [("No Sugar", 0.00), ("Half Sugar", 0.00), ("Full Sugar", 0.00)],
    "Temperature": [("Hot", 0.00), ("Iced", 0.00)],
    "Add-Ons": [("Extra Cheese", 0.50), ("Extra Protein", 0.50), ("Truffle Oil Drizzle", 0.50), ("Chili Flakes", 0.00), ("Extra Sauce", 0.50)],
}

# Which modifier groups apply to which category (by slug)
MODIFIER_MAP = {
    "anatolian-flatbreads": ["Size Upgrade", "Add-Ons"],
    "artisan-shares": ["Add-Ons"],
    "soup-garden": ["Size Upgrade"],
    "grain-hearth": ["Add-Ons"],
    "artisan-pasta": ["Add-Ons", "Chili Flakes" if False else "Add-Ons"],  # Chili Flakes included in Add-Ons
    "deli-counter": ["Add-Ons"],
    "greenery": ["Add-Ons"],
}

MENU = [
    {
        "category": "Anatolian Flatbreads",
        "slug": "anatolian-flatbreads",
        "description": "Hand-stretched Turkish flatbreads, baked to order in our stone oven — a taste of Istanbul in the heart of KL",
        "display_order": 1,
        "items": [
            {"name": "Signature Mix Bread Basket", "description": "A curated selection of freshly baked Turkish breads with house-made za'atar butter and smoked eggplant dip", "allergens": ["gluten","dairy","sesame"], "dietary": ["halal","vegetarian"]},
            {"name": "Lahmacun — Anatolian Flatbread", "description": "Paper-thin flatbread topped with spiced minced lamb, capsicum, tomato, and fresh herbs, rolled with lemon and arugula", "allergens": ["gluten"], "dietary": ["halal"]},
            {"name": "Pide — Spiced Beef", "description": "Boat-shaped stone-baked pizza with slow-braised Australian beef, roasted capsicum, and Kashkaval cheese", "allergens": ["gluten","dairy"], "dietary": ["halal"]},
            {"name": "Pide — Free-Range Chicken", "description": "Boat-shaped stone-baked pizza with marinated chicken thigh, caramelized onion, and sumac", "allergens": ["gluten","dairy"], "dietary": ["halal"]},
            {"name": "Pide — Four Cheese", "description": "Boat-shaped stone-baked pizza with mozzarella, feta, Kashkaval, and aged Parmesan, finished with truffle honey", "allergens": ["gluten","dairy"], "dietary": ["halal","vegetarian"]},
            {"name": "Gözleme — Spiced Chicken", "description": "Hand-rolled Anatolian flatbread filled with free-range chicken, spinach, and Turkish spices, pan-griddled to golden", "allergens": ["gluten","dairy"], "dietary": ["halal"]},
            {"name": "Gözleme — Spinach & Feta", "description": "Hand-rolled Anatolian flatbread filled with baby spinach, creamy feta, and fresh dill", "allergens": ["gluten","dairy"], "dietary": ["halal","vegetarian"]},
            {"name": "Şiş Tavuk — Chicken Skewers", "description": "Marinated chicken thigh skewers chargrilled over open flame, served with sumac onions and garlic yoghurt", "allergens": ["dairy"], "dietary": ["halal","gluten_free"]},
            {"name": "Bosphorus Braised Prawns", "description": "Wild-caught tiger prawns slow-braised in tomato, garlic, and Urfa chili butter, served with grilled sourdough", "allergens": ["gluten","dairy","seafood"], "dietary": ["halal"]},
            {"name": "Sultan's Meze Platter", "description": "A grand sharing plate — hummus, baba ganoush, muhammara, dolma, sigara börek, and grilled halloumi, served with lavash crisps", "allergens": ["gluten","dairy","sesame","nuts"], "dietary": ["halal","vegetarian"]},
        ],
    },
    {
        "category": "Artisan Shares",
        "slug": "artisan-shares",
        "description": "Small plates designed for sharing over conversation — elevated bar snacks with a Mediterranean soul",
        "display_order": 2,
        "items": [
            {"name": "Truffle Mozzarella Sticks", "description": "Hand-breaded mozzarella with black truffle panko crust, served with San Marzano marinara", "allergens": ["gluten","dairy"], "dietary": ["halal","vegetarian"]},
            {"name": "Harissa Corn Ribs", "description": "Charred corn ribs glazed with house-made harissa butter, finished with lime zest and micro coriander", "allergens": ["dairy"], "dietary": ["halal","vegetarian","gluten_free"]},
            {"name": "Truffle & Parmesan Baked Potato", "description": "Twice-baked Idaho potato loaded with truffle cream, aged Parmesan, and chives", "allergens": ["dairy"], "dietary": ["halal","vegetarian","gluten_free"]},
            {"name": "Triple-Cooked Fries", "description": "Hand-cut Kennebec potatoes, triple-cooked for extra crunch, served with truffle aioli and smoked ketchup", "allergens": [], "dietary": ["halal","vegan","gluten_free","dairy_free"]},
        ],
    },
    {
        "category": "Soup & Garden",
        "slug": "soup-garden",
        "description": "Seasonal soups made from scratch daily, and garden-fresh creations from local farms",
        "display_order": 3,
        "items": [
            {"name": "Chef's Daily Soup", "description": "A rotating selection crafted from the morning's market haul — ask your server for today's creation", "allergens": [], "dietary": ["halal"]},
            {"name": "Heirloom Tomato & Basil Bisque", "description": "Slow-roasted vine tomatoes with fresh basil, finished with a swirl of crème fraîche and sourdough croutons", "allergens": ["gluten","dairy"], "dietary": ["halal","vegetarian"]},
            {"name": "Wild Mushroom Velouté", "description": "A velvety blend of porcini, shimeji, and shiitake mushrooms, finished with truffle oil and garlic crostini", "allergens": ["gluten","dairy"], "dietary": ["halal","vegetarian"]},
            {"name": "Roasted Cauliflower & Broccoli Soup", "description": "Fire-roasted cauliflower and broccoli puréed with roasted garlic, topped with Parmesan crisps and chive oil", "allergens": ["dairy"], "dietary": ["halal","vegetarian","gluten_free"]},
        ],
    },
    {
        "category": "Grain & Hearth",
        "slug": "grain-hearth",
        "description": "Hearty main plates — from slow-cooked roasts to aromatic baked rice, the soul of our kitchen",
        "display_order": 4,
        "items": [
            {"name": "Harissa Roasted Quarter Chicken", "description": "Crispy-skinned free-range chicken marinated in harissa and yoghurt, roasted to golden perfection, served with baba ganoush and charred vegetables", "allergens": ["dairy"], "dietary": ["halal","gluten_free"]},
            {"name": "Levantine Spiced Baked Rice", "description": "Aromatic basmati baked with spiced beef or free-range chicken, caramelized onion, toasted almonds, and saffron butter — served in the clay pot", "allergens": ["dairy","nuts"], "dietary": ["halal","gluten_free"]},
        ],
    },
    {
        "category": "Artisan Pasta",
        "slug": "artisan-pasta",
        "description": "Handcrafted pasta made fresh daily in our kitchen — simple ingredients, exceptional flavour",
        "display_order": 5,
        "items": [
            {"name": "Hummus Mac & Cheese", "description": "Creamy macaroni folded through a silky hummus béchamel, topped with za'atar breadcrumbs and aged cheddar", "allergens": ["gluten","dairy","sesame"], "dietary": ["halal","vegetarian"]},
            {"name": "Prawn Aglio Olio Peperoncino", "description": "Wild-caught tiger prawns tossed with garlic, chili flakes, and extra virgin olive oil on handmade spaghetti", "allergens": ["gluten","seafood"], "dietary": ["halal","dairy_free"]},
            {"name": "Smoked Salmon Arrabiata", "description": "Handmade penne in a spicy tomato sauce with house-cured Tasmanian smoked salmon, capers, and fresh basil", "allergens": ["gluten","seafood"], "dietary": ["halal","dairy_free"]},
            {"name": "Pesto e Portobello", "description": "Handmade fettuccine with fresh basil pesto, grilled portobello mushroom steak, toasted pine nuts, and shaved Parmesan", "allergens": ["gluten","dairy","nuts"], "dietary": ["halal","vegetarian"]},
        ],
    },
    {
        "category": "The Deli Counter",
        "slug": "deli-counter",
        "description": "Gourmet sandwiches on artisan sourdough — crafted with premium proteins and house-made condiments",
        "display_order": 6,
        "items": [
            {"name": "Pulled Chicken & Pesto", "description": "Slow-cooked pulled chicken thigh with fresh basil pesto, rocket, and vine tomatoes on toasted sourdough", "allergens": ["gluten","dairy","nuts"], "dietary": ["halal"]},
            {"name": "Parisian Egg, Ham & Cheese", "description": "Free-range fried egg, smoked turkey ham, and melted Gruyère on buttered sourdough with Dijon mustard", "allergens": ["gluten","dairy","eggs"], "dietary": ["halal"]},
            {"name": "Smoked Salmon & Dill Cream Cheese", "description": "House-cured Tasmanian smoked salmon with dill cream cheese, capers, and red onion on dark rye", "allergens": ["gluten","dairy","seafood"], "dietary": ["halal"]},
            {"name": "Roasted Beef & Wild Mushroom", "description": "Thinly sliced Australian roast beef with sautéed wild mushrooms, truffle mayo, and aged cheddar on ciabatta", "allergens": ["gluten","dairy"], "dietary": ["halal"]},
        ],
    },
    {
        "category": "The Greenery",
        "slug": "greenery",
        "description": "Fresh seasonal salads from local farms — vibrant, crisp, and dressed to perfection",
        "display_order": 7,
        "items": [
            {"name": "Olive & Feta Green Salad", "description": "Mixed baby greens with Kalamata olives, barrel-aged feta, cherry tomatoes, cucumber, and a lemon-oregano vinaigrette", "allergens": ["dairy"], "dietary": ["halal","vegetarian","gluten_free"]},
        ],
    },
]


async def seed_all():
    async with Session() as db:
        now = datetime.now(timezone.utc)

        # ── 1. Clear ALL menu-related data ──
        print("Clearing all menu data...")
        await db.execute(text("TRUNCATE TABLE menu_item_allergens, menu_item_dietary_tags, menu_item_recipes, menu_variants, menu_modifier_options, menu_modifier_groups, menu_items, menu_categories, allergens, dietary_tags RESTART IDENTITY CASCADE"))
        await db.commit()
        print("Cleared.\n")

        # ── 2. Create allergens ──
        from app.models.menu import Allergen, DietaryTag, MenuCategory, MenuItem, MenuItemAllergen, MenuItemDietaryTag, MenuModifierGroup, MenuModifierOption
        allergen_ids = {}
        for a in ALL_ALLERGENS:
            aa = Allergen(
                allergen_key=a, display_name=a.title(),
                severity="critical" if a in ("nuts","seafood") else "high" if a in ("gluten","dairy","eggs") else "medium",
                is_active=True, color_hex="#EF4444" if a in ("nuts","seafood") else "#F59E0B",
            )
            db.add(aa)
            await db.flush()
            allergen_ids[a] = aa.id
        print(f"Seeded {len(allergen_ids)} allergens")

        # ── 3. Create dietary tags ──
        dietary_ids = {}
        for d in ALL_DIETARY:
            dt = DietaryTag(
                tag_key=d, display_name=d.replace("_"," ").title(),
                is_active=True, color_hex="#22C55E" if d != "sugar_free" else "#8B5CF6",
            )
            db.add(dt)
            await db.flush()
            dietary_ids[d] = dt.id
        print(f"Seeded {len(dietary_ids)} dietary tags\n")

        # ── 4. Create categories + items ──
        total = 0
        for cat in MENU:
            c = MenuCategory(
                category_name=cat["category"], slug=cat["slug"],
                description=cat["description"], display_order=cat["display_order"],
                is_available=True, is_featured=True,
                created_at=now, updated_at=now,
            )
            db.add(c)
            await db.flush()
            print(f"  {cat['category']}")
            for idx, item in enumerate(cat["items"], 1):
                mi = MenuItem(
                    category_id=c.id, item_code=f"LOKA-C{cat['display_order']:02d}-I{idx:02d}",
                    item_name=item["name"], description=item["description"],
                    base_price=1.00, is_available=True,
                    display_order=idx, created_at=now, updated_at=now,
                )
                db.add(mi)
                await db.flush()
                # Allergen links
                for ak in item.get("allergens", []):
                    if ak in allergen_ids:
                        db.add(MenuItemAllergen(menu_item_id=mi.id, allergen_id=allergen_ids[ak]))
                # Dietary tag links
                for dk in item.get("dietary", []):
                    if dk in dietary_ids:
                        db.add(MenuItemDietaryTag(menu_item_id=mi.id, dietary_tag_id=dietary_ids[dk]))
                total += 1
                print(f"    {item['name'][:50]}")

        # ── Create modifier groups for each category ──
        mod_total = 0
        opt_total = 0
        for cat in MENU:
            slug = cat["slug"]
            if slug not in MODIFIER_MAP:
                continue
            # Get all items in this category
            result = await db.execute(
                select(MenuItem.id).join(MenuCategory).where(
                    MenuCategory.slug == slug, MenuItem.deleted_at.is_(None)
                )
            )
            item_ids = [r[0] for r in result.all()]

            for group_name in MODIFIER_MAP[slug]:
                if group_name not in MODIFIER_OPTIONS:
                    continue
                opts = MODIFIER_OPTIONS[group_name]
                for mi_id in item_ids:
                    mg = MenuModifierGroup(
                        menu_item_id=mi_id, group_name=group_name,
                        min_selections=0, max_selections=len(opts),
                        display_order=1,
                    )
                    db.add(mg)
                    await db.flush()
                    mod_total += 1
                    for idx, (opt_name, price_adj) in enumerate(opts):
                        mo = MenuModifierOption(
                            modifier_group_id=mg.id, option_name=opt_name,
                            price_adjustment=price_adj, display_order=idx,
                        )
                        db.add(mo)
                        opt_total += 1

        await db.commit()
        await db.commit()
        print(f"\n✅ Seeded: {len(MENU)} categories, {total} items, {mod_total} modifier groups, {opt_total} options.")
        print(f"   {len(allergen_ids)} allergens, {len(dietary_ids)} dietary tags.")
        print("All prices set at RM 1.00 — update via admin portal.")


if __name__ == "__main__":
    asyncio.run(seed_all())
