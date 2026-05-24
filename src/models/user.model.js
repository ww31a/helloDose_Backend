import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["patient", "provider"],
      required: true,
    },
    avatar: { type: String, default: "" },
    vagaro_id: { type: String, index: true, sparse: true },
    otp: { type: String },
    otpExpiry: { type: Date },
    refreshToken: { type: String },
    deviceToken: { type: String },
    deviceTokens: [
      {
        token: { type: String, required: true },
        platform: { type: String, enum: ["ios", "android", "unknown"], default: "unknown" },
        appVersion: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date, default: Date.now },
      },
    ],
    notificationPreferences: {
      weightLogRemindersEnabled: { type: Boolean, default: true },
    },
    timezone: { type: String},
    isActive: { type: Boolean, default: true },
    onboardingCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── Pre-save: hash OTP ──
userSchema.pre("save", async function (next) {
  if (!this.isModified("otp")) return next();
  if (this.otp) this.otp = await bcrypt.hash(this.otp, 10);
  next();
});

// ── Pre-save: hash refreshToken ──
userSchema.pre("save", async function (next) {
  if (!this.isModified("refreshToken")) return next();
  if (this.refreshToken) this.refreshToken = await bcrypt.hash(this.refreshToken, 10);
  next();
});

// ── Instance Methods ──

userSchema.methods.isOtpValid = async function (candidateOtp) {
  if (!this.otp || !this.otpExpiry) return false;
  if (this.otpExpiry < Date.now()) return false;
  return bcrypt.compare(candidateOtp, this.otp);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { _id: this._id, role: this.role, email: this.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ _id: this._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "30d",
  });
};

userSchema.methods.isRefreshTokenValid = async function (candidateToken) {
  if (!this.refreshToken) return false;
  return bcrypt.compare(candidateToken, this.refreshToken);
};

export const User = mongoose.model("User", userSchema);
