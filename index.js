import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import { connectDB, closeDB } from './src/config/database.js';
import userRoutes from './src/routes/userRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'ContestHub Server',
    status: 'running',
    version: '1.0.0',
  });
});

 

// API Routes
app.use('/api/users', userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Start server
async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
     
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// // Graceful shutdown
// process.on('SIGINT', async () => {
//   console.log('\nShutting down...');
//   await closeDB();
//   process.exit(0);
// });

startServer();
