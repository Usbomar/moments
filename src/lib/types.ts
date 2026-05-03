export type MediaType = "photo" | "video";

export interface AssetFile {
  originalUrl: string;
  previewUrl: string;
  /** ~800px WebP per visors; buit en assets antics sense migració. */
  mediumUrl?: string;
  thumbUrl: string;
  size: number;
  checksum: string;
}

export interface LocationInfo {
  lat: number;
  lng: number;
  city: string;
  country: string;
}

export interface Asset {
  id: string;
  userId: string;
  type: MediaType;
  title: string;
  description?: string;
  takenAt: string;
  uploadedAt: string;
  width: number;
  height: number;
  duration?: number;
  favorite: boolean;
  albumIds: string[];
  peopleIds: string[];
  tags: string[];
  autoTags: string[];
  location?: LocationInfo;
  files: AssetFile;
}

export interface Person {
  id: string;
  name: string;
  coverAssetId?: string;
}

export interface Album {
  id: string;
  name: string;
  coverAssetId?: string;
}
