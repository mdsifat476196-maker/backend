require("dotenv").config();
let express = require("express");
let mongoose = require("mongoose");
let cors = require("cors");
let app = express();
let crypto = require("crypto");
let jwt = require("jsonwebtoken");
let socket = require("socket.io");
let { Server } = require("socket.io");
let http = require("http");

let socketIds = {}

let server = http.createServer(app);
let io = new Server(server, {
    cors: {
        origin: "*"
    }
})

let userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    profilePic: String
}, { timeStamps: true });

let userModel = mongoose.model("users", userSchema);

let userMessageSchema = new mongoose.Schema({
    senderId: String,
    reciverId: String,
    text: String
}, { timestamps: true });

let messageModel = mongoose.model("messages", userMessageSchema);

app.use(cors({
  origin: "*"
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/get-signature", (req, res) => {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = crypto
            .createHash("sha1")
            .update(`timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`)
            .digest("hex");

        res.json({
            timestamp,
            signature,
            api_key: process.env.CLOUDINARY_API_KEY,
            cloud_name: process.env.CLOUDINARY_CLOUDE_NAME
        });
    } catch (error) {
        console.log(error.name);
        console.log(error.message);
    }
});

app.post("/register", async (req, res) => {
    try {
        let { name, email, password, profilePic } = req.body;
        let isUserExist = await userModel.findOne({ email }).select("-password");
        if (isUserExist) {
            return res.json({ msg: "user is already exist." })
        }
        let user = await userModel.create({
            name,
            email,
            password,
            profilePic
        });
        user.save();

        let token = await jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_TOKEN_SECRET,
            { expiresIn: "7d" }
        );


        res.json({
            msg: "user is registered",
            successCode: true,
            user, token,
            name: user.name
        })
    } catch (error) {
        console.log(error.name);
        console.log(error.message);
    }
});

app.post("/login", async (req, res) => {
    try {
        let { email, password } = req.body;
        let user = await userModel.findOne({ email, password }).select("-password");
        if (!user) {
            return res.json({ msg: "user is not exist." })
        }
        let token = await jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_TOKEN_SECRET,
            { expiresIn: "7d" }
        );
        res.json({
            msg: "user is exist",
            successCode: true,
            user, token,
            name: user.name
        })
    } catch (error) {
        console.log(error.name);
        console.log(error.message);
    }
});

app.post("/get-all-users", async (req, res) => {
    try {
        let { token } = req.body;
        let decodeToken = await jwt.verify(token, process.env.JWT_TOKEN_SECRET);
        let { id } = await decodeToken;

        let allUser = await userModel.find({
            _id: { $ne: id }
        }).select("-password");

        if (!allUser) {
            return res.json({
                "code": 404,
                "msg": "data not found"
            })
        }
        res.json(allUser);
    } catch (error) {
        console.log(error.name);
        console.log(error.message);
    }
});

app.post("/get-user-data", async (req, res) => {
    try {
        let { id } = req.body;
        let userData = await userModel.findById(id).select("-password");
        if (!userData) {
            return res.json({
                "code": 404,
                "msg": "data not found"
            })
        }
        res.json(userData);
    } catch (error) {
        console.log(error.name);
        console.log(error.message);
    }
});






io.on("connection", (socket) => {
    console.log("user is connected.", socket.id);

    socket.on("add-user", (userId) => {
        socketIds[userId] = socket.id;
    });
    let dataForRemoveIDs;

    socket.on("send-message", async (data) => {
        try {
            let { senderId, reciverId, text } = data;
            dataForRemoveIDs = senderId;

            let newMessage = await messageModel.create({
                senderId,
                reciverId,
                text
            });
            await newMessage.save();

            let reciverSocketId = socketIds[reciverId];

            io.to(reciverSocketId).emit("recive-msg", {
                senderId,
                reciverId,
                text
            });

        } catch (error) {
            console.log(error.name);
            console.log(error.message);
        }
    });
    socket.on("disconnect", () => {
        delete socketIds[dataForRemoveIDs];
        console.log("user is disconnected", socket.id);
    });
});



app.post("/get-messages", async (req, res) => {
    try {
        let { senderId, reciverId } = req.body;

        let messages = await messageModel.find({
            $or: [
                { senderId, reciverId },
                { senderId: reciverId, reciverId: senderId }
            ]
        }).sort({ createdAt: 1 });

        res.json(messages);
    } catch (error) {
        console.log(error);
    }
});



let connectDB = async () => {
    try {
        mongoose.connect(`${process.env.MONGOOSE_DB_URL}`);
        console.log("DB is connected");
    } catch (error) {
        console.log(error.name);
        console.log(error.message);
    }
}


// Server start
const PORT = process.env.PORT || 5000;

  server.listen(PORT, () => {
    console.log(`server running port: ${PORT}`);
      connectDB();
});
