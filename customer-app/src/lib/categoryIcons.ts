import { Coffee, Snowflake, Leaf, Star, Croissant, UtensilsCrossed, CupSoda, Cake } from 'lucide-react';

const CATEGORY_MAP: Array<{
  slugs: string[];
  emoji: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { slugs: ['espresso'], emoji: '☕', Icon: Coffee },
  { slugs: ['iced-coffee', 'iced'], emoji: '🧊', Icon: Snowflake },
  { slugs: ['tea', 'tea-latte', 'tea & latte'], emoji: '🍵', Icon: Leaf },
  { slugs: ['turkish', 'turkish-specials'], emoji: '🇹🇷', Icon: Star },
  { slugs: ['pastries', 'pastry'], emoji: '🥐', Icon: Croissant },
  { slugs: ['breakfast', 'brunch'], emoji: '🍳', Icon: UtensilsCrossed },
  { slugs: ['cold-drinks', 'cold-drink'], emoji: '🥤', Icon: CupSoda },
  { slugs: ['desserts', 'dessert', 'sweet'], emoji: '🍰', Icon: Cake },
];

export function getCategoryIcon(slug: string): { emoji: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> } {
  const lower = slug.toLowerCase();
  for (const entry of CATEGORY_MAP) {
    for (const s of entry.slugs) {
      if (lower.includes(s)) return { emoji: entry.emoji, Icon: entry.Icon };
    }
  }
  return { emoji: '🍽️', Icon: Coffee };
}