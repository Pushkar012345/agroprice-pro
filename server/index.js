const express = require('express');
const cors = require('cors');
const mandiData = require('./mandiData.json');

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint to get all prices
app.get('/api/prices', (req, res) => {
  res.json(mandiData);
});

// Endpoint to filter by district
app.get('/api/prices/:district', (req, res) => {
  const filtered = mandiData.filter(item => 
    item.district.toLowerCase() === req.params.district.toLowerCase()
  );
  res.json(filtered);
});



const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));