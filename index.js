const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const MY_DOMAIN = process.env.FRONT_END_URL;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    const paymentsCollection = contestHubDb.collection("payments");
    const participantCollection = contestHubDb.collection("participants");

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
        } else {
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

    // contest api create contest
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
          participantCount: 0,
        };
        // console.log(contest);

        const result = await contestsCollection.insertOne(contest);
        res.send(result);
      }
    );
    //get all participants for creator to see;
    app.get(
      "/all-participants",
      verifyFBToken,
      verifyCreator,
      async (req, res) => {
        const email = req.query.email;
        const query = { creator: email };
        const result = await participantCollection.find(query).toArray();
        res.send(result);
      }
    );
    // 1. Get all participants for a specific contest
    app.get("/contest-participants/:id", async (req, res) => {
      const contestId = req.params.id;
      const query = { contestId: contestId };
      const result = await participantCollection.find(query).toArray();
      res.send(result);
    });
    // 2. Update the grading status
    app.patch("/grade-participant/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body; // status will be 'winner', 'rejected', etc.

      try {
        // 1. Get the participant's current info to find their contestId
        const participant = await participantCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!participant)
          return res.status(404).send({ message: "Participant not found" });

        const contestId = participant.contestId;

        if (!contestId) {
          return res.send({ message: "contest NOt found" });
        }

        // 2. If the creator is trying to set a "winner"
        if (status === "winner") {
          // Check if this contest already has a winner
          const existingWinner = await participantCollection.findOne({
            contestId: new ObjectId(contestId),
            gradingStatus: "winner",
          });

          if (existingWinner) {
            return res.status(400).send({
              message:
                "This contest already has a winner. Remove the current winner first.",
            });
          }
        }

        // 3. Update the status
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { gradingStatus: status, updatedAt: new Date() },
        };

        const result = await participantCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });
    //get recent winner for a contest for user;
    app.get("/winner", async (req, res) => {
      try {
        const query = { gradingStatus: "Winner" };

        const result = await participantCollection
          .find(query)
          .sort({ updatedAt: -1 })
          .limit(3) // Optional: Only fetch top 6 for the homepage
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching winners:", error);
        res.status(500).send({ message: "Failed to fetch winners" });
      }
    });
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
    //applied contest status update/reject/accept for admin;
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
          $set: { status: status },
        });
        res.send(contest);
      }
    );
    app.delete(
      "/applied-contest/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await contestsCollection.deleteOne(query);
        res.send(result);
      }
    );
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
    //update my created contest before accepted ;
    app.patch(
      "/contest/:id",
      verifyFBToken,
      verifyCreator,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const contestInfo = {
          $set: {
            ...req.body,
          },
        };
        const result = await contestsCollection.updateOne(query, contestInfo);
        res.send(result);
      }
    );
    //delete my created contest before accepted ;
    app.delete(
      "/contest/:id",
      verifyFBToken,
      verifyCreator,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await contestsCollection.deleteOne(query);
        res.send(result);
      }
    );
    //update my created contest before accepted ;
    app.patch(
      "/contest/:id",
      verifyFBToken,
      verifyCreator,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const contestInfo = {
          $set: {
            ...req.body,
          },
        };
        const result = await contestsCollection.updateOne(query, contestInfo);
        res.send(result);
      }
    );
    //get contest for user;
    app.get("/contests", async (req, res) => {
      const status = req.query.status;
      const query = {};
      if (status) {
        query.status = status;
      }
      const cursor = await contestsCollection.find(query).toArray();
      res.send(cursor);
    });
    app.get("/contest/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const cursor = await contestsCollection.findOne(query);
      res.send(cursor);
    });
    app.get("/contests-search", async (req, res) => {
      const searchText = req.query.search;
      // Create a case-insensitive regex for the search
      const query = {
        status: "accepted", // Only show approved contests
        $or: [
          { name: { $regex: searchText, $options: "i" } },
          { contestType: { $regex: searchText, $options: "i" } },
        ],
      };

      const results = await contestsCollection.find(query).limit(10).toArray();
      res.send(results);
    });

    //payments apis;

    //create check out session;
    // Payment Route
    app.post("/create-checkout-session", async (req, res) => {
      const { contestId, user } = req.body;

      // 1. Validation
      if (!contestId || typeof contestId !== "string") {
        return res
          .status(400)
          .send({ message: "Invalid or missing Contest ID" });
      }

      try {
        // 2. Fetch verified data from DB
        const query = { _id: new ObjectId(contestId) };
        const contest = await contestsCollection.findOne(query);

        if (!contest) {
          return res.status(404).send({ message: "Contest not found" });
        }

        // 3. Define the domain (Ensure http/https is included)
        const client_domain = process.env.MY_DOMAIN || "http://localhost:5173";

        // 4. Create Session
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: user?.email,
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: contest.name,
                  description: `Entry fee for ${contest.name}`,
                },
                unit_amount: Math.round(parseFloat(contest.entryPrice) * 100),
              },
              quantity: 1,
            },
          ],
          metadata: {
            contestId: contestId,
            userEmail: user?.email,
            userName: user?.displayName,
            userImage: user?.photoURL,
          },
          // THE FIX: Use {CHECKOUT_SESSION_ID} exactly as a literal string.
          // Stripe replaces this on their end after the object is created.
          success_url: `${client_domain}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${client_domain}/payment-cancelled`,
        });

        // 5. Send back to your React component
        res.send({ id: session.id, url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error.message);
        res.status(500).send({ error: error.message });
      }
    });
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      console.log("sessionisd", sessionId);

      try {
        // 1. Retrieve the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // console.log("after success", session);

        // session.payment_intent is the unique Transaction ID
        const transactionId = session.payment_intent;
        // console.log('trans',transactionId);

        const duplicate = await participantCollection.findOne({
          transactionId,
        });
        if (duplicate) {
          return res.send({ message: "Already processed", success: true });
        }
        // 2. Check if this payment was already processed
        const existPayment = await participantCollection.findOne({
          transactionId,
        });
        if (existPayment) {
          return res.send({
            message: "Payment already processed!",
            transactionId,
          });
        }

        // 3. Verify the status is 'paid'
        if (session.payment_status === "paid") {
          const { contestId, userEmail, userName, userImage } =
            session.metadata;

          // 4. Update Contest (Increment Participants)
          const contestQuery = { _id: new ObjectId(contestId) };
          await contestsCollection.updateOne(contestQuery, {
            $inc: { participantCount: 1 },
          });
          const creatorInfo = await contestsCollection.findOne(contestQuery);
          // 5. Record the Participation
          // Note: use values from session.metadata and session.amount_total
          const participationInfo = {
            contestId: contestId,
            contestName: creatorInfo?.name,
            creator: creatorInfo?.creator,
            userEmail: userEmail,
            userName: userName,
            userImage: userImage,
            prizeMoney: creatorInfo?.prizeMoney || 0,
            transactionId: transactionId,
            paidAmount: session.amount_total / 100, // Convert cents to USD/BDT
            paymentDate: new Date(),
            taskSubmissionStatus: "pending",
            task: "",
            gradingStatus: "not_graded",
          };

          const result = await participantCollection.insertOne(
            participationInfo
          );
          //update creator balance
          const creatorEmail = creatorInfo?.creator;
          const amountToCredit = session.amount_total / 100; // The entry fee paid

          //update balance on creator account;
          if (creatorEmail) {
            const creatorBalance = await userCollection.updateOne(
              { email: creatorEmail },
              { $inc: { balance: amountToCredit } }
            );
          }

          // 6. Send success response
          res.send({
            success: true,
            message: "Participation confirmed!",
            transactionId,
            amount_total: session.amount_total,
            participationId: result.insertedId,
            contestId: contestId,
          });
        } else {
          res.status(400).send({ message: "Payment not verified" });
        }
      } catch (error) {
        console.error("Payment Success Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Check if user already participated
    app.get("/payment-check/:id", verifyFBToken, async (req, res) => {
      const contestId = req.params.id;
      const email = req.query.email;

      if (!email) return res.status(400).send({ message: "Email required" });

      const query = {
        contestId: contestId,
        userEmail: email,
      };

      const result = await participantCollection.findOne(query);
      res.send({ hasPaid: !!result }); // Returns true if payment exists, false otherwise
    });

    app.patch("/submit-task/:id", async (req, res) => {
      const contestId = req.params.id;
      const { userEmail, task, taskSubmissionStatus } = req.body;
      console.log(userEmail, task, taskSubmissionStatus);

      const filter = {
        contestId: contestId,
        userEmail: userEmail,
      };

      const updateDoc = {
        $set: {
          task: task,
          taskSubmissionStatus: taskSubmissionStatus,
          submittedAt: new Date(), // Useful for checking if they met the deadline
        },
      };

      try {
        const result = await participantCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    app.get("/leaderboard", async (req, res) => {
      try {
        const leaderboard = await participantCollection
          .aggregate([
            { $match: { gradingStatus: "Winner" } },
            {
              $group: {
                _id: "$userEmail",
                totalPaid: { $sum: "$paidAmount" },
                userName: { $first: "$userName" },
                userImage: { $first: "$userImage" },
                winnerCount: { $sum: 1 },
              },
            },
            // Secondary sort: if winnerCount is equal, sort by totalPaid
            { $sort: { winnerCount: -1, totalPaid: -1 } },
            { $limit: 10 },
          ])
          .toArray();

        res.send(leaderboard);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch leaderboard" });
      }
    });
    //user role update api
    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const targetId = req.params.id; // The ID of the user to be changed
        const roleInfo = req.body;
        const adminEmail = req.decoded_email; // Get email from the verified token

        // 1. Find the admin who is making the request
        const adminUser = await userCollection.findOne({ email: adminEmail });

        // 2. Check if the admin is trying to update their own ID
        if (adminUser._id.toString() === targetId) {
          return res.status(403).send({
            success: false,
            message: "Action Forbidden: You cannot change your own role.",
          });
        }

        const query = { _id: new ObjectId(targetId) };
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
    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/users/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const cursor = await userCollection.findOne({ email });
      res.send(cursor);
    });
    app.patch("/users/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const updateInfo = req.body;
      const filter = { email: email };
      const updateDoc = {
        $set: {
          ...updateInfo,

        },
      };
      const cursor = await userCollection.updateOne(filter, updateDoc);
      res.send(cursor);
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
