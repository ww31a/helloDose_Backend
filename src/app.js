import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";

const app = express();

// ── Security & Compression ──
app.use(helmet());
app.use(compression());
// app.use(mongoSanitize()); // Disabled: Incompatible with Express 5 req.query getter

// ── CORS ──
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// ── Body Parsing ──
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// ── Static Files ──
app.use(express.static("public"));

// ── Routes ──
import v1Router from "./routes/v1/index.js";
app.use("/api/v1", v1Router);

// ── Health Check ──
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Global Error Handler ──
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    statusCode,
    data: null,
    message: err.message || "Internal Server Error",
    success: false,
    errors: err.errors || [],
  });
});

export default app;
