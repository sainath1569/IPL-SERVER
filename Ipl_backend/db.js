import { base } from 'framer-motion/client';
import mongoose from 'mongoose';
import { TbStatusChange } from 'react-icons/tb';
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    
    username : String,
    email : {type: String, required :true, unique : true},
    password : String,

});
const playerSchema = new mongoose.Schema({
    playerId: {
    type: Number,   
    required: true, 
    unique: true
    },
  name: {
    type: String,
  },

  country: {
    type: String,
  },

  age: {
    type: Number,
  },
  specialism: {
    type: String,
  },
  category: {
    type: String,
  },
 
  previousiplTeams: {
    type: [String],
    default: []
  },
  base: {
    type: String,
  },
  image: {
    type: String
  },
  
 
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const auctionSchema = new mongoose.Schema({
  auctionid: {
    type: String,
    required: true,
    unique: true,
  },
  auctionname: {
    type: String,
    required: true,
    trim: true
  },
  auctiondate: {
    type: Date,
    required: true
  },
  auctiontime: {
    type: String,
    required: true
  },
  phonenumber: {
    type: String,
    required: true,
    trim: true
  },
  place: {
    type: String,
    required: true,
    trim: true
  },
  maxteams: {
    type: Number,
    required: true,
    min: 2,
    max: 10,
    default: 8
  },
  maxplayersperteam: {
    type: Number,
    required: true,
    min: 15,
    max: 30,
    default: 25
  },
  budgetperteam: {
    type: Number,
    required: true,
    min: 5000,
    max: 20000,
    default: 10000
  },
  entryfees: {
    type: Number,
    required: true,
    min: 0
  },
  rewardprize: {
    type: Number,
    required: true,
    min: 0
  },
  scannerimage: {
    data: { type: Buffer, required: false },
    contentType: { type: String, required: false }
  },
  players: [{
     playerId: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
    base: {
      type: Number,
      required: true
    },
    soldprice: {
      type: Number,

    },
    soldto: {
      type: String,
    },
    issold: {
      type: Boolean,
    }
  }],
  teams: [{
    
    teamname: {
      type: String,
      trim: true,
      default: '',
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    teamlogo: {
      data: { type: Buffer, required: false },
    contentType: { type: String, required: false }},
    phonenumber: {
      type: String,
      required: true,
      default: '',
    },
    
    }],
  createdat: {
    type: Date,
    default: Date.now
  },  
  createdby: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed'],
    default: 'upcoming'
  }
  
},);

const requestSchema = new mongoose.Schema({
  teamname: {
    type: String,
    trim: true,
    default: ''
  },
  email:{
    type:String,
    required: true,
    unique: true
  },
  teamlogo: {
    data: { type: Buffer, required: false },
    contentType: { type: String, required: false }
  },
  phonenumber: {
    type: String,
    required: true, 
    default: ''
  },
  teamstatus: {
    type: String,
    enum: ['approved', 'rejected', 'pending'],
    default: 'pending'
  },  
    
  screenshot: {
    data: { type: Buffer, required: false },
    contentType: { type: String, required: false }
  },
  auctionid: {
    type: String,
    required: true
  },  
});

const biddinghistorySchema = new mongoose.Schema({
  auctionId: {
    type: String,
    required: true
  },
  playerName: {
    type: String,
    required: true
  },
  teamName: {
    type: String,
    required: true
  },
  bidAmount: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', UserSchema);
const Player = mongoose.model('Player', playerSchema);  
const Auction = mongoose.model('Auction', auctionSchema);
const Request = mongoose.model('Request', requestSchema);
const BiddingHistory = mongoose.model('BiddingHistory', biddinghistorySchema);




export{ User,
    Player,
    Auction,
    Request,
    BiddingHistory
};