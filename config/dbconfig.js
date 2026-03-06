const mongoose=require("mongoose");
const MONGO_URL="mongodb://localhost:27017/Notes";

const databaseconnect=()=>{
    mongoose.connect(MONGO_URL,{

    }).then(()=>{
        console.log("database connected");
    }).catch((err)=>{
        console.log(err);
    })
}
module.exports=databaseconnect;