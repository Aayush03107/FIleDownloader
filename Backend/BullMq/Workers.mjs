import { Worker } from "bullmq";
import dotenv from "dotenv";
dotenv.config();
import { DeleteQueue } from "./Queue.mjs";
import File from "../Models/FileModel.mjs";
import { connection } from "../BackBlaze/redisClient.mjs";
import axios from "axios";
import { s3 } from "../BackBlaze/client.mjs";
import {
  DeleteObjectCommand,
  S3Client,
  S3ServiceException,
  waitUntilObjectNotExists,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);

console.log("Mongo connected in worker");

// async function authorize() {
//   const res = await axios.get("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
//     auth: {
//       username: process.env.KEY_ID,
//       password: process.env.APP_KEY
//     }
//   })

//   authToken = res.data.authorizationToken
//   apiUrl = res.data.apiUrl
// }
async function deleteFile(key) {
  try {
    // list all versions
    const versions = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: process.env.BUCKET_NAME,
        Prefix: key,
      }),
    );

    const objectsToDelete = [];

    versions.Versions?.forEach((v) => {
      if (v.Key === key) {
        objectsToDelete.push({
          Key: v.Key,
          VersionId: v.VersionId,
        });
      }
    });

    versions.DeleteMarkers?.forEach((v) => {
      if (v.Key === key) {
        objectsToDelete.push({
          Key: v.Key,
          VersionId: v.VersionId,
        });
      }
    });

    if (objectsToDelete.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: process.env.BUCKET_NAME,
          Delete: {
            Objects: objectsToDelete,
          },
        }),
      );
    }

    console.log("✅ Fully deleted:", key);
  } catch (err) {
    console.log("Delete failed:", err.message);
    throw err;
  }
}

export const delworker = new Worker(
  "DeleteQueue",
  async (job) => {
    const { key, id } = job.data;
    console.log("Processing job:", job.name, id);
    switch (job.name) {
      case "delete-file":
        await deleteFile(key);
        break;
      case "delete-db":
        const file = await File.findOne({ id: id });
        if (file) {
          await File.deleteOne({ id: id });
        }
        break;
      case "delete-multipart":
        try {
          await s3.send(
            new AbortMultipartUploadCommand({
              Bucket: process.env.BUCKET_NAME,
              Key: job.data.key,
              UploadId: job.data.uploadId,
            }),
          );
          console.log("Multipart aborted:", job.data.uploadId);
        } catch (err) {
          console.log(
            "Abort failed (probably already completed):",
            err.message,
          );
        }
        break;
      default:
        break;
    }
  },
  { connection },
);
delworker.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.name}`);
});

delworker.on("failed", (job, err) => {
  console.log(`❌ Job failed: ${job?.name}`, err);
});

delworker.on("error", (err) => {
  console.log("🚨 Worker error:", err);
});
