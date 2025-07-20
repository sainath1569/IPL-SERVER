import { Router } from 'express';
import { Player, Auction, Request,BiddingHistory } from './db.js';

const AuctionLiveRouter = Router();

// Socket.IO handlers - extracted to a separate function
export function setupSocketHandlers(io) {
  // WebSocket connection handling
  io.on('connection', (socket) => {
    console.log('New client connected');
    const { auctionId, userEmail } = socket.handshake.query;
    
    if (!auctionId) {
      console.error('No auctionId provided in connection');
      socket.disconnect();
      return;
    }

    socket.join(auctionId);

    // Handle price update
    socket.on('updatePrice', async ({ auctionId, playerId, action, newPrice }) => {
      try {
        const auction = await Auction.findOne({ auctionid: auctionId });
        if (!auction) {
          console.error(`Auction not found: ${auctionId}`);
          return;
        }

        const playerIndex = auction.players.findIndex(p => 
          p.playerId && p.playerId.toString() === playerId.toString()
        );
        
        if (playerIndex === -1) {
          console.error(`Player not found with playerId: ${playerId}`);
          return;
        }

        auction.players[playerIndex].soldprice = newPrice;
        await auction.save();

        io.to(auctionId).emit('priceUpdate', { 
          playerId, 
          newPrice 
        });
      } catch (error) {
        console.error('Error handling price update:', error);
      }
    });

    // Handle player sold
    socket.on('sellPlayer', async ({ auctionId, playerId, franchise, soldPrice }) => {
      try {
        const auction = await Auction.findOne({ auctionid: auctionId });
        if (!auction) return;

        const playerIndex = auction.players.findIndex(p => 
          p.playerId && p.playerId.toString() === playerId.toString()
        );
        
        if (playerIndex === -1) return;

        auction.players[playerIndex].soldprice = soldPrice;
        auction.players[playerIndex].soldto = franchise;
        auction.players[playerIndex].issold = true;
        await auction.save();

        io.to(auctionId).emit('playerSold', { 
          playerId, 
          franchise, 
          soldPrice 
        });
      } catch (error) {
        console.error('Error handling player sale:', error);
      }
    });

    // Handle mark unsold
    socket.on('markUnsold', async ({ auctionId, playerId }) => {
      try {
        const auction = await Auction.findOne({ auctionid: auctionId });
        if (!auction) return;

        const playerIndex = auction.players.findIndex(p => 
          p.playerId && p.playerId.toString() === playerId.toString()
        );
        
        if (playerIndex === -1) return;

        const basePrice = Math.floor(auction.players[playerIndex].base / 2);
        auction.players[playerIndex].soldprice = basePrice;
        auction.players[playerIndex].soldto = null;
        auction.players[playerIndex].issold = false;
        await auction.save();

        io.to(auctionId).emit('playerUnsold', { 
          playerId, 
          basePrice 
        });
      } catch (error) {
        console.error('Error marking player unsold:', error);
      }
    });

    // Handle hand raise
    socket.on('raiseHand', ({ auctionId, playerId, team }) => {
      try {
        io.to(auctionId).emit('handRaised', { 
          playerId, 
          teamName: team
        });
      } catch (error) {
        console.error('Error handling hand raise:', error);
      }
    });

    socket.on('lowerHand', ({ auctionId, playerId, team }) => {
      try {
        io.to(auctionId).emit('handLowered', { 
          playerId, 
          teamName: team
        });
      } catch (error) {
        console.error('Error handling hand lower:', error);
      }
    });

    socket.on('changePlayer', ({ auctionId, newIndex, showUnsoldOnly }) => {
      try {
        // Broadcast the player change to all clients in this auction room
        // excluding the sender (organizer who initiated the change)
        socket.to(auctionId).emit('playerChanged', { 
          newIndex, 
          showUnsoldOnly 
        });
        
      } catch (error) {
        console.error('Error handling player change:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });
}

// Get auction details
AuctionLiveRouter.get('/:auctionId', async (req, res) => {
  try {
    const { auctionId } = req.params;
    
    const auction = await Auction.findOne({ auctionid: auctionId })
      .populate('players.playerId')
      .populate('teams');

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    res.json({
      auctionId: auction.auctionid,
      auctionName: auction.auctionname,
      status: auction.status,
      createdby: auction.createdby,
      teams: auction.teams
    });
  } catch (error) {
    console.error('Error fetching auction details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all players for auction
AuctionLiveRouter.get('/:auctionId/players', async (req, res) => {
  try {
    const { auctionId } = req.params;
    
    // First get the auction with player IDs
    const auction = await Auction.findOne({ auctionid: auctionId });
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Extract all player IDs from the auction
    const playerIds = auction.players.map(p => p.playerId);
    
    // Get all player details in one query
    const playersDetails = await Player.find({ playerId: { $in: playerIds } });
    
    // Create a map for quick lookup
    const playersMap = new Map();
    playersDetails.forEach(player => {
      playersMap.set(player.playerId, player);
    });

    // Combine auction player data with player details
    const formattedPlayers = auction.players.map(auctionPlayer => {
      const playerDetails = playersMap.get(auctionPlayer.playerId);
      
      if (!playerDetails) {
        console.warn(`Player details not found for ID: ${auctionPlayer.playerId}`);
        return null;
      }

      return {
        auctionname: auction.auctionname,
        maxteams: auction.maxteams,
        teams: auction.teams,
        playerId: playerDetails.playerId,
        playerName: playerDetails.name,
        country: playerDetails.country,
        age: playerDetails.age,
        role: playerDetails.specialism,
        category: playerDetails.category,
        basePrice: auctionPlayer.base,
        soldPrice: auctionPlayer.soldprice,
        franchise: auctionPlayer.soldto,
        status: auctionPlayer.issold ? 'Sold' : 'Available',
        image: playerDetails.image,
        previousTeams: playerDetails.previousiplTeams || []
      };
    }).filter(p => p !== null);

    res.json(formattedPlayers);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get unsold players
AuctionLiveRouter.get('/:auctionId/players/unsold', async (req, res) => {
  try {
    const { auctionId } = req.params;
    
    const auction = await Auction.findOne({ auctionid: auctionId })
      .populate('players.playerId');

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    const unsoldPlayers = auction.players
      .filter(player => !player.issold)
      .map(player => {
        const playerDetails = player.playerId;
        return {
          playerId: playerDetails.playerId,
          playerName: playerDetails.name,
          country: playerDetails.country,
          age: playerDetails.age,
          role: playerDetails.specialism,
          category: playerDetails.category,
          basePrice: player.base,
          soldPrice: player.soldprice,
          franchise: '',
          status: 'Available',
          image: playerDetails.image,
          previousTeams: playerDetails.previousTeams || ''
        };
      });

    res.json(unsoldPlayers);
  } catch (error) {
    console.error('Error fetching unsold players:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update player price
AuctionLiveRouter.post('/:auctionId/players/price', async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { playerId, action, newPrice } = req.body;

    const auction = await Auction.findOne({ auctionid: auctionId })
      .populate('players.playerId');
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    const playerIndex = auction.players.findIndex(p => {
      // Handle both cases: when playerId is populated and when it's not
      if (p.playerId && typeof p.playerId === 'object') {
        return p.playerId.playerId === playerId;
      } else {
        return p.playerId && p.playerId.toString() === playerId.toString();
      }
    });
    
    if (playerIndex === -1) {
      return res.status(404).json({ message: 'Player not found in auction' });
    }

    auction.players[playerIndex].soldprice = newPrice;
    await auction.save();

    // Get player details for response
    let playerDetails;
    if (auction.players[playerIndex].playerId && typeof auction.players[playerIndex].playerId === 'object') {
      playerDetails = auction.players[playerIndex].playerId;
    } else {
      playerDetails = await Player.findOne({ playerId: auction.players[playerIndex].playerId });
    }
    
    res.json({
      playerId: playerDetails.playerId,
      playerName: playerDetails.name,
      soldPrice: newPrice,
      basePrice: auction.players[playerIndex].base
    });
  } catch (error) {
    console.error('Error updating player price:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Sell player
AuctionLiveRouter.post('/:auctionId/players/sell', async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { playerId, franchise, soldPrice } = req.body;
    
    // Fixed: Use auctionid instead of auctionId
    const auction = await Auction.findOne({ auctionid: auctionId })
      .populate('players.playerId');
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    const playerIndex = auction.players.findIndex(p => {
      if (p.playerId && typeof p.playerId === 'object') {
        return p.playerId.playerId === playerId;
      } else {
        return p.playerId && p.playerId.toString() === playerId.toString();
      }
    });
    
    if (playerIndex === -1) {
      return res.status(404).json({ message: 'Player not found in auction' });
    }

    // Get player details first to extract playerName
    let playerDetails;
    if (auction.players[playerIndex].playerId && typeof auction.players[playerIndex].playerId === 'object') {
      playerDetails = auction.players[playerIndex].playerId;
    } else {
      playerDetails = await Player.findOne({ playerId: auction.players[playerIndex].playerId });
    }

    if (!playerDetails) {
      return res.status(404).json({ message: 'Player details not found' });
    }

    // Update auction player details
    auction.players[playerIndex].soldprice = soldPrice;
    auction.players[playerIndex].soldto = franchise.replace(/\s+/g, '');
    auction.players[playerIndex].issold = true;
    await auction.save();

    // Create bidding history entry for the final sale with playerName instead of playerId
    const biddingHistoryEntry = new BiddingHistory({
      auctionId: auctionId,
      playerName: playerDetails.name, // Store playerName instead of playerId
      teamName: franchise,
      bidAmount: soldPrice,
      timestamp: new Date()
    });
    
    await biddingHistoryEntry.save();
    
    res.json({
      playerId: playerDetails.playerId,
      playerName: playerDetails.name,
      franchise: franchise,
      soldPrice: soldPrice,
      status: 'Sold'
    });
  } catch (error) {
    console.error('Error selling player:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Mark player unsold
AuctionLiveRouter.post('/:auctionId/players/unsold', async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { playerId } = req.body;

    const auction = await Auction.findOne({ auctionid: auctionId })
      .populate('players.playerId');
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    const playerIndex = auction.players.findIndex(p => {
      if (p.playerId && typeof p.playerId === 'object') {
        return p.playerId.playerId === playerId;
      } else {
        return p.playerId && p.playerId.toString() === playerId.toString();
      }
    });
    
    if (playerIndex === -1) {
      return res.status(404).json({ message: 'Player not found in auction' });
    }

    const basePrice = Math.floor(auction.players[playerIndex].base / 2);
    auction.players[playerIndex].soldprice = basePrice;
    auction.players[playerIndex].soldto = null;
    auction.players[playerIndex].issold = false;
    await auction.save();

    // Get player details for response
    let playerDetails;
    if (auction.players[playerIndex].playerId && typeof auction.players[playerIndex].playerId === 'object') {
      playerDetails = auction.players[playerIndex].playerId;
    } else {
      playerDetails = await Player.findOne({ playerId: auction.players[playerIndex].playerId });
    }
    const newbasePrice = basePrice*2 || 0;
    // Store bidding history for unsold player
    const biddingHistory = new BiddingHistory({
      auctionId: auctionId,
      playerName: playerDetails.name,
      teamName: 'UNSOLD',
      bidAmount: newbasePrice,
      timestamp: new Date()
    });

    await biddingHistory.save();
    
    res.json({
      playerId: playerDetails.playerId,
      playerName: playerDetails.name,
      basePrice: basePrice,
      status: 'Unsold'
    });
  } catch (error) {
    console.error('Error marking player unsold:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Franchise details endpoint
AuctionLiveRouter.get('/franchise/:teamName', async (req, res) => {
  try {
    const { teamName } = req.params;
    const { auctionId } = req.query;
    
    // Additional validation
    if (!teamName) {
      console.error('TeamName is missing from route parameters');
      return res.status(400).json({ 
        message: 'Team name is required in the URL path',
        receivedParams: req.params,
        expectedFormat: '/franchise/:teamName?auctionId=AUCT_XXX'
      });
    }
    
    if (!auctionId) {
      return res.status(400).json({ message: 'Auction ID is required as query parameter' });
    }

    // Find the auction
    const auction = await Auction.findOne({ auctionid: auctionId });
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Check if team exists in auction.teams
    const teamExists = auction.teams.some(team => (team.teamname).replace(/\s+/g, '') === teamName);
    
    if (!teamExists) {
      return res.status(404).json({ 
        message: 'Team not found in this auction',
        teamName,
        auctionName: auction.auctionname,
        availableTeams: auction.teams.map(t => t.teamname)
      });
    }

    // Get sold players for this team from auction.players
    const teamPlayers = auction.players.filter(player =>
      player.issold && player.soldto === teamName
    );

    // Calculate total spent
    const totalSpent = teamPlayers.reduce((sum, player) => sum + (player.soldprice || 0), 0);
    
    // Calculate remaining purse
    const remainingPurse = auction.budgetperteam - totalSpent;

    // If no players found, return empty response
    if (teamPlayers.length === 0) {
      return res.json({
        teamName,
        players: [],
        totalSpent: 0,
        remainingPurse,
        budgetPerTeam: auction.budgetperteam,
        auctionName: auction.auctionname,
        teamExists: true
      });
    }

    // Get player IDs
    const playerIds = teamPlayers.map(p => p.playerId);
    
    // Get player details from Player collection
    const playersDetails = await Player.find({ playerId: { $in: playerIds } });

    // Create player details map for faster lookup
    const playersMap = new Map();
    playersDetails.forEach(player => {
      playersMap.set(player.playerId, player);
    });

    // Format players data
    const formattedPlayers = teamPlayers.map(auctionPlayer => {
      const playerDetails = playersMap.get(auctionPlayer.playerId);
      
      if (!playerDetails) {
        console.warn(`Player details not found for ID: ${auctionPlayer.playerId}`);
        return {
          'Player Name': `Unknown Player (ID: ${auctionPlayer.playerId})`,
          'Country': 'Unknown',
          'Age': 'Unknown',
          'Role': 'Unknown',
          'Category': 'Unknown',
          'Base Price': auctionPlayer.base || 0,
          'Sold Price': auctionPlayer.soldprice || 0,
          'Previous Teams': [],
          'Image': null,
          'playerId': auctionPlayer.playerId
        };
      }

      return {
        'Player Name': playerDetails.name || 'Unknown',
        'Country': playerDetails.country || 'Unknown',
        'Age': playerDetails.age || 'Unknown',
        'Role': playerDetails.specialism || 'Unknown',
        'Category': playerDetails.category || 'Unknown',
        'Base Price': auctionPlayer.base || 0,
        'Sold Price': auctionPlayer.soldprice || 0,
        'Previous Teams': playerDetails.previousiplTeams || [],
        'Image': playerDetails.image || null,
        'playerId': playerDetails.playerId
      };
    }).filter(p => p !== null);

    // Return successful response
    res.json({
      teamName,
      players: formattedPlayers,
      totalSpent,
      remainingPurse,
      budgetPerTeam: auction.budgetperteam,
      auctionName: auction.auctionname,
      teamExists: true
    });

  } catch (error) {
    console.error('Error fetching franchise details:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// Backend route (Node.js/Express)
AuctionLiveRouter.get('/biddinghistory/:auctionId', async (req, res) => {
  try {
    const { auctionId } = req.params;
    
    // Get all history entries for this auction
    const history = await BiddingHistory.find({ 
      auctionId
    }).sort({ timestamp: -1 }); // Newest first
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching bidding history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
export { AuctionLiveRouter };