import mongoose from "mongoose";
const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  actorName: { type: String, default: "System" },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, default: "" },
  details: { type: String, default: "", maxlength: 500 }
}, { timestamps: true });
export default mongoose.model("AuditLog", auditLogSchema);
