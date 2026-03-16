const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Please provide a title"],
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: [true, "Please provide a description"],
    maxlength: 500
  },
  subject: { type: String, required: true, index: true },
  
  course: {
    type: String,
    required: false, 
    trim: true,
    default: "General" 
  },

  unit: { type: Number, default: 1 },
  fileUrl: { type: String, required: true },
  publicId: { type: String }, 
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  
  ratings: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      score: { type: Number, required: true, min: 1, max: 5 }
    }
  ],
  
  averageRating: { type: Number, default: 0 },
  views: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Note", noteSchema);
