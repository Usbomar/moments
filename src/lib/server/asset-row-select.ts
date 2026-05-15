/**
 * Fragment PostgREST compartit per carregar un asset amb fitxers, ubicació (amb id de `locations`) i tags.
 */
export const ASSET_DETAIL_SELECT =
  "id,user_id,type,title,description,taken_at,uploaded_at,width,height,duration,favorite,hidden_from_guests,color_hue,asset_files(original_url,preview_url,medium_url,thumb_url,checksum,size),asset_locations(location_id,locations(id,lat,lng,city,country)),asset_tags(tag,origin)" as const;
