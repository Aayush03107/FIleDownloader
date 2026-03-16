import {S3Client} from "@aws-sdk/client-s3";
import dotenv from "dotenv"
dotenv.config();

export const s3 = new S3Client({
  endpoint: process.env.Endpoint,
  region: "us-east-005",
  credentials: {
    accessKeyId: process.env.KEY_ID,
    secretAccessKey: process.env.APP_KEY,
  },
  requestChecksumCalculation: "NONE",
  responseChecksumValidation: "NONE",
  forcePathStyle: true
})

