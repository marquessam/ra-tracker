module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const { gameId } = req.query;
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

      res.status(200).json({
        Title: data.Title,
        totalAchievements: numAchievements,
        completedAchievements: completed,
        completionPercentage: completionPct
      });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch game data' });
  }
};
