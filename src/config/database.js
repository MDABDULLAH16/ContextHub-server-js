import { MongoClient, ServerApiVersion } from 'mongodb';

let db;
let client;

const connectDB = async () => {
  try {
    const MONGODB_URI = process.env.DATABASE_URL;

    client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    await client.connect();
    await client.db('admin').command({ ping: 1 });
    db = client.db('contesthub');
    console.log('Connected to MongoDB');
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

const closeDB = async () => {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
};

export { connectDB, getDB, closeDB };
