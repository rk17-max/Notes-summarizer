const express = require("express");
const http = require('http'); // 👈 Add this
const { Server } = require('socket.io');
const path = require("path");
const bcrypt = require('bcrypt');
const emailValidator = require("email-validator");

const { storage, cloudinary } = require('./config/cloudinary');
const multer = require('multer');
const upload = multer({ storage });
const saltRounds = 10;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allows any frontend to connect during development
        methods: ["GET", "POST"]
    }
});
app.set('io', io);

const User = require("./models/User");
const Note = require("./models/Note");
const databaseconnect = require("./config/dbconfig");
const cookieParser = require("cookie-parser");
const summaryController = require("./config/summaryController");
const auth=require("./middlewares/jwtAuth")
app.use(cookieParser());

databaseconnect();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
io.on('connection', (socket) => {
    console.log('⚡ A student connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('📡 A student disconnected');
    });
});
app.use((req,res,next)=>{
  console.log("--->",req.method,req.url)
  next()
})

app.get("/", (req, res) => {
  res.send("hello");
  
});


app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "signup.html"));
});


app.post("/signup", async (req, res) => {
  try {
    console.log("BODY 👉", req.body); // DEBUG

    const user = new User(req.body);
    await user.save();

    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(400).json({ error: err.message });
  }
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});


app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ basic checks
    if (!email || !password) {
      return res.status(400).json({ error: "Please fill all the fields" });
    }

    const validEmail = emailValidator.validate(email);
    if (!validEmail) {
      return res.status(400).json({ error: "Please enter valid email" });
    }

    // 2️⃣ find user
    const foundUser = await User.findOne({ email });
    if (!foundUser) {
      return res.status(400).json({ error: "Email not found" });
    }

    // 3️⃣ PASSWORD MATCH (IMPORTANT PART 🔐)
    const isMatch = await bcrypt.compare(password, foundUser.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid password" });
    }

    // 4️⃣ generate JWT
    const token = foundUser.jwtToken();

    // 5️⃣ cookie options
    const cookieoption = {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      httpOnly: true
    };

    res.cookie("token", token, cookieoption);

    // 6️⃣ remove password before sending response
    foundUser.password = undefined;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: foundUser
    });

  } catch (err) {
    console.error("error in login", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/home", auth, (req, res) => {
    
    res.sendFile(path.join(__dirname, "views", "home.html"));
});

app.get("/protected",auth,(req,res)=>{
  res.status(200).json({
      success: true,
      message: "access granted",
      
    });
  console.log("access granted")
})//test route

app.get("/profile", auth, async (req, res) => {
    try {
       
        const userId = req.user.id;

       
        const user = await User.findById(userId).select("-password");

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        
        res.json({
            success: true,
            user: user
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

app.post('/upload',auth, upload.single('pdf'), async (req, res) => {
  try {
    
    
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a PDF file" });
    }

   
    const newNote = new Note({
      title: req.body.title,
      description: req.body.description,
      subject: req.body.subject,
      course:req.body.course,
      userId: req.user.id, 
      fileUrl: req.file.path,
      publicId: req.file.filename 
    });

    await newNote.save();
    // 👇 📢 ADD THE SOCKET.IO SHOUT HERE
    const io = req.app.get('io');
    io.emit('new-note-notification', {
        userName: "A student", // You can change this to req.user.firstName if it's in your JWT
        noteTitle: newNote.title,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    res.status(201).json({ 
      success: true, 
      message: "Note uploaded successfully!", 
      data: newNote 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// 👇 ADD THIS SECURE DELETE ROUTE
app.delete("/notes/:id", auth, async (req, res) => {
    try {
        const noteId = req.params.id;
        const noteToDelete = await Note.findById(noteId);
        
        if (!noteToDelete) {
            return res.status(404).json({ success: false, error: "Note not found" });
        }

        // 🔒 SECURITY VALIDATION: Is the user deleting it the one who uploaded it?
        if (noteToDelete.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, error: "Unauthorized: You can only delete your own notes." });
        }

        // 1. Delete from Cloudinary
        try {
            if (noteToDelete.publicId) {
                await cloudinary.uploader.destroy(noteToDelete.publicId);
                console.log ("notes deleted from cloudinary")
            } else if (noteToDelete.fileUrl && noteToDelete.fileUrl.includes('cloudinary.com')) {
                const urlParts = noteToDelete.fileUrl.split('/upload/');
                if (urlParts.length === 2) {
                    let publicIdPart = urlParts[1].replace(/^v\d+\//, '');
                    const publicId = publicIdPart.substring(0, publicIdPart.lastIndexOf('.'));
                    await cloudinary.uploader.destroy(publicId);
                }
            }
        } catch (cloudErr) {
            console.error("Cloudinary Deletion Error:", cloudErr);
        }

        // 2. Delete from MongoDB
        await Note.findByIdAndDelete(noteId);

        // 3. Cleanup: Remove from everyone's saved collections
        await User.updateMany(
            { savedNotes: noteId },
            { $pull: { savedNotes: noteId } }
        );

        res.json({ success: true, message: "Note deleted successfully" });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});

app.get("/notes", auth, async (req, res) => {
    try {
        // 👇 CHANGED: Removed the userId filter. An empty object {} means "Find Everything"
        const notes = await Note.find({}).sort({ createdAt: -1 });
        
        res.json({ success: true, notes: notes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});
app.post('/profile',auth, upload.single('avatar'), function (req, res, next) {
  // req.file is the `avatar` file
  // req.body will hold the text fields, if there were any
  console.log("file recieved")
  console.log(req.file)
})
app.post("/summarize",  upload.single("pdf"), summaryController.summarizeUploadedFile);
app.post("/summarize-url", auth, summaryController.summarizeFromUrl);
app.post("/generate-quiz", auth, summaryController.generateQuizFromUrl);
app.post("/save/:noteId", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const noteId = req.params.noteId;

        // Check if already saved
        if (user.savedNotes.includes(noteId)) {
            user.savedNotes.pull(noteId); // Remove if exists
            await user.save();
            return res.json({ success: true, isSaved: false, message: "Removed from collection" });
        } else {
            user.savedNotes.push(noteId); // Add if new
            await user.save();
            return res.json({ success: true, isSaved: true, message: "Added to collection" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});


app.get("/saved-notes", auth, async (req, res) => {
    try {
       
        const user = await User.findById(req.user.id).populate('savedNotes');
        
        const saved = user.savedNotes.reverse(); 
        
        res.json({ success: true, notes: saved });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});
server.listen(3000, () => {
  console.log("🚀 Server & Socket.io running at port 3000");
});