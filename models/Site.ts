import { Schema, model, models, Types } from "mongoose";

export interface ISite {
  projectType: string;
  projectName: string;
  siteNo: string;
  siteName: string;
  floor: string;
  roomNo: string;
  roomType: string;
  areaZone: string;
  locationName: string;
  city: string;
  streetName?: string;
  poleNo?: string;
  userId: Types.ObjectId;
  workerId: string;
  site: string;
  localId?: string;
  synced?: boolean;
}

const SiteSchema = new Schema<ISite>({
  projectType: {
    type: String,
    required: true,
    enum: ["BUILDING", "STREET_LIGHT", "SCHOOL", "COMPOUND", "MOSQUE", "ROAD", "OTHER"],
    default: "BUILDING",
  },
  projectName: { type: String, required: true, trim: true },
  siteNo: { type: String, trim: true },
  siteName: { type: String, required: true, trim: true },
  floor: { type: String, trim: true, default: "N/A" },
  roomNo: { type: String, trim: true, default: "N/A" },
  roomType: { type: String, trim: true },
  areaZone: { type: String, trim: true },
  locationName: { type: String, trim: true },
  city: { type: String, trim: true },
  streetName: { type: String, trim: true },
  poleNo: { type: String, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  workerId: { type: String, required: true, index: true },
  site: { type: String, required: true, index: true, default: "Dalkia-Site" },
  localId: { type: String, sparse: true, index: true },
  synced: { type: Boolean, default: true },
}, { timestamps: true });

// FINAL INDEXES for 1000 workers - single text index allowed
SiteSchema.index({ workerId: 1, createdAt: -1 });
SiteSchema.index({ site: 1, workerId: 1 });
SiteSchema.index({ workerId: 1, projectType: 1 });
SiteSchema.index({ projectType: 1 }); // owner
SiteSchema.index({ siteName: "text", siteNo: "text", projectName: "text", locationName: "text", city: "text" });

export default models.Site || model<ISite>("Site", SiteSchema, "sites");