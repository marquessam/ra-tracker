import axios from 'axios';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { username = '', gameId = '' } = req.query;
  const API_KEY = process.env.RA_API_KEY;
  const API_USER = process.env.RA_USERNAME;
  const BASE_URL = "https://retroachievements.org/API";
  
  try {
    const params = new URLSearchParams({
      z: API_USER,
      y: API_KEY,
      u: username,
      g: gameId
    });

    const response = await axios.get(`${BASE_URL}/API_GetGameInfoAndUserProgress.php?${params}`);
    const data = response.data;
    
    // Calculate completion percentage
    const numAchievements = Object.keys(data.Achievements).length;
    const completed = Object.values(data.Achievements)
      .filter(ach => parseInt(ach.DateEarned) > 0).length;
    const completionPct = ((completed / numAchievements) * 100).toFixed(2);

    res.status(200).json({
      gameTitle: data.Title,
      totalAchievements: numAchievements,
      completedAchievements: completed,
      completionPercentage: completionPct
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch data', details: error.message });
  }
}
