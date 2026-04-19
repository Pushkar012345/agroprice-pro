# 🌾 AgroPrice Pro

> Real-time Maharashtra agricultural market price tracker with AI-powered insights

[![Live Demo](https://img.shields.io/badge/Live%20Demo-agroprice--pro.vercel.app-10b981?style=for-the-badge)](https://agroprice-pro.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-Pushkar012345-181717?style=for-the-badge&logo=github)](https://github.com/Pushkar012345)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Pushkar%20Pawar-0077B5?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/pushkarpawar314/)

---

## 📌 About

AgroPrice Pro is a full-stack web application that provides live agricultural commodity prices across Maharashtra's mandi (market) network. Built for farmers, traders, and agri-businesses to make data-driven decisions using real government data and AI-powered insights.

---

## ✨ Features

- 📊 **Live Price Dashboard** — 255+ markets across 12 Maharashtra districts
- 📈 **Price History Charts** — Track commodity price trends over time
- 🤖 **AgroBot AI Chatbot** — Ask questions about prices, best markets, and farming advice (powered by Groq LLaMA 3.3 70B)
- 🔔 **Price Alert Simulator** — Simulate price alerts with AI confidence scoring
- ⚖️ **Crop Comparison** — Compare up to 3 commodities side-by-side with historical data
- 🔄 **Live Data Sync** — Fetch real-time data from data.gov.in Government API
- 📤 **Export to CSV** — Download price data for offline analysis
- 🌙 **Dark / Light Mode** — Full theme support with persistent preference
- 📱 **Mobile Responsive** — Works seamlessly on all screen sizes

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 | UI Framework |
| Vite | Build Tool |
| Tailwind CSS 4 | Styling |
| Framer Motion | Animations |
| Recharts | Price Charts |
| TanStack Query | Data Fetching & Caching |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js + Express 5 | REST API Server |
| Prisma ORM | Database Access |
| PostgreSQL (Supabase) | Cloud Database |
| Groq SDK — LLaMA 3.3 70B | AI Chatbot Engine |
| express-rate-limit | API Security & Rate Limiting |

### Deployment
| Service | Purpose |
|---------|---------|
| Vercel | Frontend Hosting |
| Render | Backend Hosting |
| Supabase | PostgreSQL Database |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prices` | Get all market prices |
| GET | `/api/prices/:district` | Filter prices by district |
| GET | `/api/prices/:id/history` | Price history for a commodity |
| GET | `/api/prices/:id/alert-simulate` | Simulate price alert with confidence score |
| GET | `/api/sync` | Sync live data from data.gov.in |
| POST | `/api/chat` | AgroBot AI chat endpoint |

---

## 📁 Project Structure

```
agroprice-pro/
├── client/                  # React frontend
│   ├── src/
│   │   ├── App.jsx          # Main application (dashboard, chatbot, modals)
│   │   ├── ErrorBoundary.jsx
│   │   └── main.jsx
│   └── package.json
│
└── server/                  # Node.js backend
    ├── index.js             # Express server & all API routes
    ├── prisma/
    │   ├── schema.prisma    # Database schema
    │   ├── seed.js          # Initial market data
    │   └── migrations/
    └── package.json
```

---

## 🌐 Live Demo

**Frontend:** [https://agroprice-pro.vercel.app](https://agroprice-pro.vercel.app)

**Backend API:** [https://agroprice-server.onrender.com](https://agroprice-server.onrender.com)

> ⚠️ Backend is on Render free tier — first request may take 30–50 seconds to wake up.

---

## 👨‍💻 Author

**Pushkar Pawar**

- 📧 [pushkarpawaroff@gmail.com](mailto:pushkarpawaroff@gmail.com)
- 💼 [linkedin.com/in/pushkarpawar314](https://www.linkedin.com/in/pushkarpawar314/)
- 🐙 [github.com/Pushkar012345](https://github.com/Pushkar012345)

---

## 📄 License

© 2026 Pushkar Pawar. This project is proprietary. Viewing the source code is permitted for reference and learning purposes only. Copying, redistributing, or deploying this project in whole or in part without explicit written permission from the author is strictly prohibited.