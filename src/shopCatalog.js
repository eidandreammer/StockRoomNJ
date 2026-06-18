export const shopCategories = [
  {
    id: 'new-hot',
    label: 'New Hot',
    note: 'Fresh drops and new arrivals!',
    featured: true,
  },
  {
    id: 'pokemon',
    label: 'Pokemon',
    note: 'Pokemon TCG singles, sealed items, and rare collector finds!',
  },
  {
    id: 'funko-pops',
    label: 'Funko Pops',
    note: 'Collectible figures and character exclusives!',
  },
  {
    id: 'sneakers',
    label: 'Sneakers',
    note: 'Pairs worth a closer look!',
  },
  {
    id: 'clothes',
    label: 'Clothes',
    note: 'Apparel, streetwear, and shop finds!',
  },
  {
    id: 'retro',
    label: 'Retro',
    note: 'Throwbacks, classics, and nostalgia!',
  },
]

export const shopProductCategories = [
  { id: 'all', label: 'All categories' },
  ...shopCategories.map(({ id, label }) => ({ id, label })),
]

export function getShopCategory(categoryId) {
  return shopCategories.find((category) => category.id === categoryId) ?? shopCategories[0]
}
