import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";

import { route as getPreUrlRoute } from "./routes/getpreurl.mjs";
import { route as downloadRoute } from "./routes/download.mjs";
import { route as multipartRoute } from "./routes/mulipart.mjs";
import { route as completeMultipartRoute } from "./routes/completemultipart.mjs";
import { route as cancelRoute } from "./routes/cancel.mjs";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.log("Failed to connect to MongoDB");
    console.log(err);
  });

app.use("/", getPreUrlRoute);
app.use("/", downloadRoute);
app.use("/", multipartRoute);
app.use("/", completeMultipartRoute);
app.use("/", cancelRoute);

app.listen(process.env.PORT || 3000, () => {
  console.log(`Running at Port ${process.env.PORT || 3000}`);
});
