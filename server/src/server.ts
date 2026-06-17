import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes';
import { setupSocketIO } from './socket';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins in local dev/testing
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', apiRouter);

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'online', time: new Date().toISOString() });
});

// Setup Real-time Sockets
setupSocketIO(io);

// Start Server
server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(` ARCADEVERSE BACKEND RUNNING ON PORT ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Sockets & APIs ready to sync.`);
  console.log(`========================================`);
});
