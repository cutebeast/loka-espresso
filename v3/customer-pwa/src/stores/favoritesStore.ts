import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface FavoriteOption {
  id: number;
  name: string;
  price_adjustment: number;
}

export interface FavoriteItem {
  menu_item_id: number;
  name: string;
  price: number;
  base_price: number;
  image_url?: string | null;
  variant_id?: number | null;
  variant_name?: string | null;
  options: FavoriteOption[];
  saved_at: number;
}

interface FavoritesState {
  favorites: FavoriteItem[];
  isFavorite: (menuItemId: number) => boolean;
  toggleFavorite: (fav: Omit<FavoriteItem, 'saved_at'>) => void;
  removeFavorite: (menuItemId: number) => void;
}

/** "Your Usuals" — saved drinks with their customizations (localStorage).
 * One-tap re-order from the menu page. */
export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      isFavorite: (menuItemId) => get().favorites.some((f) => f.menu_item_id === menuItemId),
      toggleFavorite: (fav) =>
        set((state) => {
          const exists = state.favorites.some((f) => f.menu_item_id === fav.menu_item_id);
          if (exists) {
            return { favorites: state.favorites.filter((f) => f.menu_item_id !== fav.menu_item_id) };
          }
          // Newest first; keep it bounded
          return { favorites: [{ ...fav, saved_at: Date.now() }, ...state.favorites].slice(0, 24) };
        }),
      removeFavorite: (menuItemId) =>
        set((state) => ({ favorites: state.favorites.filter((f) => f.menu_item_id !== menuItemId) })),
    }),
    {
      name: 'loka-favorites',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
