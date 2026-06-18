export const itemTypes = [
  {
    code: 'FK',
    label: 'Funko Pop',
    recommendedImageCount: 6,
    categoryId: 'funko-pops',
  },
  {
    code: 'PC',
    label: 'Pokemon Card',
    recommendedImageCount: 2,
    categoryId: 'pokemon',
  },
  {
    code: 'PP',
    label: 'Pokemon Pack',
    recommendedImageCount: 2,
    categoryId: 'pokemon',
  },
  {
    code: 'PB',
    label: 'Pokemon Box',
    recommendedImageCount: 6,
    categoryId: 'pokemon',
  },
  {
    code: 'SN',
    label: 'Sneakers',
    recommendedImageCount: 6,
    categoryId: 'sneakers',
  },
  {
    code: 'VD',
    label: 'Video Games',
    recommendedImageCount: null,
    categoryId: 'retro',
  },
  {
    code: 'CN',
    label: 'Consoles',
    recommendedImageCount: null,
    categoryId: 'retro',
  },
]

export function getItemType(typeCode) {
  return itemTypes.find((type) => type.code === typeCode) ?? null
}

export function getItemTypeMatches(imageCount) {
  return itemTypes.filter((type) => type.recommendedImageCount === imageCount)
}

export function getRecommendedItemType(imageCount) {
  return getItemTypeMatches(imageCount)[0] ?? null
}

export function itemTypeImageRequirementLabel(type) {
  return type.recommendedImageCount === null ? 'UNK' : `${type.recommendedImageCount} images`
}

export function formatItemIdDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)

  return `${month}${day}${year}`
}

export function itemIdPrefix(typeCode, date = new Date()) {
  return `${typeCode}-${formatItemIdDate(date)}-`
}

export function buildItemId(typeCode, date = new Date(), sequence = 1) {
  return `${itemIdPrefix(typeCode, date)}${String(sequence).padStart(2, '0')}`
}

function itemIdSequence(itemId, prefix) {
  if (!itemId?.startsWith(prefix)) {
    return 0
  }

  const sequence = Number.parseInt(itemId.slice(prefix.length), 10)

  return Number.isFinite(sequence) ? sequence : 0
}

export function nextItemSequence(existingProducts, typeCode, date = new Date(), reservedIds = []) {
  const prefix = itemIdPrefix(typeCode, date)
  let highestSequence = 0

  existingProducts.forEach((product) => {
    highestSequence = Math.max(
      highestSequence,
      itemIdSequence(product.itemId, prefix),
      itemIdSequence(product.id, prefix),
    )
  })

  Array.from(reservedIds).forEach((itemId) => {
    highestSequence = Math.max(highestSequence, itemIdSequence(itemId, prefix))
  })

  return highestSequence + 1
}
