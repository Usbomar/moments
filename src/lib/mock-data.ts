import type { Album, Asset } from "@/lib/types";

const cities = [
  { city: "Barcelona", country: "Spain", lat: 41.3874, lng: 2.1686 },
  { city: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393 },
  { city: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { city: "Tokyo", country: "Japan", lat: 35.6764, lng: 139.6500 }
];

const tags = ["travel", "family", "sunset", "food", "street", "nature"];

export const albums: Album[] = [
  { id: "alb-fav", name: "Favorites" },
  { id: "alb-trip", name: "Trips" },
  { id: "alb-weekend", name: "Weekends" }
];

export const assets: Asset[] = Array.from({ length: 120 }, (_, i) => {
  const city = cities[i % cities.length];
  const dayShift = i * 2;
  const takenAt = new Date(Date.now() - dayShift * 24 * 60 * 60 * 1000).toISOString();
  const id = `asset-${i + 1}`;
  return {
    id,
    userId: "u-1",
    type: i % 8 === 0 ? "video" : "photo",
    title: `Moment ${i + 1}`,
    description: i % 11 === 0 ? "Foto de mostra amb descripció curta." : undefined,
    takenAt,
    uploadedAt: new Date(Date.now() - dayShift * 24 * 60 * 60 * 1000 + 40000).toISOString(),
    width: 1600,
    height: 1200,
    duration: i % 8 === 0 ? 24 : undefined,
    favorite: i % 7 === 0,
    albumIds: i % 2 === 0 ? ["alb-trip"] : ["alb-weekend"],
    peopleIds: i % 3 === 0 ? ["p-anna"] : [],
    tags: [tags[i % tags.length]],
    autoTags: [],
    location: city,
    files: {
      originalUrl: `https://picsum.photos/id/${(i % 90) + 10}/2000/1400`,
      previewUrl: `https://picsum.photos/id/${(i % 90) + 10}/1200/800`,
      thumbUrl: `https://picsum.photos/id/${(i % 90) + 10}/500/500`,
      size: 200_000,
      checksum: `chk-${id}`
    }
  };
});
