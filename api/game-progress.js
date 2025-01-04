const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// In-memory cache
let cachedData = null;
let lastUpdateTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Custom fetch with retry
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      if (i === retries - 1) throw error;
    }
    // Wait before retrying, with exponential backoff
    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
  }
  throw new Error(`Failed after ${retries} retries`);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log('API request started');
  
  try {
    // Check cache
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
    const csvResponse = await fetchWithRetry(SPREADSHEET_URL);
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

    // Get game info first
    const gameInfoParams = new URLSearchParams({
      z: process.env.RA_USERNAME,
      y: process.env.RA_API_KEY,
      g: gameId,
      u: users[0]
    });

    const gameInfoUrl = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${gameInfoParams}`;
    const gameInfoResponse = await fetchWithRetry(gameInfoUrl);
    const gameInfoData = await gameInfoResponse.json();
    
    const validGameInfo = {
      Title: gameInfoData.Title || "Chrono Trigger",
      ImageIcon: gameInfoData.ImageIcon || "/Images/093950.png"
    };

    // Process all users in batches
    const batchSize = 5;
    const results = [];
    const batches = [];
    
    // Split users into batches
    for (let i = 0; i < users.length; i += batchSize) {
      batches.push(users.slice(i, i + batchSize));
    }

    // Process each batch
    for (const [batchIndex, batch] of batches.entries()) {
      console.log(`Processing batch ${batchIndex + 1} of ${batches.length}`);
      
      const batchPromises = batch.map(async (username) => {
        try {
          const params = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            g: gameId,
            u: username
          });

          const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
          const response = await fetchWithRetry(url);
          const data = await response.json();
          
          const achievements = data.Achievements || {};
          const numAchievements = Object.keys(achievements).length;
          const completed = Object.values(achievements)
            .filter(ach => {
              const dateEarned = parseInt(ach.DateEarned);
              return !isNaN(dateEarned) && dateEarned > 0;
            })
            .length;
            
          console.log(`User ${username}:`, { total: numAchievements, completed });
            
          const completionPct = numAchievements > 0 
            ? ((completed / numAchievements) * 100).toFixed(2) 
            : "0.00";

          return {
            username,
            profileImage: `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`,
            completedAchievements: completed,
            totalAchievements: numAchievements,
            completionPercentage: parseFloat(completionPct) || 0
          };
        } catch (error) {
          console.error(`Error fetching data for ${username}:`, error);
          return null;  // Return null instead of error object
        }
      });

      // Wait for all promises in the batch to resolve
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null));  // Filter out null results
      
      // Add delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('Processing complete. Total results:', results.length);

    // Filter and sort users
    const sortedUsers = results
      .filter(user => user && user.completedAchievements > 0)
      .sort((a, b) => {
        // First sort by completion percentage
        const percentageDiff = b.completionPercentage - a.completionPercentage;
        if (percentageDiff !== 0) return percentageDiff;
        
        // If percentages are equal, sort by number of completed achievements
        return b.completedAchievements - a.completedAchievements;
      });

    console.log('Sorted users:', sortedUsers.map(u => ({
      username: u.username,
      completed: u.completedAchievements,
      percentage: u.completionPercentage
    })));

    const response = {
      gameInfo: validGameInfo,
      leaderboard: sortedUsers.slice(0, 10),
      additionalParticipants: sortedUsers.slice(10).map(u => u.username),
      lastUpdated: new Date().toISOString()
    };

    // Update cache
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
