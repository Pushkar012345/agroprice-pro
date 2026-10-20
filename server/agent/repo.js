// Data-access layer for the agent tools. Tools never touch Prisma directly,
// so tests can pass an in-memory repo and production passes the Prisma one.

function createPrismaRepo(prisma) {
  return {
    // Latest price rows, optionally filtered. Case-insensitive "contains" on
    // commodity/market (users type "onion", the data says "Onion"), exact on district.
    async findPrices({ commodity, district, market } = {}) {
      const where = {};
      if (commodity) where.commodity = { contains: commodity, mode: 'insensitive' };
      if (district) where.district = { equals: district, mode: 'insensitive' };
      if (market) where.market = { contains: market, mode: 'insensitive' };
      return prisma.marketPrice.findMany({ where, take: 200 });
    },

    // History rows for the given market-price ids, oldest first.
    async findHistory(marketPriceIds, sinceDate) {
      if (!marketPriceIds.length) return [];
      const where = { marketPriceId: { in: marketPriceIds } };
      if (sinceDate) where.recordedAt = { gte: sinceDate };
      return prisma.priceHistory.findMany({ where, orderBy: { recordedAt: 'asc' } });
    },
  };
}

module.exports = { createPrismaRepo };