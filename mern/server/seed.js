import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";
import Product from "./models/Product.js";
import Order from "./models/Order.js";
import Payment from "./models/Payment.js";
import LoyaltyTransaction from "./models/LoyaltyTransaction.js";
import { awardLoyaltyPoints } from "./lib/loyalty.js";
dotenv.config();
await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aquaflow");
await Promise.all([User.deleteMany({}), Product.deleteMany({}), Order.deleteMany({}), Payment.deleteMany({}), LoyaltyTransaction.deleteMany({})]);
await LoyaltyTransaction.init(); // make sure the one-award-per-order index exists
const password = await bcrypt.hash("AquaFlow123!", 12);
const names = [
  ["AquaFlow Admin","admin@aquaflow.test","admin"],
  ["Maria Santos","maria@aquaflow.test","customer"],
  ["Juan Dela Cruz","juan@aquaflow.test","customer"],
  ["Ana Reyes","ana@aquaflow.test","customer"],
  ["Carlo Mendoza","carlo@aquaflow.test","customer"],
  ["Lea Garcia","lea@aquaflow.test","customer"],
  ["Mark Villanueva","rider@aquaflow.test","rider"],
  ["Bea Ramos","bea@aquaflow.test","customer"],
  ["Paolo Lim","paolo@aquaflow.test","customer"],
  ["Nina Flores","nina@aquaflow.test","customer"],
  ["Rico Tan","rider2@aquaflow.test","rider"]
];
const users = await User.insertMany(names.map(([name,email,role], i) => ({
  name,email,role,password,phone:`09${String(171234567+i).slice(-9)}`,address:`${100+i} Sampaguita Street, Pasay City`,addressConfirmed:true,addressLatitude:14.5378+(i*0.002),addressLongitude:121.0014+(i*0.002),riderStatus:role==="rider"?"Ready":"Away"
})));
const products = await Product.insertMany([
  {name:"Purified Water (5 Gallon)",type:"Purified Water",price:50,stock:120,lowStockThreshold:20,unit:"gallon"},
  {name:"Mineral Water (5 Gallon)",type:"Mineral Water",price:55,stock:80,lowStockThreshold:15,unit:"gallon"},
  {name:"Empty Gallon",type:"Empty Gallon",price:150,stock:35,lowStockThreshold:10,unit:"piece"},
  {name:"Bottle Caps (Pack)",type:"Supply",price:80,stock:40,lowStockThreshold:8,unit:"pack"}
]);
const customers = users.filter(u => u.role === "customer");
for (let i=0; i<20; i++) {
  const product = products[i % 2];
  const customer = customers[i % customers.length];
  const quantity = (i % 3) + 1;
  const created = new Date(Date.now() - (20-i)*86400000);
  const order = await Order.create({
    customer: customer._id,
    items:[{product:product._id,name:product.name,productType:product.type,quantity,unitPrice:product.price}],
    total:product.price*quantity,
    deliveryAddress:customer.address,
    deliveryDate:created,
    preferredTime:"8:00 AM - 12:00 PM",
    rider:users.find(u=>u.email==="rider@aquaflow.test")._id,deliveredAt:created,customerRating:i%4===0?null:4+(i%2),customerFeedback:i%4===0?"":(i%2?"Fast and friendly delivery!":"Gallons arrived clean and on time."),feedbackSubmittedAt:i%4===0?null:created,
    status:"Completed",
    paymentMethod:["Cash","GCash","Card"][i%3],
    paymentStatus:"Paid",
    emptyGallonsToPickup:quantity,
    pickupStatus:"Collected",
    createdAt:created, updatedAt:created
  });
  await Payment.create({order:order._id,customer:customer._id,amount:order.total,method:order.paymentMethod,status:"Paid",paidAt:created,createdAt:created,updatedAt:created});
  // Same rule as live orders (1 point per ₱100), dated to when the order was completed.
  const award = await awardLoyaltyPoints(order, { at: created });
  if (award.awarded) await Order.updateOne({ _id: order._id }, { $set: { rewardPointsGranted: true } }, { timestamps: false });
}
// A few live orders so every workspace has something to act on.
const rider = users.find(u=>u.email==="rider@aquaflow.test");
const live = [["Pending",null],["Pending",null],["Confirmed",rider._id],["Out for Delivery",rider._id]];
for (let i=0;i<live.length;i++) {
  const product = products[i%2], customer = customers[i], quantity = i+2;
  const order = await Order.create({customer:customer._id,items:[{product:product._id,name:product.name,productType:product.type,quantity,unitPrice:product.price}],total:product.price*quantity,deliveryAddress:customer.address,deliveryLatitude:customer.addressLatitude,deliveryLongitude:customer.addressLongitude,deliveryDate:new Date(),preferredTime:["8:00 AM - 12:00 PM","1:00 PM - 5:00 PM"][i%2],rider:live[i][1],riderAcceptedAt:live[i][0]==="Out for Delivery"?new Date():null,status:live[i][0],paymentMethod:"Cash on Delivery",emptyGallonsToPickup:quantity,pickupStatus:"Pending"});
  await Payment.create({order:order._id,customer:customer._id,amount:order.total,method:"Cash on Delivery",status:"Pending"});
  await Product.updateOne({_id:product._id},{$inc:{stock:-quantity}});
}
console.log("Seed complete: 11 users, 4 products, 20 completed + 4 live orders.");
console.log("Logins: admin@aquaflow.test · maria@aquaflow.test (customer) · rider@aquaflow.test (rider)");
console.log("Demo password for all users: AquaFlow123!");
await mongoose.disconnect();
