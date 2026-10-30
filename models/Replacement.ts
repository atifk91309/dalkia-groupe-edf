import { Schema, model, models, Types } from "mongoose";

export interface IReplacement {
  date: Date;
  siteId: string;
  lightId: string;
  siteLocalId?: string;
  lightLocalId?: string;

  existingWattage: string;
  existingFixtureType: string;
  oldFixturesQty: number;
  oldLightsPerFixture: number;
  oldTotalLights: number;
  oldLampWattage: string;

  newFixturesQty: number;
  newLightsPerFixture: number;
  newTotalLights: number;
  newWattageLabel: string;
  typeOfReplacement: string;

  colorTemp: string;
  subContractor: string;
  manpower: number;
  lightingControl: string;
  sensorQty: number;
  controlledLightsQty: number;
  relayQty: number;
  remarks: string;
  remarkDate: string;

  userId: Types.ObjectId;
  workerId: string;
  site: string;
  localId?: string;
  synced?: boolean;
}

const ReplacementSchema = new Schema<IReplacement>({
  date: { type: Date, default: Date.now },
  siteId: { type: String, required: true },
  lightId: { type: String, required: true },
  siteLocalId: { type: String },
  lightLocalId: { type: String },

  existingWattage: { type: String, trim: true },
  existingFixtureType: { type: String, trim: true },
  oldFixturesQty: { type: Number, default: 0, min: 0 },
  oldLightsPerFixture: { type: Number, default: 0, min: 0 },
  oldTotalLights: { type: Number, default: 0, min: 0 },
  oldLampWattage: { type: String, trim: true },

  newFixturesQty: { type: Number, default: 0, min: 0 },
  newLightsPerFixture: { type: Number, default: 0, min: 0 },
  newTotalLights: { type: Number, default: 0, min: 0 },
  newWattageLabel: { type: String, trim: true },
  typeOfReplacement: { type: String, trim: true },

  colorTemp: { type: String, default: "6500k" },
  subContractor: { type: String, default: "Ettiqa", trim: true },
  manpower: { type: Number, default: 0, min: 0 },
  lightingControl: { type: String, trim: true },
  sensorQty: { type: Number, default: 0, min: 0 },
  controlledLightsQty: { type: Number, default: 0, min: 0 },
  relayQty: { type: Number, default: 0, min: 0 },
  remarks: { type: String, trim: true },
  remarkDate: { type: String, trim: true },

  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  workerId: { type: String, required: true, index: true },
  site: { type: String, required: true, index: true, default: "Dalkia-Site" },
  localId: { type: String, sparse: true, index: true },
  synced: { type: Boolean, default: true },
}, { timestamps: true });

// FINAL INDEXES for 1000 workers - no text index, use regex per worker
ReplacementSchema.index({ workerId: 1, date: -1 });
ReplacementSchema.index({ site: 1, workerId: 1, date: -1 });
ReplacementSchema.index({ workerId: 1, siteId: 1, date: -1 });
ReplacementSchema.index({ workerId: 1, lightId: 1, date: -1 });
ReplacementSchema.index({ date: -1 }); // owner
ReplacementSchema.index({ siteId: 1, date: -1 }); // owner breakdown

export default models.Replacement || model<IReplacement>("Replacement", ReplacementSchema);