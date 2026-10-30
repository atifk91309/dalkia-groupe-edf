import { Schema, model, models } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser {
  email: string;
  password: string;
  name: string;
  role: "owner" | "worker";
  workerId?: string; // optional for owner
  site: string;
  subContractor?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  offlineCacheUntil?: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["owner", "worker"], default: "worker", index: true },
  
  workerId: { 
    type: String, 
    required: function(this: IUser) { return this.role !== "owner"; },
    unique: true,
    sparse: true, // allows many owners with no workerId
    index: true 
  },
  site: { type: String, required: true, default: "Dalkia-Site", index: true, trim: true },
  subContractor: { type: String, default: "", trim: true },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date },
  offlineCacheUntil: { type: Date, default: () => new Date(Date.now() + 365*24*60*60*1000) }
}, { timestamps: true });

UserSchema.pre("save", async function() {
  if (!this.isModified("password")) return;
  const hashed = await bcrypt.hash(this.get("password") as string, 10);
  this.set("password", hashed);
});

UserSchema.methods.comparePassword = async function(candidate: string): Promise<boolean> {
  const password = this.get("password") as string;
  return bcrypt.compare(candidate, password);
};

export default models.User || model<IUser>("User", UserSchema);