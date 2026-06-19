export function calculateIncrement(currentPrice) {
  const price = Number(currentPrice) || 0

  if (price < 10) {
    return 0.5
  }

  if (price < 50) {
    return 1
  }

  if (price < 200) {
    return 2.5
  }

  if (price < 500) {
    return 5
  }

  return 10
}
