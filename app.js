require('dotenv').config()

const express = require("express");
const app = express();
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const uploadMiddleWare = multer({ dest: "uploads/" });
const fs = require("fs");
const Post = require("./models/Post");
const path = require("path");

const saltRounds = 10;
const salt = bcrypt.genSaltSync(saltRounds);
const secret = process.env.SECRET;
const dburl = process.env.MONGO_URL;
const port = process.env.PORT || 8080;

// app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
// const corsOptions = {
//   origin: ['https://blogapp-client-3e66.onrender.com', 'http://localhost:3000'], // Add other domains as needed
//   optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
// };
const allowedOrigins = ['http://localhost:3000', 'https://blogapp-client-3e66.onrender.com'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "/uploads")));
app.set('port', process.env.PORT || 8080);

mongoose.connect(
  dburl
);

app.get("/", (req, res) => {
  res.json({ message: "Hello World" });
})

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userdoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    res.json(userdoc);
  } catch (e) {
    // Log the error for debugging purposes
    console.error(e);
    // Return a 400 Bad Request status code with a message
    res.status(400).json({ message: "Error creating user" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const userdoc = await User.findOne({ username });
  const passOk = bcrypt.compareSync(password, userdoc.password);
  if (passOk) {
    jwt.sign({ username, id: userdoc._id }, secret, {}, (err, token) => {
      if (err) throw err;
      res.cookie("token", token).json({
        id: userdoc._id,
        username,
      });
    });
  } else {
    res.status(400).json("wrong credentials");
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) throw err;
    res.json(info);
  });
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

app.post("/post", uploadMiddleWare.single("files"), async (req, res) => {
  const { originalname, path } = req.file;
  const parts = originalname.split(".");
  const ext = parts[parts.length - 1];
  const newPath = path + "." + ext;
  fs.renameSync(path, newPath);

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;
    const { title, summary, content } = req.body;
    const postdoc = await Post.create({
      title,
      summary,
      content,
      cover: newPath,
      author: info.id,
    });
    res.json(postdoc);
  });
});

app.get("/post", async (req, res) => {
  res.json(
    await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20)
  );
});

app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postdoc = await Post.findById(id).populate("author", ["username"]);
  res.json(postdoc);
});

app.put("/post", uploadMiddleWare.single("files"), async (req, res) => {
  let newPath = null;
  if (req.file) {
    const { originalname, path } = req.file;
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    newPath = path + "." + ext;
    fs.renameSync(path, newPath);
  }

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;
    const { id, title, summary, content } = req.body;
    try {
      const postdoc = await Post.findById(id);
      const isAuthor =
        JSON.stringify(postdoc.author) === JSON.stringify(info.id);
      if (!isAuthor) {
        return res.status(400).json("you are not author of this post");
      }
      await Post.updateOne(
        { _id: id },
        {
          $set: {
            title,
            summary,
            content,
            cover: newPath ? newPath : postdoc.cover,
          },
        }
      );
      // Fetch the updated document after update
      const updatedPost = await Post.findById(id);
      res.json(updatedPost);
    } catch (error) {
      console.error("Error updating post:", error);
      res
        .status(500)
        .json({ error: "An error occurred while updating the post" });
    }
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/build", "index.html"));
})

app.listen(port, () => {
  console.log(`Server is listening on http://localhost:${port}`);
});
