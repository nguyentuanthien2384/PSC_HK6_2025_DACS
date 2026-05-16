import express from "express";
let router = express.Router();

let initwebRoutes = (app) => {
  router.get("/", (req, res) => {
    return res.send("hello");
  });

  router.get("/health", (req, res) => {
    return res.status(200).json({ status: "OK" });
  });

  return app.use("/", router);
};

module.exports = initwebRoutes;
