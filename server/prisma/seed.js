require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const marketData = [
  // Nashik
  { commodity: 'Onion',    market: 'Lasalgaon',   district: 'Nashik',    modalPrice: 2450, minPrice: 1800, maxPrice: 3100 },
  { commodity: 'Tomato',   market: 'Pimpalgaon',  district: 'Nashik',    modalPrice: 1200, minPrice: 800,  maxPrice: 1600 },
  { commodity: 'Grapes',   market: 'Nashik',       district: 'Nashik',    modalPrice: 3800, minPrice: 3200, maxPrice: 4500 },
  { commodity: 'Wheat',    market: 'Manmad',       district: 'Nashik',    modalPrice: 2200, minPrice: 1900, maxPrice: 2500 },
  { commodity: 'Maize',    market: 'Nandgaon',     district: 'Nashik',    modalPrice: 1850, minPrice: 1600, maxPrice: 2100 },
  // Pune
  { commodity: 'Potato',   market: 'Pune',         district: 'Pune',      modalPrice: 1400, minPrice: 1000, maxPrice: 1800 },
  { commodity: 'Cabbage',  market: 'Manjari',      district: 'Pune',      modalPrice: 600,  minPrice: 400,  maxPrice: 900  },
  { commodity: 'Cauliflower', market: 'Swargate',  district: 'Pune',      modalPrice: 800,  minPrice: 500,  maxPrice: 1200 },
  { commodity: 'Garlic',   market: 'Baramati',     district: 'Pune',      modalPrice: 5500, minPrice: 4800, maxPrice: 6200 },
  { commodity: 'Ginger',   market: 'Daund',        district: 'Pune',      modalPrice: 4200, minPrice: 3500, maxPrice: 5000 },
  // Amravati
  { commodity: 'Cotton',   market: 'Amravati',     district: 'Amravati',  modalPrice: 7200, minPrice: 6500, maxPrice: 7800 },
  { commodity: 'Soybean',  market: 'Achalpur',     district: 'Amravati',  modalPrice: 4600, minPrice: 4100, maxPrice: 5200 },
  { commodity: 'Tur Dal',  market: 'Daryapur',     district: 'Amravati',  modalPrice: 6800, minPrice: 6200, maxPrice: 7400 },
  { commodity: 'Wheat',    market: 'Morshi',        district: 'Amravati',  modalPrice: 2100, minPrice: 1850, maxPrice: 2400 },
  { commodity: 'Orange',   market: 'Amravati',     district: 'Amravati',  modalPrice: 3200, minPrice: 2700, maxPrice: 3800 },
  // Latur
  { commodity: 'Soybean',  market: 'Latur',        district: 'Latur',     modalPrice: 4800, minPrice: 4200, maxPrice: 5100 },
  { commodity: 'Tur Dal',  market: 'Udgir',        district: 'Latur',     modalPrice: 7100, minPrice: 6500, maxPrice: 7600 },
  { commodity: 'Chilli',   market: 'Latur',        district: 'Latur',     modalPrice: 9500, minPrice: 8500, maxPrice: 11000 },
  { commodity: 'Onion',    market: 'Nilanga',      district: 'Latur',     modalPrice: 2200, minPrice: 1700, maxPrice: 2800 },
  { commodity: 'Wheat',    market: 'Ausa',         district: 'Latur',     modalPrice: 2050, minPrice: 1800, maxPrice: 2300 },
  // Nagpur
  { commodity: 'Orange',   market: 'Nagpur',       district: 'Nagpur',    modalPrice: 3500, minPrice: 2900, maxPrice: 4200 },
  { commodity: 'Cotton',   market: 'Kamptee',      district: 'Nagpur',    modalPrice: 7400, minPrice: 6800, maxPrice: 8000 },
  { commodity: 'Soybean',  market: 'Nagpur',       district: 'Nagpur',    modalPrice: 4750, minPrice: 4300, maxPrice: 5200 },
  { commodity: 'Wheat',    market: 'Kalmeshwar',   district: 'Nagpur',    modalPrice: 2150, minPrice: 1900, maxPrice: 2450 },
  { commodity: 'Tomato',   market: 'Nagpur',       district: 'Nagpur',    modalPrice: 1100, minPrice: 750,  maxPrice: 1500 },
  // Kolhapur
  { commodity: 'Sugarcane',market: 'Kolhapur',     district: 'Kolhapur',  modalPrice: 3200, minPrice: 2800, maxPrice: 3600 },
  { commodity: 'Potato',   market: 'Ichalkaranji', district: 'Kolhapur',  modalPrice: 1500, minPrice: 1100, maxPrice: 1900 },
  { commodity: 'Cabbage',  market: 'Kolhapur',     district: 'Kolhapur',  modalPrice: 550,  minPrice: 350,  maxPrice: 800  },
  { commodity: 'Tomato',   market: 'Hatkanangle',  district: 'Kolhapur',  modalPrice: 950,  minPrice: 600,  maxPrice: 1300 },
  { commodity: 'Onion',    market: 'Kolhapur',     district: 'Kolhapur',  modalPrice: 2100, minPrice: 1600, maxPrice: 2700 },
  // Solapur
  { commodity: 'Pomegranate', market: 'Solapur',   district: 'Solapur',   modalPrice: 6500, minPrice: 5800, maxPrice: 7200 },
  { commodity: 'Onion',    market: 'Barshi',       district: 'Solapur',   modalPrice: 2300, minPrice: 1750, maxPrice: 2900 },
  { commodity: 'Tur Dal',  market: 'Solapur',      district: 'Solapur',   modalPrice: 6900, minPrice: 6300, maxPrice: 7500 },
  { commodity: 'Wheat',    market: 'Pandharpur',   district: 'Solapur',   modalPrice: 2000, minPrice: 1750, maxPrice: 2300 },
  { commodity: 'Soybean',  market: 'Mohol',        district: 'Solapur',   modalPrice: 4700, minPrice: 4100, maxPrice: 5050 },
  // Aurangabad
  { commodity: 'Cotton',   market: 'Aurangabad',   district: 'Aurangabad',modalPrice: 7100, minPrice: 6400, maxPrice: 7700 },
  { commodity: 'Maize',    market: 'Gangapur',     district: 'Aurangabad',modalPrice: 1900, minPrice: 1650, maxPrice: 2200 },
  { commodity: 'Wheat',    market: 'Aurangabad',   district: 'Aurangabad',modalPrice: 2100, minPrice: 1850, maxPrice: 2400 },
  { commodity: 'Onion',    market: 'Vaijapur',     district: 'Aurangabad',modalPrice: 2350, minPrice: 1800, maxPrice: 2950 },
  { commodity: 'Soybean',  market: 'Sillod',       district: 'Aurangabad',modalPrice: 4650, minPrice: 4150, maxPrice: 5100 },
  // Ahmednagar
  { commodity: 'Onion',    market: 'Rahuri',       district: 'Ahmednagar',modalPrice: 2500, minPrice: 1900, maxPrice: 3200 },
  { commodity: 'Wheat',    market: 'Ahmednagar',   district: 'Ahmednagar',modalPrice: 2250, minPrice: 1950, maxPrice: 2550 },
  { commodity: 'Maize',    market: 'Kopargaon',    district: 'Ahmednagar',modalPrice: 1950, minPrice: 1700, maxPrice: 2250 },
  { commodity: 'Tomato',   market: 'Sangamner',    district: 'Ahmednagar',modalPrice: 1050, minPrice: 700,  maxPrice: 1400 },
  { commodity: 'Sugarcane',market: 'Shrirampur',   district: 'Ahmednagar',modalPrice: 3100, minPrice: 2700, maxPrice: 3500 },
  // Jalgaon
  { commodity: 'Banana',   market: 'Jalgaon',      district: 'Jalgaon',   modalPrice: 2800, minPrice: 2300, maxPrice: 3400 },
  { commodity: 'Cotton',   market: 'Bhusawal',     district: 'Jalgaon',   modalPrice: 7300, minPrice: 6600, maxPrice: 7900 },
  { commodity: 'Wheat',    market: 'Amalner',      district: 'Jalgaon',   modalPrice: 2180, minPrice: 1900, maxPrice: 2480 },
  { commodity: 'Maize',    market: 'Chalisgaon',   district: 'Jalgaon',   modalPrice: 1880, minPrice: 1620, maxPrice: 2150 },
  { commodity: 'Onion',    market: 'Pachora',      district: 'Jalgaon',   modalPrice: 2400, minPrice: 1850, maxPrice: 3050 },
  // Satara
  { commodity: 'Strawberry', market: 'Mahabaleshwar', district: 'Satara', modalPrice: 8500, minPrice: 7500, maxPrice: 9800 },
  { commodity: 'Potato',   market: 'Satara',       district: 'Satara',    modalPrice: 1350, minPrice: 950,  maxPrice: 1750 },
  { commodity: 'Tomato',   market: 'Karad',        district: 'Satara',    modalPrice: 1000, minPrice: 650,  maxPrice: 1400 },
  { commodity: 'Onion',    market: 'Phaltan',      district: 'Satara',    modalPrice: 2150, minPrice: 1650, maxPrice: 2750 },
  { commodity: 'Sugarcane',market: 'Satara',       district: 'Satara',    modalPrice: 3050, minPrice: 2650, maxPrice: 3450 },
];

// Generate 30 days of price history with realistic fluctuation
function generateHistory(baseModal, baseMin, baseMax) {
  const history = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const fluctuation = (Math.random() - 0.5) * 0.15; // ±15% variation
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    history.push({
      modalPrice: Math.round(baseModal * (1 + fluctuation)),
      minPrice:   Math.round(baseMin   * (1 + fluctuation - 0.05)),
      maxPrice:   Math.round(baseMax   * (1 + fluctuation + 0.05)),
      recordedAt: date,
    });
  }
  return history;
}

async function main() {
  console.log('🌱 Connecting to Supabase...');

  // Clear existing data
  await prisma.priceHistory.deleteMany();
  await prisma.marketPrice.deleteMany();
  console.log('🗑️  Cleared existing data');

  for (const item of marketData) {
    const created = await prisma.marketPrice.create({
      data: {
        ...item,
        priceHistory: {
          create: generateHistory(item.modalPrice, item.minPrice, item.maxPrice),
        },
      },
    });
    console.log(`+ Added ${item.commodity} at ${item.market} with 30-day history`);
  }

  console.log(`✅ Seeding complete! ${marketData.length} markets with 30-day price history each.`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });