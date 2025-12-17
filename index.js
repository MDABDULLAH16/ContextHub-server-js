const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");
const serviceAccount = require("./contesthub-1cfb1-firebase-adminsdk.json");

app.use(cors());
app.use(express.json());
const uri = process.env.DATABASE_URL;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// firebase admin verification
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFBToken = async (req, res, next) => {
  const token = req.headers?.authorization;
  // console.log('token',token);

  if (!token) {
    res.status(401).send({ message: "Unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

app.get("/", (req, res) => {
  res.send("Welcome to ContestHub!");
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //collection;
    const contestHubDb = client.db("contesthub");
    const userCollection = contestHubDb.collection("users");
    const creatorCollection = contestHubDb.collection("creators");
    const contestsCollection = contestHubDb.collection("contests");
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      // console.log(email);

      const user = await userCollection.findOne({ email });
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyCreator = async (req, res, next) => {
      const email = req.decoded_email;
      // console.log(email);

      const user = await userCollection.findOne({ email });
      if (!user || user.role !== "creator") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //user apis
    app.get("/api/users", async (req, res) => {
      const users = await userCollection.find({}).toArray();
      res.send({ success: true, count: users.length, data: users });
    });
    // Get user by ID
    app.get("/api/users/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.send({ success: false, error: "Invalid ID" });

      const user = await userCollection.findOne({ _id: new ObjectId(id) });
      res.send({ success: !!user, data: user || null });
    });
    // Create a new user
    app.post("/users", async (req, res) => {
      const { email } = req.body;
      const existingUser = await userCollection.findOne({ email });
      if (existingUser)
        return res.send({ success: false, error: "Email exists" });

      const newUser = {
        ...req.body,
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });
    // Update user
    //  todo patch api

    // Delete user
    app.delete("/api/users/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.send({ success: false, error: "Invalid ID" });

      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ success: result.deletedCount > 0 });
    });

    // creator apis
    // apply to be a creator
    app.post("/creators", async (req, res) => {
      const creator = req.body;
      const result = await creatorCollection.insertOne(creator);
      res.send(result);
    });

    //get all creators apply for admin
    app.get("/creators", verifyFBToken, verifyAdmin, async (req, res) => {
      const status = req.query.status;
      let query = {};
      if (status) {
        query.status = status;
      }
      const creators = await creatorCollection.find(query).toArray();
      res.send(creators);
    });

    // creators apply accept /reject; for admin
    app.patch("/creators", verifyFBToken, verifyAdmin, async (req, res) => {
      const { status } = req.body;
      const { email } = req.query;

      if (!status || !email) {
        return res
          .status(400)
          .send({ success: false, message: "Status or email missing" });
      }

      try {
        // 1️⃣ Update creator application status
        const creatorRes = await creatorCollection.updateOne(
          { email },
          { $set: { status } }
        );

        // 2️⃣ If accepted → update user role
        if (status === "accepted") {
          await userCollection.updateOne(
            { email },
            { $set: { role: "creator" } }
          );
        }
        if (status === "rejected") {
          await userCollection.updateOne({ email }, { $set: { role: "user" } });
        }

        res.send({
          success: true,
          message: `Creator ${status} successfully`,
          creatorModified: creatorRes.modifiedCount,
        });
      } catch (error) {
        console.error("Creator update failed:", error);
        res.status(500).send({ success: false });
      }
    });

    // contest api  create contest
    app.post(
      "/create-contest",
      verifyFBToken,
      verifyCreator,
      async (req, res) => {
        const contestInfo = req.body;
        // console.log("info", contestInfo);

        const contest = {
          ...contestInfo,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        // console.log(contest);

        const result = await contestsCollection.insertOne(contest);
        res.send(result);
      }
    );
    //get apply contest for admin;
    app.get(
      "/applied-contest",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const cursor = contestsCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      }
    );
    //applied contest status update/reject/accept;
    app.patch(
      "/applied-contest/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const status = req.query.status;
        const query = { _id: new ObjectId(id) };
        if (!status) {
          return res.send({ message: "status not found" });
        }

        const contest = await contestsCollection.updateOne(query, {
          $set: status,
        });
        res.send(contest);
      }
    );
    app.delete('/applied-contest/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestsCollection.deleteOne(query);
      res.send(result)
    })
    //get my created contest; for creator
    app.get(
      "/my-created-contest",
      verifyFBToken,
      verifyCreator,
      async (req, res) => {
        const email = req.query.email;
        console.log(email);

        const findMyContest = await contestsCollection
          .find({ creator: email })
          .toArray();
        res.send(findMyContest);
      }
    );

    //user role update api
    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );
    //user role retrieved
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await userCollection.findOne(query);
      res.send({ role: result?.role || "user" });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`ContestHub listening on port ${port}`);
});
