/** Local mood pictures for the questionnaire (public/brief-moods, fetched by scripts/fetch-brief-moods.mjs). Client-only. */
export const moodPicture={
 feeling:(id:string,made:boolean)=>`/brief-moods/feelings/${id}-${made?'made':'photo'}.webp`,
 light:(id:string)=>`/brief-moods/light/${id}.webp`,
 world:(id:string)=>`/brief-moods/world/${id}.webp`,
};
