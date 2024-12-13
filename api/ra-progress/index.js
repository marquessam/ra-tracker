module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, gameId } = req.query;
    
    if (!username || !gameId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const params = new URLSearchParams({
      z: process.env.RA_USERNAME,
      y: process.env.RA_API_KEY,
      u: username,
      g: gameId
    });

    const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
    console.log('Requesting:', url);

    const response = await fetch(url);
    const data = await response.json();
    console.log('Response received');

    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
};
