const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Helper function to delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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
      throw new Error('Missing environment variables');
    }

    let validGameInfo = null;
    const usersProgress = [];

    // Fetch data for users sequentially with delays
    for (const username of users) {
      try {
        // Add delay between requests
        await delay(300); // 300ms delay between each request

        const params = new URLSearchParams({
          z: process.env.RA_USERNAME,
          y: process.env.RA_API_KEY,
          g: gameId,
          u: username
        });

        const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!validGameInfo && data.Title && data.ImageIcon) {
          validGameInfo = {
            Title: data.Title,
            ImageIcon: data.ImageIcon
          };
        }

        const numAchievements = data.Achievements ? Object.keys(data.Achievements).length : 0;
        const completed = data.Achievements ? 
          Object.values(data.Achievements).filter(ach => parseInt(ach.DateEarned) > 0).length : 0;
        const completionPct = numAchievements > 0 ? ((completed / numAchievements) * 100).toFixed(2) : "0.00";

        usersProgress.push({
          username,
          profileImage: `https://retroachievements.org/UserPic/${username}.png`,
          profileUrl: `https://retroachievements.org/user/${username}`,
          completedAchievements: completed,
          totalAchievements: numAchievements,
          completionPercentage: parseFloat(completionPct) || 0,
          lastUpdate: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Error fetching data for ${username}:`, error);
        usersProgress.push({
          username,
          profileImage: `https://retroachievements.org/UserPic/${username}.png`,
          profileUrl: `https://retroachievements.org/user/${username}`,
          completedAchievements: 0,
          totalAchievements: 0,
          completionPercentage: 0,
          error: true
        });
      }
    }

    const sortedUsers = usersProgress
      .filter(user => !user.error)
      .sort((a, b) => b.completionPercentage - a.completionPercentage);

    return res.status(200).json({
      gameInfo: validGameInfo || { 
        Title: "Final Fantasy Tactics: The War of the Lions",
        ImageIcon: "/Images/017657.png"
      },
      leaderboard: sortedUsers,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch leaderboard data', 
      details: error.message 
    });
  }
};
