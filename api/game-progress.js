const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const { gameId } = req.query;
    const users = [
      'Mbutters',
      'lowaims',
      'ShminalShmantasy',
      'Marquessam',
      'Xsiverx',
      'zckttck',
      'Audex',
      'ParanoidPunky',
      'Magus508',
      'ytwok',
      'joebobdead',
      'tragicnostalgic',
      'MuttonchopMac'
    ];
    
    if (!process.env.RA_API_KEY || !process.env.RA_USERNAME) {
      return res.status(500).json({ error: 'Missing environment variables' });
    }

    // Fetch data for all users
    const usersProgress = await Promise.all(users.map(async (username) => {
      try {
        const params = new URLSearchParams({
          z: process.env.RA_USERNAME,
          y: process.env.RA_API_KEY,
          g: gameId,
          u: username
        });

        const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
        const response = await fetch(url);
        const data = await response.json();

        const numAchievements = Object.keys(data.Achievements || {}).length;
        const completed = Object.values(data.Achievements || {})
          .filter(ach => parseInt(ach.DateEarned) > 0).length;
        const completionPct = ((completed / numAchievements) * 100).toFixed(2);

        return {
          username,
          profileImage: `https://retroachievements.org/UserPic/${username}.png`,
          completedAchievements: completed,
          totalAchievements: numAchievements,
          completionPercentage: parseFloat(completionPct),
          lastUpdate: new Date().toISOString(),
          gameInfo: {
            Title: data.Title,
            ImageIcon: data.ImageIcon
          }
        };
      } catch (error) {
        console.error(`Error fetching data for ${username}:`, error);
        return {
          username,
          profileImage: `https://retroachievements.org/UserPic/${username}.png`,
          completedAchievements: 0,
          totalAchievements: 0,
          completionPercentage: 0,
          error: true
        };
      }
    }));

    // Sort users by completion percentage
    const sortedUsers = usersProgress.sort((a, b) => b.completionPercentage - a.completionPercentage);

    return res.status(200).json({
      gameInfo: sortedUsers.find(u => !u.error)?.gameInfo || { Title: "Final Fantasy Tactics: The War of the Lions" },
      leaderboard: sortedUsers,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard data', details: error.message });
  }
};
