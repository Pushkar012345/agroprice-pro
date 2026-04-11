require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Connecting to Supabase...');
  
  const marketData = [
    { commodity: 'Onion', market: 'Lasalgaon', district: 'Nashik', modalPrice: 2450, minPrice: 1800, maxPrice: 3100 },
    { commodity: 'Tomato', market: 'Pimpalgaon', district: 'Nashik', modalPrice: 1200, minPrice: 800, maxPrice: 1600 },
    { commodity: 'Cotton', market: 'Amravati', district: 'Amravati', modalPrice: 7200, minPrice: 6500, maxPrice: 7800 },
    { commodity: 'Soybean', market: 'Latur', district: 'Latur', modalPrice: 4800, minPrice: 4200, maxPrice: 5100 }
  ];

  for (const item of marketData) {
    await prisma.marketPrice.create({ 
      data: item 
    });
    console.log(`+ Added ${item.commodity} at ${item.market}`);
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => { 
    console.error('❌ Seeding failed:', e); 
    process.exit(1); 
  })
  .finally(async () => { 
    await prisma.$disconnect(); 
  });