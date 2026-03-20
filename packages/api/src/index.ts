import express, { type Express } from "express";

const app: Express = express();
app.use(express.json());

const port = process.env.PORT ?? 3000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});

export default app;
