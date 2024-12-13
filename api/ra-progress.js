const axios = require('axios').default;

const handler = async (req, res) => {
  try {
    // Basic error checking
    if (!req.query.username || !req.query.gameId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const params = new URLSearchParams({
      z: process.env.RA_USERNAME,
      y: process.env.RA_API_KEY,
      u: req.query.username,
      g: req.query.gameId
    });

    const response = await axios.get(
      `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = handler;
