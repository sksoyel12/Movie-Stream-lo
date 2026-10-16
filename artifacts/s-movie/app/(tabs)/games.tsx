import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SCREEN_W = Dimensions.get("window").width;

// ─── Blacklist ─────────────────────────────────────────────────────────────────
const BLOCKED_IDS = new Set([155]);
function isBanned(id: number | undefined) {
  return id !== undefined && BLOCKED_IDS.has(id);
}

// ─── Snake Game ────────────────────────────────────────────────────────────────
const COLS = 18;
const ROWS = 24;
const CELL = Math.floor((SCREEN_W - 48) / COLS);
type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Pt = { x: number; y: number };

function randomFood(snake: Pt[]): Pt {
  let f: Pt;
  do { f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
  while (snake.some((s) => s.x === f.x && s.y === f.y));
  return f;
}

function SnakeGame({ onClose }: { onClose: () => void }) {
  const initSnake = [{ x: 9, y: 12 }, { x: 8, y: 12 }, { x: 7, y: 12 }];
  const [snake, setSnake] = useState<Pt[]>(initSnake);
  const [food, setFood]   = useState<Pt>({ x: 14, y: 8 });
  const [score, setScore] = useState(0);
  const [alive, setAlive] = useState(true);
  const [started, setStarted] = useState(false);
  const dirRef   = useRef<Dir>("RIGHT");
  const snakeRef = useRef<Pt[]>(initSnake);
  const foodRef  = useRef<Pt>({ x: 14, y: 8 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = () => {
    const s = [{ x: 9, y: 12 }, { x: 8, y: 12 }, { x: 7, y: 12 }];
    snakeRef.current = s; dirRef.current = "RIGHT";
    const f = randomFood(s); foodRef.current = f;
    setSnake(s); setFood(f); setScore(0); setAlive(true); setStarted(false);
  };

  const tick = useCallback(() => {
    const s = snakeRef.current; const d = dirRef.current; const head = s[0];
    const next: Pt = {
      x: d === "LEFT" ? head.x - 1 : d === "RIGHT" ? head.x + 1 : head.x,
      y: d === "UP"   ? head.y - 1 : d === "DOWN"  ? head.y + 1 : head.y,
    };
    if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS || s.slice(0,-1).some((p) => p.x===next.x && p.y===next.y)) {
      if (timerRef.current) clearInterval(timerRef.current); setAlive(false); return;
    }
    const ate = next.x === foodRef.current.x && next.y === foodRef.current.y;
    const newSnake = ate ? [next, ...s] : [next, ...s.slice(0,-1)];
    snakeRef.current = newSnake;
    if (ate) { const nf = randomFood(newSnake); foodRef.current = nf; setFood(nf); setScore((sc) => sc + 10); }
    setSnake([...newSnake]);
  }, []);

  const start = () => { setStarted(true); timerRef.current = setInterval(tick, 160); };
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const turn = (d: Dir) => {
    const opp = { UP:"DOWN", DOWN:"UP", LEFT:"RIGHT", RIGHT:"LEFT" } as Record<Dir,Dir>;
    if (opp[d] === dirRef.current) return;
    dirRef.current = d;
  };

  const snakeSet = new Set(snake.map((p) => `${p.x},${p.y}`));
  return (
    <View style={sg.wrap}>
      <View style={sg.topBar}>
        <Text style={sg.title}>🐍 Snake</Text>
        <Text style={sg.score}>Score: {score}</Text>
        <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => [sg.close, pressed && { opacity: 0.6 }]}>
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
      </View>
      <View style={[sg.board, { width: COLS*CELL, height: ROWS*CELL }]}>
        {Array.from({ length: ROWS }, (_, y) =>
          Array.from({ length: COLS }, (_, x) => {
            const key = `${x},${y}`;
            const isHead = snake[0]?.x===x && snake[0]?.y===y;
            const isBody = !isHead && snakeSet.has(key);
            const isFood = food.x===x && food.y===y;
            return <View key={key} style={[sg.cell, { left:x*CELL, top:y*CELL, width:CELL-1, height:CELL-1 }, isHead&&sg.head, isBody&&sg.body, isFood&&sg.food]} />;
          })
        )}
      </View>
      {(!started || !alive) && (
        <View style={sg.overlay}>
          {!alive && <Text style={sg.overText}>Game Over!</Text>}
          {!alive && <Text style={sg.overScore}>Score: {score}</Text>}
          <Pressable onPress={() => { reset(); setTimeout(start, 50); }} style={sg.startBtn}>
            <Ionicons name="play" size={20} color="#000" />
            <Text style={sg.startBtnText}>{alive ? "Start Game" : "Play Again"}</Text>
          </Pressable>
        </View>
      )}
      <View style={sg.dpad}>
        <View style={sg.dpadRow}><DBtn icon="arrow-up" onPress={() => turn("UP")} /></View>
        <View style={sg.dpadRow}>
          <DBtn icon="arrow-left" onPress={() => turn("LEFT")} />
          <View style={{ width: 48 }} />
          <DBtn icon="arrow-right" onPress={() => turn("RIGHT")} />
        </View>
        <View style={sg.dpadRow}><DBtn icon="arrow-down" onPress={() => turn("DOWN")} /></View>
      </View>
    </View>
  );
}

function DBtn({ icon, onPress }: { icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [sg.dpadBtn, pressed && { opacity: 0.6 }]}>
      <Feather name={icon as any} size={22} color="#fff" />
    </Pressable>
  );
}

const sg = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#000", alignItems: "center" },
  topBar: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", width:"100%", paddingHorizontal:16, paddingVertical:12, backgroundColor:"#111" },
  title: { color:"#fff", fontSize:16, fontFamily:"Inter_700Bold" },
  score: { color:"#22c55e", fontSize:14, fontFamily:"Inter_600SemiBold" },
  close: { padding:4 },
  board: { position:"relative", backgroundColor:"#0d1117", marginTop:12, borderRadius:4 },
  cell: { position:"absolute", borderRadius:2, backgroundColor:"transparent" },
  head: { backgroundColor:"#22c55e", borderRadius:3 },
  body: { backgroundColor:"#16a34a", borderRadius:2 },
  food: { backgroundColor:"#0EA5E9", borderRadius:999 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor:"rgba(0,0,0,0.82)", alignItems:"center", justifyContent:"center", marginTop:12+44 },
  overText: { color:"#0EA5E9", fontSize:28, fontFamily:"Inter_700Bold", marginBottom:8 },
  overScore: { color:"#fff", fontSize:18, fontFamily:"Inter_500Medium", marginBottom:24 },
  startBtn: { flexDirection:"row", alignItems:"center", backgroundColor:"#fff", paddingHorizontal:24, paddingVertical:12, borderRadius:6, gap:8 },
  startBtnText: { color:"#000", fontSize:16, fontFamily:"Inter_700Bold" },
  dpad: { marginTop:16, alignItems:"center", gap:4 },
  dpadRow: { flexDirection:"row", alignItems:"center", gap:4 },
  dpadBtn: { width:52, height:52, backgroundColor:"#1a1a1a", borderRadius:8, alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:"#333" },
});

// ─── Play Store deep link ───────────────────────────────────────────────────────
// Opens the native Google Play Store app directly via its `market://` intent
// scheme (real deep linking, not an in-app browser). Falls back to the plain
// `https://play.google.com/...` URL when `market://` can't be resolved (e.g.
// iOS, web preview, or an emulator with no Play Store app installed) — that
// still lands the user on the correct Play Store page, just via a browser.
async function openPlayStore(packageId: string) {
  const marketUrl = `market://details?id=${packageId}`;
  const webUrl = `https://play.google.com/store/apps/details?id=${packageId}`;
  try {
    const canOpenMarket = Platform.OS === "android" && (await Linking.canOpenURL(marketUrl));
    await Linking.openURL(canOpenMarket ? marketUrl : webUrl);
  } catch {
    try {
      await Linking.openURL(webUrl);
    } catch {
      // Nothing more we can do — the OS has no handler for either scheme.
    }
  }
}

// ─── Game type ─────────────────────────────────────────────────────────────────
type Game = {
  id: number;
  name: string;
  genre: string;
  subgenre?: string;
  description: string;
  modes?: string;
  packageId?: string;
  url?: string;
  native?: boolean;
  icon: string;
  hero: string;
  accentColor: string;
  rating?: string;
  ageLabel?: string;
  size?: string;
  top10?: boolean;
  top10Rank?: number;
  newUpdate?: boolean;
  featured?: boolean;
  /** Short tag chips shown under the title on the detail page and in the
   *  featured banner's tagline (e.g. "Cute • Puzzle • Fantasy"). */
  tags?: string[];
  /** A handful of in-game screenshots shown as a horizontal strip on the
   *  detail page, below the description. */
  screenshots?: string[];
  categories: string[];
};

// ─── Game catalogue ────────────────────────────────────────────────────────────
const GAMES: Game[] = [
  {
    id: 1,
    name: "Snake",
    genre: "Arcade",
    subgenre: "Classic",
    description: "The classic snake game — eat food, grow longer, and don't crash into yourself. Built natively into S Movie Original for zero-download instant play.",
    modes: "Single Player",
    native: true,
    icon: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80",
    accentColor: "#22c55e",
    rating: "E",
    ageLabel: "3+",
    size: "Built-in",
    tags: ["Arcade", "Classic", "Single Player"],
    categories: ["Classic Games", "Puzzle & Brain"],
  },
  {
    id: 2,
    name: "Squid Game: Unleashed",
    genre: "Action",
    subgenre: "Physics-Based",
    description: "You win some, you die some. Use skill and killer instinct to survive twisted competitions in this multiplayer action game inspired by the hit series.",
    modes: "Multiplayer",
    packageId: "com.netflix.NGP.SquidGameUnleashed",
    icon: "https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=800&q=80",
    accentColor: "#ec4899",
    rating: "16+",
    ageLabel: "16+",
    size: "1.1 GB",
    top10: true,
    top10Rank: 1,
    featured: true,
    tags: ["Physics-Based", "Multiplayer", "Action", "Based on the Series"],
    screenshots: [
      "https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1636487658854-e492d0d76dfb?auto=format&fit=crop&w=700&q=80",
      "https://images.unsplash.com/photo-1614332287897-cdc485fa562d?auto=format&fit=crop&w=700&q=80",
    ],
    categories: ["Multiplayer Games", "Games Based on Movies & Shows"],
  },
  {
    id: 3,
    name: "Asphalt Xtreme",
    genre: "Racing",
    subgenre: "Stunts",
    description: "Tear up off-road circuits and conquer the most extreme race environments with Gameloft's electrifying racer. Exclusive to Netflix members.",
    modes: "Multiplayer",
    packageId: "com.netflix.NGP.AsphaltXtreme",
    icon: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80",
    accentColor: "#f97316",
    rating: "E10+",
    ageLabel: "10+",
    size: "1.4 GB",
    top10: true,
    top10Rank: 4,
    tags: ["Racing", "Stunts", "Multiplayer"],
    categories: ["Mobile Games", "Multiplayer Games", "Action & Adventure"],
  },
  {
    id: 4,
    name: "GTA San Andreas",
    genre: "Action",
    subgenre: "Open World",
    description: "Carl Johnson escapes from the pressures of life in Los Santos. Explore San Andreas in Rockstar's Definitive Edition — a Netflix exclusive.",
    modes: "Single Player",
    packageId: "com.netflix.NGP.GTASanAndreasDefinitiveEdition",
    icon: "https://images.unsplash.com/photo-1562016600-ece13e8ba570?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1562016600-ece13e8ba570?auto=format&fit=crop&w=800&q=80",
    accentColor: "#f59e0b",
    rating: "M",
    ageLabel: "18+",
    size: "2.8 GB",
    top10: true,
    top10Rank: 2,
    tags: ["Action", "Open World", "Single Player"],
    categories: ["Mobile Games", "Action & Adventure"],
  },
  {
    id: 5,
    name: "Football Manager 2024",
    genre: "Sports",
    subgenre: "Management",
    description: "Take the dugout. Scout talent, set tactics, negotiate transfers, and lead your club to glory in the most detailed football management game on mobile.",
    modes: "Single Player",
    packageId: "com.netflix.NGP.FootballManager2024Mobile",
    icon: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=800&q=80",
    accentColor: "#22d3ee",
    rating: "E",
    ageLabel: "3+",
    size: "934 MB",
    newUpdate: true,
    tags: ["Sports", "Management", "Single Player"],
    categories: ["Multiplayer Games", "Sports"],
  },
  {
    id: 6,
    name: "2048",
    genre: "Puzzle",
    subgenre: "Brain Teaser",
    description: "Slide numbered tiles on a grid, combining matching pairs to reach the elusive 2048 tile. Deceptively simple, endlessly addictive.",
    modes: "Single Player",
    packageId: "com.androbaby.original2048",
    url: "https://play2048.co/",
    icon: "https://images.unsplash.com/photo-1611996575749-79a3a250f948?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1611996575749-79a3a250f948?auto=format&fit=crop&w=800&q=80",
    accentColor: "#f59e0b",
    rating: "E",
    ageLabel: "3+",
    size: "24 MB",
    tags: ["Puzzle", "Brain Teaser", "Single Player"],
    categories: ["Classic Games", "Puzzle & Brain"],
  },
  {
    id: 7,
    name: "Chess.com",
    genre: "Strategy",
    subgenre: "Board Game",
    description: "Play, learn and improve your chess skills. Challenge 100M+ players worldwide or train with the AI engine at any difficulty level.",
    modes: "Multiplayer",
    packageId: "com.chess",
    url: "https://www.chess.com/play/computer",
    icon: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?auto=format&fit=crop&w=800&q=80",
    accentColor: "#a3a3a3",
    rating: "E",
    ageLabel: "3+",
    size: "64 MB",
    tags: ["Strategy", "Board Game", "Multiplayer"],
    categories: ["Classic Games", "Multiplayer Games", "Strategy Games"],
  },
  {
    id: 8,
    name: "Minesweeper",
    genre: "Puzzle",
    subgenre: "Classic",
    description: "Clear the minefield without detonating a single mine using logic, deduction, and a little luck. The timeless classic, remade.",
    modes: "Single Player",
    packageId: "com.microsoft.minesweeper",
    url: "https://minesweeperonline.com/",
    icon: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=800&q=80",
    accentColor: "#7c3aed",
    rating: "E",
    ageLabel: "3+",
    size: "82 MB",
    tags: ["Puzzle", "Classic", "Single Player"],
    categories: ["Classic Games", "Puzzle & Brain", "Strategy Games"],
  },
  {
    id: 9,
    name: "World of Peppa Pig",
    genre: "Kids",
    subgenre: "Minigames",
    description: "Play, learn and create with Peppa, your favourite clever and curious pig. Explore endless games, activities and puzzles and watch full episodes.",
    modes: "Single Player",
    packageId: "com.entertainmentonemobile.peppapigparty",
    icon: "https://images.unsplash.com/photo-1544207240-6a0c9c3c0e5e?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1544207240-6a0c9c3c0e5e?auto=format&fit=crop&w=800&q=80",
    accentColor: "#f472b6",
    rating: "3+",
    ageLabel: "3+",
    size: "412 MB",
    top10: true,
    top10Rank: 7,
    tags: ["Kids", "Minigames", "Single Player"],
    categories: ["Play & Learn: Games for Kids", "Games Based on Movies & Shows"],
  },
  {
    id: 10,
    name: "PAW Patrol Academy",
    genre: "Kids",
    subgenre: "Minigames",
    description: "Join the pups of Adventure Bay in fun rescue-themed minigames that teach counting, colors, and teamwork — built for curious little explorers.",
    modes: "Single Player",
    packageId: "com.pawpatrol.rescueworld",
    icon: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=800&q=80",
    accentColor: "#38bdf8",
    rating: "3+",
    ageLabel: "3+",
    size: "298 MB",
    tags: ["Kids", "Minigames", "Educational"],
    categories: ["Play & Learn: Games for Kids"],
  },
  {
    id: 11,
    name: "LEGO DUPLO World",
    genre: "Kids",
    subgenre: "Minigames",
    description: "A collection of playful early-learning activities with LEGO DUPLO bricks and characters — perfect for the youngest S Movie Original members.",
    modes: "Single Player",
    packageId: "com.lego.duplo.world",
    icon: "https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=800&q=80",
    accentColor: "#facc15",
    rating: "3+",
    ageLabel: "3+",
    size: "356 MB",
    tags: ["Kids", "Minigames", "Building"],
    categories: ["Play & Learn: Games for Kids"],
  },
  {
    id: 12,
    name: "Toca Boca Hair Salon 4",
    genre: "Kids",
    subgenre: "Dress Up",
    description: "Snip, style, and color your way through a colorful hair salon — a playful, open-ended dress-up experience with no rules and no losing.",
    modes: "Single Player",
    packageId: "com.tocaboca.tocahairsalon4",
    icon: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=800&q=80",
    accentColor: "#fb923c",
    rating: "3+",
    ageLabel: "3+",
    size: "187 MB",
    top10: true,
    top10Rank: 3,
    tags: ["Kids", "Dress Up", "Creative"],
    categories: ["Play & Learn: Games for Kids"],
  },
  {
    id: 13,
    name: "Red Dead Redemption",
    genre: "Action",
    subgenre: "Open World",
    description: "Rockstar's acclaimed western epic, reborn on mobile. Ride the frontier, take on bounties, and live the outlaw life of John Marston.",
    modes: "Single Player",
    packageId: "com.rockstargames.reddeadredemption",
    icon: "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=800&q=80",
    accentColor: "#b45309",
    rating: "M",
    ageLabel: "18+",
    size: "3.6 GB",
    top10: true,
    top10Rank: 5,
    tags: ["Action", "Open World", "Single Player"],
    categories: ["Mobile Games", "Action & Adventure"],
  },
  {
    id: 14,
    name: "Farming Simulator 23",
    genre: "Simulation",
    subgenre: "Farming",
    description: "Build and run your own farm — plant, harvest, raise livestock, and grow a agricultural empire from the ground up.",
    modes: "Single Player",
    packageId: "com.giants.farmingsimulator23mobile",
    icon: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=800&q=80",
    accentColor: "#84cc16",
    rating: "E",
    ageLabel: "3+",
    size: "1.2 GB",
    tags: ["Simulation", "Farming", "Single Player"],
    categories: ["Mobile Games"],
  },
  {
    id: 15,
    name: "Street Fighter IV CE",
    genre: "Action",
    subgenre: "Fighting",
    description: "Capcom's legendary fighting series comes to mobile with tight touch controls, a deep roster, and championship-level combos.",
    modes: "Multiplayer",
    packageId: "com.capcom.sf4ce",
    icon: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80",
    accentColor: "#dc2626",
    rating: "T",
    ageLabel: "13+",
    size: "1.8 GB",
    tags: ["Fighting", "Action", "Multiplayer"],
    categories: ["Mobile Games", "Action & Adventure"],
  },
  {
    id: 16,
    name: "Football Manager 26 Mobile",
    genre: "Sports",
    subgenre: "Management",
    description: "The definitive football management sim, tuned for mobile — scout the world, set your tactics, and chase silverware season after season.",
    modes: "Single Player",
    packageId: "com.sega.fm26mobile",
    icon: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80",
    accentColor: "#0ea5e9",
    rating: "E",
    ageLabel: "3+",
    size: "1.1 GB",
    top10: true,
    top10Rank: 26,
    tags: ["Sports", "Management", "Strategy"],
    categories: ["Strategy Games", "Sports"],
  },
  {
    id: 17,
    name: "Bloons TD 6",
    genre: "Strategy",
    subgenre: "Tower Defense",
    description: "Pop every last bloon in this smash-hit tower defense game — tons of towers, heroes, and challenges to master.",
    modes: "Single Player",
    packageId: "com.ninjakiwi.bloonstd6",
    icon: "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?auto=format&fit=crop&w=400&h=400&q=80",
    hero: "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?auto=format&fit=crop&w=800&q=80",
    accentColor: "#22c55e",
    rating: "E10+",
    ageLabel: "10+",
    size: "687 MB",
    newUpdate: true,
    tags: ["Strategy", "Tower Defense", "Single Player"],
    categories: ["Strategy Games"],
  },
].filter((g) => !isBanned(g.id));

// ─── Category sections — order matters, mirrors the Netflix Games tab ──────────
const CATEGORIES = [
  "Games Based on Movies & Shows",
  "Play & Learn: Games for Kids",
  "Mobile Games",
  "Multiplayer Games",
  "Action & Adventure",
  "Strategy Games",
  "Sports",
  "Classic Games",
  "Puzzle & Brain",
];

// ─── Featured banner pick — highest-ranked TOP 10 item flagged `featured` ──────
const FEATURED_GAME: Game | undefined =
  GAMES.find((g) => g.featured) ?? GAMES.find((g) => g.top10) ?? GAMES[0];

// ─── Filter pills ──────────────────────────────────────────────────────────────
const FILTER_GENRES = ["All", "Action", "Racing", "Sports", "Puzzle", "Strategy", "Arcade"];

// ─── Featured Banner — Netflix Games tab hero ──────────────────────────────────
const BANNER_H = Math.round(SCREEN_W * 0.98);

function FeaturedBanner({ game, onPress }: { game: Game; onPress: (g: Game) => void }) {
  return (
    <Pressable onPress={() => onPress(game)} style={({ pressed }) => [fb.wrap, pressed && { opacity: 0.92 }]}>
      <Image source={{ uri: game.hero }} style={fb.bg} resizeMode="cover" />
      <LinearGradient colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.55)", "#000"]} style={fb.grad} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} />

      {/* Centered app icon with TOP 10 + New Update badges */}
      <View style={fb.iconWrap}>
        <Image source={{ uri: game.icon }} style={fb.icon} resizeMode="cover" />
        {game.top10 && (
          <View style={fb.top10}>
            <Text style={fb.top10Line1}>TOP</Text>
            <Text style={fb.top10Line2}>{game.top10Rank ?? 10}</Text>
          </View>
        )}
        {game.newUpdate && (
          <View style={fb.newBadge}>
            <Text style={fb.newBadgeText}>New Update</Text>
          </View>
        )}
      </View>

      {/* Clean title + tagline */}
      <Text style={fb.title} numberOfLines={1}>{game.name}</Text>
      {game.tags && game.tags.length > 0 && (
        <Text style={fb.tagline} numberOfLines={1}>{game.tags.join(" · ")}</Text>
      )}
    </Pressable>
  );
}

const fb = StyleSheet.create({
  wrap: { width: "100%", height: BANNER_H, position: "relative", justifyContent: "flex-end", alignItems: "center", paddingBottom: 22 },
  bg: { ...StyleSheet.absoluteFill as object },
  grad: { ...StyleSheet.absoluteFill },
  iconWrap: { width: 96, height: 96, borderRadius: 20, overflow: "hidden", backgroundColor: "#111", borderWidth: 2, borderColor: "rgba(255,255,255,0.12)", marginBottom: 14, position: "relative" },
  icon: { width: "100%", height: "100%" },
  top10: { position: "absolute", top: -6, left: -6, width: 34, height: 34, borderRadius: 17, backgroundColor: "#E50914", alignItems: "center", justifyContent: "center" },
  top10Line1: { color: "#fff", fontSize: 7, fontFamily: "Inter_700Bold", lineHeight: 9 },
  top10Line2: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", lineHeight: 11 },
  newBadge: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#E50914", paddingVertical: 3, alignItems: "center" },
  newBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  title: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3, textAlign: "center", paddingHorizontal: 24 },
  tagline: { color: "#ccc", fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 6, textAlign: "center", paddingHorizontal: 24 },
});

// ─── Square Game Tile ─────────────────────────────────────────────────────────
const TILE_W = Math.round((SCREEN_W - 16 * 2 - 12 * 2) / 3.4);

function GameTile({ game, onPress }: { game: Game; onPress: (g: Game) => void }) {
  return (
    <Pressable
      onPress={() => onPress(game)}
      style={({ pressed }) => [tl.wrap, pressed && { opacity: 0.78 }]}
    >
      <View style={tl.iconBox}>
        <Image source={{ uri: game.icon }} style={tl.icon} resizeMode="cover" />
        {/* TOP 10 badge */}
        {game.top10 && (
          <View style={tl.top10}>
            <Text style={tl.top10Line1}>TOP</Text>
            <Text style={tl.top10Line2}>10</Text>
          </View>
        )}
        {/* New Update badge */}
        {game.newUpdate && (
          <View style={tl.newBadge}>
            <Text style={tl.newBadgeText}>New Update</Text>
          </View>
        )}
      </View>
      <Text style={tl.name} numberOfLines={2}>{game.name}</Text>
      <Text style={tl.genre} numberOfLines={1}>{game.subgenre ?? game.genre}</Text>
    </Pressable>
  );
}

const tl = StyleSheet.create({
  wrap: { width: TILE_W, marginRight: 0 },
  iconBox: {
    width: TILE_W,
    height: TILE_W,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    position: "relative",
  },
  icon: { width: "100%", height: "100%" },
  top10: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
  },
  top10Line1: { color: "#fff", fontSize: 6, fontFamily: "Inter_700Bold", lineHeight: 8 },
  top10Line2: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", lineHeight: 9 },
  newBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#E50914",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
  },
  newBadgeText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold" },
  name: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: 7,
    lineHeight: 16,
  },
  genre: {
    color: "#888",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});

// ─── Category Row ──────────────────────────────────────────────────────────────
function CategoryRow({ title, games, onPress }: { title: string; games: Game[]; onPress: (g: Game) => void }) {
  if (games.length === 0) return null;
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {games.map((g) => <GameTile key={g.id} game={g} onPress={onPress} />)}
      </ScrollView>
    </View>
  );
}

// ─── Game Detail Sheet — Netflix style ────────────────────────────────────────
function GameDetailSheet({ game, visible, onClose, onGetGame, onPlayNative }: {
  game: Game | null; visible: boolean; onClose: () => void;
  onGetGame: (g: Game) => void; onPlayNative: (g: Game) => void;
}) {
  const insets = useSafeAreaInsets();
  const [myList, setMyList] = useState(false);
  if (!game) return null;

  const hasStore = !!game.packageId;
  const isNative = !!game.native;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent hardwareAccelerated>
      <View style={ds.root}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* Hero image */}
        <View style={ds.heroWrap}>
          <Image source={{ uri: game.hero }} style={ds.hero} resizeMode="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.2)", "rgba(0,0,0,0.7)", "#000"]} style={ds.heroGrad} start={{ x:0, y:0.3 }} end={{ x:0, y:1 }} />
          {/* Back */}
          <Pressable onPress={onClose} hitSlop={14} style={[ds.backBtn, { top: insets.top > 0 ? insets.top + 4 : 18 }]}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          {/* Square icon centered at bottom */}
          <View style={ds.iconWrap}>
            <Image source={{ uri: game.icon }} style={ds.iconImg} resizeMode="cover" />
          </View>
        </View>

        <ScrollView style={ds.scroll} contentContainerStyle={[ds.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <Text style={ds.title}>{game.name}</Text>

          {/* Genre + age rating row */}
          <View style={ds.metaRow}>
            <Text style={ds.metaGenre}>{game.genre}</Text>
            {game.ageLabel && (
              <View style={ds.ratingBox}>
                <Text style={ds.ratingBoxLabel}>IARC</Text>
                <Text style={ds.ratingBoxVal}>{game.ageLabel}</Text>
              </View>
            )}
            {game.ageLabel && <Text style={ds.metaAge}>{game.ageLabel}</Text>}
          </View>

          {/* Category tag chips */}
          {game.tags && game.tags.length > 0 && (
            <Text style={ds.tagline} numberOfLines={2}>
              {game.tags.join("  ·  ")}
            </Text>
          )}

          {/* Get Game / Play Now */}
          {isNative ? (
            <Pressable onPress={() => { onClose(); setTimeout(() => onPlayNative(game), 300); }} style={({ pressed }) => [ds.getBtn, pressed && { opacity: 0.88 }]}>
              <Ionicons name="play" size={18} color="#000" style={{ marginRight: 8 }} />
              <Text style={ds.getBtnText}>Play Now</Text>
            </Pressable>
          ) : hasStore ? (
            <Pressable onPress={() => onGetGame(game)} style={({ pressed }) => [ds.getBtn, pressed && { opacity: 0.88 }]}>
              <MaterialIcons name="get-app" size={20} color="#000" style={{ marginRight: 8 }} />
              <Text style={ds.getBtnText}>Get Game</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => { onClose(); if (Platform.OS === "web" && game.url && typeof window !== "undefined") window.open(game.url, "_blank"); }} style={({ pressed }) => [ds.getBtn, pressed && { opacity: 0.88 }]}>
              <Feather name="globe" size={18} color="#000" style={{ marginRight: 8 }} />
              <Text style={ds.getBtnText}>Play in Browser</Text>
            </Pressable>
          )}

          {/* Secondary row: My List + Rate + Share */}
          <View style={ds.secondaryRow}>
            <Pressable onPress={() => setMyList((v) => !v)} style={({ pressed }) => [ds.secondaryBtn, pressed && { opacity: 0.7 }]}>
              <Ionicons name={myList ? "checkmark" : "add"} size={18} color="#fff" />
              <Text style={ds.secondaryBtnText}>My List</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [ds.secondaryBtn, pressed && { opacity: 0.7 }]}>
              <Ionicons name="thumbs-up-outline" size={18} color="#fff" />
              <Text style={ds.secondaryBtnText}>Rate</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [ds.secondaryBtn, pressed && { opacity: 0.7 }]}>
              <Feather name="share-2" size={17} color="#fff" />
            </Pressable>
          </View>

          {/* Ranking chip */}
          {game.top10 && (
            <View style={ds.rankChip}>
              <View style={ds.rankBadge}>
                <Text style={ds.rankBadgeLine1}>TOP</Text>
                <Text style={ds.rankBadgeLine2}>10</Text>
              </View>
              <Text style={ds.rankText}>
                #{game.top10Rank ?? "—"} in {game.categories[0]}
              </Text>
            </View>
          )}

          {/* Description */}
          <Text style={ds.desc}>{game.description}</Text>
          {game.modes && <Text style={ds.modes}>Modes: {game.modes}</Text>}
          {game.size  && <Text style={ds.modes}>Size: {game.size}</Text>}

          {/* Screenshots strip */}
          {game.screenshots && game.screenshots.length > 0 && (
            <View style={ds.shotsSection}>
              <Text style={ds.shotsLabel}>Screenshots</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {game.screenshots.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={ds.shotImg} resizeMode="cover" />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Inclusion note */}
          <Text style={ds.inclusive}>Included free with your S Movie Original membership</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const ds = StyleSheet.create({
  root: { flex:1, backgroundColor:"#000" },
  heroWrap: { position:"relative", width:"100%", height: 220 },
  hero: { width:"100%", height:"100%" },
  heroGrad: { ...StyleSheet.absoluteFill },
  backBtn: { position:"absolute", left:14, width:36, height:36, borderRadius:18, backgroundColor:"rgba(0,0,0,0.55)", alignItems:"center", justifyContent:"center" },
  iconWrap: { position:"absolute", bottom: -36, alignSelf:"center", width:80, height:80, borderRadius:16, overflow:"hidden", borderWidth:2, borderColor:"#1a1a1a", backgroundColor:"#111" },
  iconImg: { width:"100%", height:"100%" },
  scroll: { flex:1, marginTop:44 },
  content: { paddingHorizontal:20, paddingTop:10 },
  title: { color:"#fff", fontSize:24, fontFamily:"Inter_700Bold", letterSpacing:-0.3, textAlign:"center", marginBottom:8 },
  metaRow: { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:10, marginBottom:18 },
  metaGenre: { color:"#999", fontSize:13, fontFamily:"Inter_400Regular" },
  metaAge: { color:"#999", fontSize:13, fontFamily:"Inter_400Regular" },
  ratingBox: { borderWidth:1, borderColor:"#666", borderRadius:3, paddingHorizontal:6, paddingVertical:2, alignItems:"center" },
  ratingBoxLabel: { color:"#888", fontSize:7, fontFamily:"Inter_700Bold", letterSpacing:0.5 },
  ratingBoxVal: { color:"#ccc", fontSize:12, fontFamily:"Inter_700Bold" },
  tagline: { color:"#999", fontSize:12, fontFamily:"Inter_500Medium", textAlign:"center", marginBottom:16, paddingHorizontal:8 },
  getBtn: { flexDirection:"row", alignItems:"center", justifyContent:"center", backgroundColor:"#fff", borderRadius:6, paddingVertical:14, marginBottom:10 },
  getBtnText: { color:"#000", fontSize:16, fontFamily:"Inter_700Bold" },
  secondaryRow: { flexDirection:"row", gap:8, marginBottom:20 },
  secondaryBtn: { flex:1, flexDirection:"column", alignItems:"center", justifyContent:"center", backgroundColor:"#1a1a1a", borderRadius:6, paddingVertical:12, gap:4, borderWidth:1, borderColor:"#2a2a2a" },
  secondaryBtnText: { color:"#fff", fontSize:11, fontFamily:"Inter_500Medium" },
  rankChip: { flexDirection:"row", alignItems:"center", gap:10, marginBottom:16 },
  rankBadge: { width:30, height:30, borderRadius:15, backgroundColor:"#E50914", alignItems:"center", justifyContent:"center" },
  rankBadgeLine1: { color:"#fff", fontSize:6, fontFamily:"Inter_700Bold", lineHeight:8 },
  rankBadgeLine2: { color:"#fff", fontSize:10, fontFamily:"Inter_700Bold", lineHeight:10 },
  rankText: { color:"#ccc", fontSize:13, fontFamily:"Inter_600SemiBold" },
  desc: { color:"#ccc", fontSize:14, fontFamily:"Inter_400Regular", lineHeight:21, marginBottom:12 },
  modes: { color:"#888", fontSize:13, fontFamily:"Inter_400Regular", marginBottom:4 },
  shotsSection: { marginTop:20 },
  shotsLabel: { color:"#fff", fontSize:14, fontFamily:"Inter_600SemiBold", marginBottom:10 },
  shotImg: { width: 220, height: 124, borderRadius: 8, backgroundColor: "#1a1a1a" },
  inclusive: { color:"#444", fontSize:11, fontFamily:"Inter_400Regular", textAlign:"center", marginTop:20 },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function GamesScreen() {
  const insets = useSafeAreaInsets();
  const topBarH = (insets.top > 0 ? insets.top : 14) + 44;

  const [activeFilter, setActiveFilter] = useState("All");
  const [detailGame, setDetailGame] = useState<Game | null>(null);
  const [showSnake, setShowSnake]   = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const filteredGames = activeFilter === "All"
    ? GAMES
    : GAMES.filter((g) => g.genre.toLowerCase() === activeFilter.toLowerCase() || (g.subgenre ?? "").toLowerCase() === activeFilter.toLowerCase());

  const gamesInCategory = (cat: string) =>
    filteredGames.filter((g) => g.categories.includes(cat));

  const openDetail = (game: Game) => { if (!isBanned(game.id)) setDetailGame(game); };

  // "Get Game" never launches anything in-app — it hands off to the real
  // Google Play Store via a deep link (see `openPlayStore` above), while the
  // detail sheet stays the only screen the user sees before leaving S Movie Original.
  const handleGetGame = (game: Game) => {
    if (!game.packageId) return;
    openPlayStore(game.packageId);
  };

  const handlePlayNative = (game: Game) => {
    if (game.native) setShowSnake(true);
  };

  return (
    <View style={styles.container}>
      {/* Sticky top bar — transparent over the banner, solidifies on scroll */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.stickyHeader,
          {
            height: topBarH,
            paddingTop: insets.top > 0 ? insets.top : 14,
            backgroundColor: scrollY.interpolate({
              inputRange: [0, BANNER_H - topBarH, BANNER_H - topBarH + 40],
              outputRange: ["rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(0,0,0,0.95)"],
              extrapolate: "clamp",
            }),
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.stickyHeaderText,
            {
              opacity: scrollY.interpolate({
                inputRange: [BANNER_H - topBarH, BANNER_H - topBarH + 40],
                outputRange: [0, 1],
                extrapolate: "clamp",
              }),
            },
          ]}
        >
          Games
        </Animated.Text>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
      >
        {/* Featured banner — full-width hero for the top game */}
        {FEATURED_GAME && <FeaturedBanner game={FEATURED_GAME} onPress={openDetail} />}

        {/* Filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTER_GENRES.map((f) => (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.filterPill, activeFilter === f && styles.filterPillActive]}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Category rows */}
        {CATEGORIES.map((cat) => (
          <CategoryRow key={cat} title={cat} games={gamesInCategory(cat)} onPress={openDetail} />
        ))}

        {/* All Games fallback if filter matches nothing in categories */}
        {activeFilter !== "All" && filteredGames.length > 0 && CATEGORIES.every((c) => gamesInCategory(c).length === 0) && (
          <CategoryRow title="Results" games={filteredGames} onPress={openDetail} />
        )}
      </Animated.ScrollView>

      <GameDetailSheet game={detailGame} visible={detailGame !== null} onClose={() => setDetailGame(null)} onGetGame={handleGetGame} onPlayNative={handlePlayNative} />

      <Modal visible={showSnake} animationType="slide" onRequestClose={() => setShowSnake(false)} statusBarTranslucent>
        <SafeAreaView style={{ flex:1, backgroundColor:"#000" }}>
          <SnakeGame onClose={() => setShowSnake(false)} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:"#000" },
  scroll: { flex:1 },
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  stickyHeaderText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  filterRow: { paddingHorizontal:16, paddingTop: 16, paddingBottom:20, gap:8 },
  filterPill: {
    paddingHorizontal:16,
    paddingVertical:7,
    borderRadius:20,
    backgroundColor:"#1a1a1a",
    borderWidth:1,
    borderColor:"#2a2a2a",
  },
  filterPillActive: { backgroundColor:"#fff", borderColor:"#fff" },
  filterText: { color:"#888", fontSize:13, fontFamily:"Inter_600SemiBold" },
  filterTextActive: { color:"#000" },
  sectionTitle: {
    color:"#fff",
    fontSize:18,
    fontFamily:"Inter_700Bold",
    letterSpacing:-0.2,
    marginBottom:12,
    paddingHorizontal:16,
  },
});
