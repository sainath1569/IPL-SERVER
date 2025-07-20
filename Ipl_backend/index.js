import express from 'express';
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import UserRouter from './login.js';
import PlayerController from './playercontroller.js';
import AuctionRouter from './auction.js';
import { AuctionLiveRouter, setupSocketHandlers } from './auctionlive.js';

const app = express();

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO instance attached to the same server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());  
app.use(cors());

// Routes
app.use("/api/user", UserRouter);
app.use("/api/players", PlayerController);
app.use("/api/auction", AuctionRouter);
app.use("/api/auctionlive", AuctionLiveRouter);

app.get("/", (req, res) => {
    res.send("Welcome to the IPL API!");
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

async function main() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`Socket.IO server also running on the same port`);
        });
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1); 
    }
}

main();