import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  id: { type: String, required: true },
  filekey: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  password: { type: String },
});

const File = mongoose.model("File", fileSchema);

export default File;
