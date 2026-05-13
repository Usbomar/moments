import type { CollectionMusicTrack } from "@/lib/collection-music";

export type AppCollection = {
  id: string;
  name: string;
  coverAssetId: string | null;
  assetIds: string[];
  musicTrackId: string | null;
  musicTrack: CollectionMusicTrack | null;
};

