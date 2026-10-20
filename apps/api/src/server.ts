
import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  }),
);

app.use(express.json({ limit: "32kb" }));

// Health check
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "stadiumlive-api",
    timestamp: new Date().toISOString(),
  });
});

// Basic API route
app.get("/api/v1", (_req, res) => {
  res.status(200).json({
    name: "StadiumLive API",
    version: "0.1.0",
    message: "Welcome to StadiumLive!",
  });
});

// Handle unknown routes
app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("API error:", err.message);

    res.status(500).json({
      error: "Internal server error",
    });
  },
);

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`🏟️ StadiumLive API running at http://localhost:${port}`);
});
