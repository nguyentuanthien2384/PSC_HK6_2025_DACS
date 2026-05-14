const initWebRoutes = (app) => {
  app.get("/health", (req, res) => {
    return res.status(200).json({ ok: true, message: "API is running" });
  });
};
export default initWebRoutes;
