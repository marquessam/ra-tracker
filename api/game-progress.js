const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// In-memory cache (will reset on function cold starts)
let cachedData = null;
let lastUpdateTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log('API request started');
  
  try {
    // Check if we have valid cached data
    const now = Date.now();
    if (cachedData && lastUpdateTime && (now - lastUpdateTime < CACHE_DURATION)) {
      console.log('Returning cached data');
      return res.status(200).json(cachedData);
    }

    const { gameId } = req.query;
    console.log('Game ID:', gameId);

    const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt6MiNALBT6jj0hG5qtalI_GkSkXFaQvWdRj-Ye-l3YNU4DB5mLUQGHbLF9-XnhkpJjLEN9gvTHXmp/pub?gid=0&single=true&output=csv';

    // Fetch users from spreadsheet
    console.log('Fetching users from spreadsheet...');
    const csvResponse = await fetch(SPREADSHEET_URL);
    const csvText = await csvResponse.text();
    const users = csvText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .slice(1);
    
    console.log(`Fetched ${users.length} users from spreadsheet`);
    
    if (!process.env.RA_API_KEY || !process.env.RA_USERNAME) {
      throw new Error('Missing environment variables');
    }

    // First, fetch game info separately
    console.log('Fetching game info...');
    const gameInfoParams = new URLSearchParams({
      z: process.env.RA_USERNAME,
      y: process.env.RA_API_KEY,
      g: gameId,
      u: users[0]
    });

    const gameInfoUrl = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${gameInfoParams}`;
    const gameInfoResponse = await fetch(gameInfoUrl);
    
    if (!gameInfoResponse.ok) {
      throw new Error(`Failed to fetch game info: ${gameInfoResponse.status}`);
    }

    const gameInfoData = await gameInfoResponse.json();
    const validGameInfo = {
      Title: gameInfoData.Title || "Chrono Trigger",
      ImageIcon: gameInfoData.ImageIcon || "/Images/093950.png"
    };

    // Only process first 10 users initially
    const initialBatchSize = 10;
    const initialUsers = users.slice(0, initialBatchSize);
    const results = [];

    // Process initial batch sequentially
    for (const username of initialUsers) {
      try {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between requests
        
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
        
        // Extract achievement data
        const achievements = data.Achievements || {};
        const numAchievements = Object.keys(achievements).length;
        const completed = Object.values(achievements)
          .filter(ach => {
            const dateEarned = parseInt(ach.DateEarned);
            return !isNaN(dateEarned) && dateEarned > 0;
          })
          .length;
          
        const completionPct = numAchievements > 0 
          ? ((completed / numAchievements) * 100).toFixed(2) 
          : "0.00";

        if (completed > 0) {  // Only add users with progress
          results.push({
            username,
            profileImage: `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`,
            completedAchievements: completed,
            totalAchievements: numAchievements,
            completionPercentage: parseFloat(completionPct) || 0
          });
        }
      } catch (error) {
        console.error(`Error fetching data for ${username}:`, error);
      }
    }

    // Sort results by completion percentage and achievements
    const sortedUsers = results.sort((a, b) => {
      const percentageDiff = b.completionPercentage - a.completionPercentage;
      if (percentageDiff !== 0) return percentageDiff;
      return b.completedAchievements - a.completedAchievements;
    });

    const response = {
      gameInfo: validGameInfo,
      leaderboard: sortedUsers.slice(0, 10),
      additionalParticipants: [],  // Empty for now
      lastUpdated: new Date().toISOString(),
      totalParticipants: users.length,
      processedParticipants: initialBatchSize
    };

    // Cache the response
    cachedData = response;
    lastUpdateTime = now;

    console.log('Sending response');
    return res.status(200).json(response);

  } catch (error) {
    console.error('Detailed API Error:', {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name
    });
    return res.status(500).json({ 
      error: 'Failed to fetch leaderboard data', 
      details: error.message,
      type: error.constructor.name
    });
  }
};
