import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import cohortRoutes from "./routes/cohorts.js";
import threadRoutes from "./routes/threads.js";
import { threadMessageRoutes, messageRoutes } from "./routes/messages.js";

const app: Express = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/cohorts", cohortRoutes);
app.use("/threads", threadRoutes);
app.use("/threads", threadMessageRoutes);
app.use("/messages", messageRoutes);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
});

export default app;
