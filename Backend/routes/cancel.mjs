import { Router } from "express";
import { s3 } from "../BackBlaze/client.mjs";
import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import File from "../Models/FileModel.mjs";

export const route = Router();

route.post("/cancel-upload", async (req, res) => {
  const { id, key, uploadId, strategy } = req.body;

  try {
    // 1. Instantly remove from MongoDB
    await File.findOneAndDelete({ id: id });
    console.log(`Deleted Mongo Record for ID: ${id}`);

    // 2. Clean up Backblaze Storage
    try {
      if (strategy === "multipart" && uploadId) {
        console.log(`Telling Backblaze to abort large file: ${key}`);
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: key,
            UploadId: uploadId,
          }),
        );
      } else {
        console.log(`Telling Backblaze to delete small file: ${key}`);
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: key,
          }),
        );
      }
    } catch (s3Error) {
     
      console.log(
        `Backblaze Cleanup Notice [${s3Error.name}]: ${s3Error.message}`,
      );
    }

    res.json({ success: true, message: "Cleaned up successfully" });
  } catch (error) {
    console.error("Database Cleanup Error:", error);
    res.status(500).json({ error: "Cleanup failed" });
  }
});

