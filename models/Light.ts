import { Schema, model, models, Types, type UpdateQuery } from "mongoose";

export interface ILight {
  lightName: string;
  wattage: string;
  lightType: string;
  modelNo: string;
  brandModelFull: string;
  company: string;
  stockIn: number;
  stockDamage: number;
  stockInstalled: number;
  stockAvailable: number;
  userId: Types.ObjectId;
  workerId: string;
  site: string;
  localId?: string;
  synced?: boolean;
}

const LightSchema = new Schema<ILight>({
  lightName: { type: String, required: true, trim: true },
  wattage: { type: String, required: true, trim: true },
  lightType: { type: String, required: true, trim: true },
  modelNo: { type: String, required: true, trim: true },
  brandModelFull: { type: String, trim: true },
  company: { type: String, trim: true },
  stockIn: { type: Number, default: 0, min: 0 },
  stockDamage: { type: Number, default: 0, min: 0 },
  stockInstalled: { type: Number, default: 0, min: 0 },
  stockAvailable: { type: Number, default: 0, min: 0 },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  workerId: { type: String, required: true, index: true },
  site: { type: String, required: true, index: true, default: "Dalkia-Site" },
  localId: { type: String, sparse: true, index: true },
  synced: { type: Boolean, default: true },
}, { timestamps: true });

LightSchema.index({ workerId: 1, createdAt: -1 });
LightSchema.index({ site: 1, workerId: 1 });
LightSchema.index({ modelNo: 1, workerId: 1 });
LightSchema.index({ workerId: 1, stockAvailable: -1 });

function calc(doc: ILight) {
  doc.stockAvailable = Math.max(0, (doc.stockIn || 0) - (doc.stockDamage || 0) - (doc.stockInstalled || 0));
}

LightSchema.pre("save", function() {
  calc(this as unknown as ILight);
});

LightSchema.pre("findOneAndUpdate", function() {
  const update = this.getUpdate() as UpdateQuery<ILight> | null;
  if (!update) return;
  
  const set = (update.$set || update) as Partial<ILight>;
  
  if (
    typeof set.stockIn === "number" &&
    typeof set.stockDamage === "number" &&
    typeof set.stockInstalled === "number"
  ) {
    const available = Math.max(0, set.stockIn - set.stockDamage - set.stockInstalled);
    if (update.$set) {
      (update.$set as Partial<ILight>).stockAvailable = available;
    } else {
      (update as Partial<ILight>).stockAvailable = available;
    }
  }
});

export default models.Light || model<ILight>("Light", LightSchema);