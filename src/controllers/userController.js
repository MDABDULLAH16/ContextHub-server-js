import { ObjectId } from 'mongodb';
import { getDB } from '../config/database.js';

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const db = getDB();
    const userCollection = db.collection('users');
    const users = await userCollection.find({}).toArray();
    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const db = getDB();
    const userCollection = db.collection('users');
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const user = await userCollection.findOne({ _id: new ObjectId(id) });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Create a new user
const createUser = async (req, res) => {
  try {
    const db = getDB();
    const userCollection = db.collection('users');
    const { email } = req.body;

    // Check if email already exists
    const existingUser = await userCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already exists',
      });
    }

    const newUser = {
     ...req.body, // Note: In production, hash the password
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
console.log(newUser);

    const result = await userCollection.insertOne(newUser);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { _id: result.insertedId, ...newUser },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    const db = getDB();
    const userCollection = db.collection('users');
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const query ={ _id: new ObjectId(id) };
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
    };

    const result = await userCollection.updateOne(
     query,
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const db = getDB();
    const userCollection = db.collection('users');
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const result = await userCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export { getAllUsers, getUserById, createUser, updateUser, deleteUser };
