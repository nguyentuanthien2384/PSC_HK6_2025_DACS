import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import initWebRoutes from "./route/web";
dotenv.config();
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
initWebRoutes(app);
const port = process.env.PORT || 6969;
app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});
