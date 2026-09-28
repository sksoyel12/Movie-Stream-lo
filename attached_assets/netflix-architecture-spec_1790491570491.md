# Implement Full Netflix Architecture: 101-Category Dynamic Feed, Hero Banner, Dynamic Artwork Personalization, Premium Top 10 Styling, and 24-Hour Cache

1. **24-Hour Cache & Refresh Architecture:**
   - In `artifacts/api-server/src/`:
   - Enforce a strict 24-hour Time-To-Live (TTL = 86,400,000 ms) caching engine.
   - Cache keys must be keyed by region and date: `feed_${userRegion}_${new Date().toISOString().slice(0, 10)}`.
   - Content and poster assets must NEVER refresh within 24 hours. The layout, ordering, and posters remain 100% frozen until the 24-hour window expires, after which a background job fetches fresh data.

2. **Hero Banner (Strictly Latest Netflix Originals):**
   - Query endpoint filtered strictly for Netflix Network (`with_networks=213`) sorted by release date (`first_air_date.desc` / `primary_release_date.desc`). Do NOT rely on TMDb generic trending.
   - Ensure the item contains a valid, high-resolution backdrop (`backdrop_path`).
   - Overlay clean Netflix-style typography, genre pills, a white "Play" button, and a translucent "My List" button with subtle bottom gradient fade.

3. **Premium Netflix-Style Top 10 Ranking Numbers:**
   - On rows 6, 11, 30, 62, 67, and 90:
   - Render numbers 1 through 10 with hollow/bordered metallic typography:
     - Font size: ~90px, bold/extra-black.
     - Styling: Outline stroke (`-webkit-text-stroke: 4px #595959` or React Native text shadow/border overlay), transparent fill, deep drop shadow.
     - Position: Absolute bottom-left corner of the poster card, overlapping behind the image slightly (`zIndex: 2`, negative left margin).

4. **Netflix AI Artwork Personalization (Contextual Posters):**
   - Implement dynamic artwork selection based on user viewing preferences:
     - If the user prefers Romance/Love, query movie/show images (`/movie/{id}/images` or `/tv/{id}/images`) and pick backdrops/posters tagged with romantic scene keywords, or select warm-toned still frames instead of action posters.
     - If the user prefers Action or Thriller, select high-intensity scene stills or character close-ups.

5. **Strict 101-Category Line-by-Line Feed Configuration:**
   Render the home screen rows strictly in this exact line-by-line order without skipping or reordering, mapped to Netflix production network (`with_networks=213`) and regional filters:

   1. **Trending Now** -> Netflix Global Top Trending
   2. **Meet Your Next Binge** -> High episode count, high rating Netflix series
   3. **Your Next Watch** -> Personalized recommendations
   4. **Korean TV Shows** -> Origin: KR, Network: Netflix (`with_origin_country=KR`)
   5. **Romantic Shows** -> Genre: 10749 (Romance), TV series
   6. **Top 10 Movies in India Today** -> Netflix Top 10 Movies in India (Ranked 1-10)
   7. **Continue watching** -> User history state
   8. **We Think You'll Love These** -> Curated high-match Netflix content
   9. **Made in Korea** -> Origin: KR Movies & TV
   10. **It's Okay to Not Be Okay** -> Feature title spotlight & similar psychological romance titles
   11. **Top 10 show in Korea** -> Netflix Top 10 TV Shows in South Korea (Ranked 1-10)
   12. **Because you liked** -> Collaborative filtering based on last watched
   13. **Romantic East Asian TV Shows** -> Origin: KR, JP, CN, TW | Genre: Romance
   14. **Get in on the action** -> Genre: 28, 10759 (Action & Adventure)
   15. **New Releases** -> Latest Netflix releases within last 30 days
   16. **First Love Romance** -> Sweet romance, high school/youth romance tags
   17. **K-Dramas** -> Popular Korean Drama series
   18. **Do You Like Brahms** -> Classical music / Melodrama theme cluster
   19. **Emotional Movie** -> Genre: Drama (18), Tearjerker tags
   20. **Eye Candy** -> Visually rich cinematography & top-billed casts
   21. **New on Netflix** -> Tagged specifically under newly added Netflix catalog
   22. **US TV Shows** -> Origin: US, Network: Netflix
   23. **Critically Acclaimed TV Shows** -> Vote average >= 8.0, Vote count > 1000
   24. **Love language** -> Modern relationship & dating dramedies
   25. **My List** -> User saved watchlist items
   26. **Downloads For You** -> Offline cached / auto-download mock row
   27. **Asian TV Shows** -> Origin: KR, JP, IN, TH, CN
   28. **Can this love be translated** -> Cross-cultural & multilingual romance cluster
   29. **Fantasy TV Shows** -> Genre: 10765 (Sci-Fi & Fantasy TV)
   30. **Made in Korea** -> Dedicated K-Content library
   31. **Top 10 Shows in India Today** -> Netflix Top 10 TV in India (Ranked 1-10)
   32. **Hidden Gems** -> High ratings (>7.8) with moderate vote count
   33. **Romantic International Opposites-Attract TV Dramas** -> Opposites-attract trope
   34. **Because You Watched The East** -> High-octane political/thriller recommendations
   35. **Mysteries Dramas** -> Genre: 9648 (Mystery) + 18 (Drama)
   36. **US TV Comedies** -> Origin: US | Genre: 35 (Comedy)
   37. **Because you watched The Palace** -> Historical/Royal romance cluster
   38. **Popular on Stream** -> High viewership stream index
   39. **Suspenseful TV Shows** -> High-tension mystery & crime series
   40. **Korean TV Dramas** -> Melodramatic and realistic Korean drama series
   41. **Romantic International TV Comedies** -> Multi-country Rom-Com series
   42. **Korean TV Action & Adventure** -> Origin: KR | Genre: 10759
   43. **Mind-Bending Stories** -> Psychological, time-loop, and mystery plots
   44. **Familiar Favourite Series** -> Nostalgic long-running binge series
   45. **Asian Movies & TV** -> Pan-Asian feature films & series
   46. **Made in India** -> Origin: IN, Bollywood & regional originals
   47. **Psychological Thrillers** -> Dark psychological suspense
   48. **Anime** -> Genre: 16 (Animation) | Origin: JP
   49. **Bingeworthy TV Shows** -> Addictive pacing multi-season series
   50. **Dreams to you** -> Inspirational and aspirational dramas
   51. **Critically Acclaimed US TV Dramas** -> Origin: US | Rating >= 8.2
   52. **Coming of Age** -> Youth, teen, and university dramas
   53. **Everyone's Watching** -> Mass viral trending titles
   54. **Movies & TV Shows Dubbed in Telugu** -> With Telugu audio track availability
   55. **Global Top Picks** -> Worldwide top-performing international titles
   56. **Erase My Memory So I Can Watch Again** -> Legendary plot-twist masterpieces
   57. **Swoonworthy Romance** -> Heart-fluttering romance originals
   58. **TV Sci-Fi & Horror** -> Genre: 10765 + 27
   59. **Crowd Pleasers** -> High audience score easy-watch titles
   60. **Only On Netflix shows** -> Strict Netflix exclusive originals
   61. **Kids & Family** -> Rating: G / PG | Genre: 10751
   62. **Get In on the Action** -> Adrenaline-fueled blockbusters
   63. **Top 10 Movie India** -> Netflix Top 10 Indian Feature Films (Ranked 1-10)
   64. **Blockbuster Movies** -> High-budget cinematic features
   65. **Late Night Watch** -> Dark mystery, mature thrillers
   66. **IMDb Top Rated** -> Highest rated cross-reference titles
   67. **Leaving Soon** -> Expiring license simulated row
   68. **Top 5 show by Netflix Korean** -> Top 5 Korean Netflix mega-hits (Ranked 1-5)
   69. **Only On S-Movie original** -> Custom self-hosted exclusive library
   70. **Anime Series** -> TV Anime serials
   71. **Dream to you** -> Uplifting character-driven stories
   72. **Indian Movies** -> Bollywood, Tollywood, Kollywood features
   73. **Romantic Indian movies** -> Origin: IN | Genre: Romance
   74. **Desi & chill** -> Light-hearted Indian comedies & dramas
   75. **A Piece of Your Mind** -> Melancholic healing romance cluster
   76. **The Lonely and Great God** -> Fantasy romance / Goblin thematic cluster
   77. **Sweet home** -> Dark apocalyptic monster thriller cluster
   78. **Our Beloved Summer** -> Documentary-style slice-of-life romance
   79. **When the Weather is Fine** -> Cozy countryside melodrama
   80. **When Life Gives You Tangerines** -> Jeju-based nostalgic romance collection
   81. **Twenty-Five Twenty-One** -> Retro sports & youth melodrama
   82. **Lovely Runner** -> Time-slip idol romance cluster
   83. **Romantic Comedies** -> Universal Rom-Com classics
   84. **US Movies dubbed in Hindi** -> Hollywood blockbusters with Hindi audio track
   85. **Alice in Borderland** -> Death-game survival thriller cluster
   86. **Romantic Indian Dramas (4729)** -> Deep Indian emotional dramas
   87. **Classics (31574)** -> Golden era legendary cinema
   88. **Children & Family Films (783)** -> Family night movies
   89. **Sci-Fi & Fantasy (1492)** -> High concept speculative fiction
   90. **Thrillers (8933)** -> Edge-of-the-seat thrillers
   91. **Top 10 Movies Worldwide Today** -> Netflix Global Top 10 Films (Ranked 1-10)
   92. **Highest Rated Series** -> Peak rating critically acclaimed shows
   93. **Recently Added** -> Ingested within the last 7 days
   94. **Love at First Sight** -> Instant romantic connection trope
   95. **Only Here on S Movie Original** -> Premium branded content
   96. **One-Night Binge** -> Fast-paced miniseries (under 8 episodes)
   97. **S-MOVIE Coming Soon** -> Upcoming Netflix trailers & previews
   98. **Trending Anime** -> Current season trending anime
   99. **Even If This Love Disappears from the World Tonight** -> Memory loss melodrama
   100. **If You Liked True Beauty** -> Webtoon makeover & school romance
   101. **My Royal Nemesis & Sold Out on You** -> Enemies-to-lovers historical/modern romance
