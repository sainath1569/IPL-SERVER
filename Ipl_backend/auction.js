import { Router } from 'express';
import { Player, Auction, Request } from './db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  }
});

const Auctionrouter = Router();

// GET Players with optional filters
Auctionrouter.get('/getplayers', async (req, res) => {
  try {
    const { search, country, specialism, minPrice, maxPrice } = req.query;

    const filter = {};

    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    if (country) {
      filter.country = country;
    }
    if (specialism) {
      filter.specialism = specialism;
    }
    if (minPrice || maxPrice) {
      filter.soldprice = {};
      if (minPrice) filter.soldprice.$gte = Number(minPrice);
      if (maxPrice) filter.soldprice.$lte = Number(maxPrice);
    }

    const players = await Player.find(filter).sort({ soldprice: -1 }).limit(250);
    res.status(200).json(players);
  } catch (e) {
    console.error("Get Players Error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Create auction with file upload
Auctionrouter.post('/create', upload.single('scannerimage'), async (req, res) => {
  try {
    const { 
      auctionid,
      auctionname,
      auctiondate,
      auctiontime,
      phonenumber,
      place,
      maxteams,
      maxplayersperteam,
      budgetperteam,
      entryfees,
      rewardprize,
      players,
      createdby
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'auctionid', 'auctionname', 'auctiondate', 'auctiontime', 
      'phonenumber', 'place', 'maxteams', 'maxplayersperteam',
      'budgetperteam', 'players'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: "Missing required fields",
        missingFields
      });
    }

    // Check if auction already exists
    const existingAuction = await Auction.findOne({ auctionid });
    if (existingAuction) {
      return res.status(400).json({ 
        message: "Auction ID already exists",
        existingAuctionId: existingAuction.auctionid
      });
    }

    // Parse and validate players JSON
    let playersArray;
    try {
      playersArray = JSON.parse(players);
      if (!Array.isArray(playersArray)) {
        throw new Error('Players must be an array');
      }
    } catch (e) {
      return res.status(400).json({ 
        message: "Invalid players format",
        error: e.message
      });
    }

    // Validate player IDs exist in Player collection
    const playerIds = playersArray.map(p => p.playerId);
    const validPlayers = await Player.find({ playerId: { $in: playerIds } });
    
    if (validPlayers.length !== playerIds.length) {
      const missingIds = playerIds.filter(id => 
        !validPlayers.some(p => p.playerId === id)
      );
      return res.status(400).json({ 
        message: "Some player IDs are invalid",
        missingPlayerIds: missingIds,
        validPlayerIds: validPlayers.map(p => p.playerId)
      });
    }

    // Handle scanner image
    let scannerImageData = null;
    if (req.file) {
      scannerImageData = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    // Prepare auction object
    const newAuction = {
      auctionid,
      auctionname,
      auctiondate: new Date(auctiondate),
      auctiontime,
      phonenumber,
      place,
      maxteams: Number(maxteams),
      maxplayersperteam: Number(maxplayersperteam),
      budgetperteam: Number(budgetperteam),
      entryfees: Number(entryfees) || 0,
      rewardprize: Number(rewardprize) || 0,
      scannerimage: scannerImageData,
      players: playersArray.map(p => ({
        playerId: p.playerId,
        base: Number(p.base) || 0,
        soldprice: 0,
        soldto: null,
        issold: false
      })),
      createdat: new Date(),
      createdby,
      status: 'upcoming'
    };

    // Create and save the auction
    const createdAuction = await Auction.create(newAuction);
    
    // Return success response
    res.status(201).json({
      success: true,
      message: "Auction created successfully",
      auction: {
        id: createdAuction._id,
        auctionid: createdAuction.auctionid,
        auctionname: createdAuction.auctionname,
        playerCount: createdAuction.players.length
      }
    });

  } catch (error) {
    console.error("Create Auction Error:", error);
    
    // Enhanced error response
    const errorResponse = {
      success: false,
      message: "Failed to create auction",
      error: error.message
    };

    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
      errorResponse.fullError = error;
    }

    res.status(500).json(errorResponse);
  }
});
// Get all auctions created by user
Auctionrouter.post('/getallauctions', async (req, res) => {
  try {
    const { createdby } = req.body;
    if (!createdby) {
      return res.status(400).json({ message: "Missing required field: createdby" });
    }
    const auctions = await Auction.find({ createdby }).sort({ createdat: -1 });
    res.status(200).json(auctions);
  } catch (e) {
    console.error("Get All Auctions Error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Update auction status
Auctionrouter.put('/update-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['upcoming', 'ongoing', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid status value',
        validStatuses
      });
    }

    const auction = await Auction.findById(id);
    if (!auction) {
      return res.status(404).json({ 
        success: false,
        message: 'Auction not found' 
      });
    }

    // Status transition validation
    if (auction.status === 'completed') {
      return res.status(400).json({ 
        success: false,
        message: 'Completed auctions cannot be modified' 
      });
    }

    if (status === 'ongoing' && auction.status !== 'upcoming') {
      return res.status(400).json({ 
        success: false,
        message: 'Only upcoming auctions can be started' 
      });
    }

    // Update status
    auction.status = status;
    await auction.save();

    res.status(200).json({ 
      success: true,
      message: 'Auction status updated successfully',
      data: auction
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});


Auctionrouter.get('/upcoming', async (req, res) => {
  try {
    // 1. Get all upcoming auctions
    const auctions = await Auction.find({ status: 'upcoming' })
      .sort({ createdat: -1 })
      .lean();
    
    // 2. Get all pending/approved requests for these auctions
    const auctionIds = auctions.map(a => a.auctionid);
    const requests = await Request.find({ 
      auctionid: { $in: auctionIds }
    }).lean();

    // 3. Combine the data to show user's participation status
    const enhancedAuctions = auctions.map(auction => {
      // Find all requests for this auction
      const auctionRequests = requests.filter(r => r.auctionid === auction.auctionid);
      
      return {
        ...auction,
        // Include requests information
        requests: auctionRequests,
        // Teams are only the approved ones (already in auction.teams)
        teams: auction.teams || []
      };
    });
    res.status(200).json(enhancedAuctions);
  } catch (e) {
    console.error("Get Upcoming Auctions Error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Join auction route - FIXED


Auctionrouter.post('/join', upload.fields([
  { name: 'screenshot', maxCount: 1 },
  { name: 'teamlogo', maxCount: 1 }
]), async (req, res) => {
  try {
    const { teamname, phonenumber,email, auctionid } = req.body;
    
    // Find by string ID
    const auction = await Auction.findOne({ auctionid: auctionid, status: 'upcoming' });
    if (!auction) {
      return res.status(404).json({ message: "Auction not found or not upcoming" });
    }

    // Check for existing team
    const existingTeam = await Request.findOne({ teamname, auctionid });
    if (existingTeam) {
      return res.status(400).json({ message: "Request already exists" });
    }

    // Process files
    const screenshot = req.files.screenshot[0];
    const teamData = {
      teamname,
      email,
      phonenumber,
      auctionid, // Storing as string
      screenshot: {
        data: screenshot.buffer,
        contentType: screenshot.mimetype
      }
    };

    if (req.files.teamlogo) {
      const logo = req.files.teamlogo[0];
      teamData.teamlogo = {
        data: logo.buffer,
        contentType: logo.mimetype
      };
    }

    const newTeam = new Request(teamData);
    await newTeam.save();

    res.status(201).json({
      message: "Request submitted successfully",
      teamId: newTeam._id
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
});
Auctionrouter.get('/getrequests', async (req, res) => {
  try {
    const { auctionid } = req.query;
    if (!auctionid) {
      return res.status(400).json({ message: "Missing required field: auctionid" });
    }

    // Only fetch requests with teamstatus 'pending'
    const requests = await Request.find({ auctionid, teamstatus: 'pending' }).sort({ createdat: -1 });
    res.status(200).json(requests);
  } catch (e) {
    console.error("Get Request Requests Error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
Auctionrouter.post('/approve-request', async (req, res) => {
  try {
    const { requestId, auctionid, email } = req.body;

    // 1. Find the request
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // 2. Update request status
    request.teamstatus = 'approved';
    await request.save();

    // 3. Add basic team info to auction, using email from frontend if provided, else from request
    const teamEmail = email || request.email;

    const updatedAuction = await Auction.findOneAndUpdate(
      { auctionid: auctionid },  // Using auctionid field to find
      {
        $push: {
          teams: {
            teamname: request.teamname,
            email: teamEmail,
            teamlogo: request.teamlogo,
            phonenumber: request.phonenumber
          }
        }
      },
      { new: true }
    );

    if (!updatedAuction) {
      return res.status(404).json({ success: false, message: 'Auction not found' });
    }

    res.json({
      success: true,
      message: 'Request approved and team added',
      auction: updatedAuction
    });

  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during approval',
      error: error.message
    });
  }
});

Auctionrouter.post('/reject-request', async (req, res) => {
  try {
    const { requestId } = req.body;

    // 1. Find the request
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // 2. Update request status
    request.teamstatus = 'rejected';
    await request.save();

    res.json({
      success: true,
      message: 'Request rejected successfully',
      request: request
    });

  }
  catch (error) {
    console.error('Rejection error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during rejection',
      error: error.message
    });
  }

});


Auctionrouter.get('/joined', async (req, res) => {
  try {
    const userEmail = req.query.email;
   
    if (!userEmail) {
      return res.status(400).json({ message: 'User email is required' });
    }
    // Find auctions where user has a team
    const joinedAuctions = await Auction.find({
      'teams.email': userEmail
    }).lean();
    // Enhance with user's team info
    const enhancedAuctions = joinedAuctions.map(auction => {
      const userTeam = auction.teams.find(team => team.email === userEmail);
      return {
        ...auction,
        userTeam: userTeam
      };
    });

    res.status(200).json(enhancedAuctions);
  } catch (error) {
    console.error('Error fetching joined auctions:', error);
    res.status(500).json({
      message: 'Failed to fetch joined auctions',
      error: error.message
    });
  }
});
export default Auctionrouter;