const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// 1. Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,       
  api_key: process.env.CLOUD_API_KEY,       
  api_secret: process.env.CLOUD_API_SECRET  
});


// Replace your existing storage variable with this:
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'notes_app_uploads',
    // 👇 ADDED IMAGE FORMATS HERE
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png', 'webp'], 
    resource_type: 'auto' 
  }
});

module.exports = {
  cloudinary,
  storage
};