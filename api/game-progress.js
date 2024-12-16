const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const { gameId } = req.query;
    
    // Verify environment variables
    if (!process.env.RA_API_KEY || !process.env.RA_USERNAME) {
      return res.status(500).json({ 
        error: 'Missing environment variables',
        check: {
          hasApiKey: !!process.env.RA_API_KEY,
          hasUsername: !!process.env.RA_USERNAME
        }
      });
    }

    const params = new URLSearchParams({
      z: process.env.RA_USERNAME,
      y: process.env.RA_API_KEY,
      g: gameId,
      u: process.env.RA_USERNAME
    });

    const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Title) {
      const numAchievements = Object.keys(data.Achievements || {}).length;
      const completed = Object.values(data.Achievements || {})
        .filter(ach => parseInt(ach.DateEarned) > 0).length;
      const completionPct = ((completed / numAchievements) * 100).toFixed(2);

      return res.status(200).json({
        Title: data.Title,
        totalAchievements: numAchievements,
        completedAchievements: completed,
        completionPercentage: completionPct
      });
    } else {
      return res.status(404).json({ error: 'Game not found' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch game data', details: error.message });
  }
};