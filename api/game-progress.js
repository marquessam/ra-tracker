const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log('API request started');
  
  try {
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

    // First, fetch game info separately to ensure consistency
    console.log('Fetching game info...');
    const gameInfoParams = new URLSearchParams({
      z: process.env.RA_USERNAME,
      y: process.env.RA_API_KEY,
      g: gameId,
      u: users[0] // Use first user to get game info
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

    console.log('Starting user data fetch');
    const batchSize = 3; // Reduced batch size for more stable requests
    const results = [];
    
    // Process users in smaller batches
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(users.length / batchSize)}`);
      
      const batchPromises = batch.map(async (username) => {
        try {
          // Add a small random delay to prevent exact concurrent requests
          await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
          
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
          
          // More strict checking for completed achievements
          const completed = Object.values(achievements)
            .filter(ach => {
              const dateEarned = parseInt(ach.DateEarned);
              return !isNaN(dateEarned) && dateEarned > 0;
            })
            .length;
            
          console.log(`User ${username} achievements:`, {
            total: numAchievements,
            completed: completed
          });
            
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
          return {
            username,
            profileImage: `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`,
            completedAchievements: 0,
            totalAchievements: 0,
            completionPercentage: 0,
            error: true
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Add delay between batches to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('Finished fetching all user data');
    
    console.log('Pre-filter results:', results.map(user => ({
      username: user.username,
      completed: user.completedAchievements,
      total: user.totalAchievements,
      percentage: user.completionPercentage
    })));

    // Sort users and split into top 10 and others
    const sortedUsers = results
      .filter(user => {
        const isValid = !user.error && 
                       user.totalAchievements > 0 && 
                       user.completedAchievements > 0 && 
                       user.completionPercentage > 0;
        
        if (!isValid) {
          console.log(`Filtered out user ${user.username}:`, {
            hasError: user.error,
            totalAchievements: user.totalAchievements,
            completedAchievements: user.completedAchievements,
            completionPercentage: user.completionPercentage
          });
        }
        
        return isValid;
      })
      .sort((a, b) => {
        // First sort by completion percentage
        const percentageDiff = b.completionPercentage - a.completionPercentage;
        if (percentageDiff !== 0) return percentageDiff;
        
        // If percentages are equal, sort by number of completed achievements
        return b.completedAchievements - a.completedAchievements;
      });

    const topTen = sortedUsers.slice(0, 10);
    const additionalParticipants = sortedUsers.slice(10)
      .map(user => user.username)
      .sort((a, b) => a.localeCompare(b)); // Sort additional participants alphabetically

    const response = {
      gameInfo: validGameInfo,
      leaderboard: topTen,
      additionalParticipants: additionalParticipants,
      lastUpdated: new Date().toISOString()
    };

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
