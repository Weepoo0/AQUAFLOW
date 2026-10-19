import { API } from "./api";

export const STORE_METADATA = {
  name: "Aquaflow Water Refilling Station",
  address: "Unit BC2 Shaw Residenza, Shaw Blvd, Mandaluyong City",
  coordinates: { lat: 14.588695, lng: 121.0415226 },
  mapsLink: "https://www.google.com/maps/place/Aquaflow+Water+Refilling+Station/@14.588695,121.0415226,17z/data=!4m6!3m5!1s0x3397c90e33462e05:0xdd6efc4ad20511e!8m2!3d14.5889811!4d121.0429365!16s%2Fg%2F11s176sglr"
};

export function getProductImage(product) {
  if (product?.image && product.image !== "/images/purified water.jpg") {
    return new URL(product.image, new URL(API, window.location.origin).origin).href;
  }
  if (product?.type === "Empty Gallon") return "/images/empty%20jug.jpg";
  if (product?.type === "Mineral Water") return "/images/mineral%20water.jpg";
  if (product?.type === "Purified Water") return "/images/purified%20water.jpg";
  if (product?.type === "Supply" && product.name?.toLowerCase().includes("bottle cap")) {
    return "/images/bottle%20caps.jpg";
  }
  return "";
}
