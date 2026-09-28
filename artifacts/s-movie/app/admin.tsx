import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  saveMovieLinks,
  fetchMovieLinks,
  saveEpisodeLink,
  fetchEpisodeLink,
  type MovieLinks,
} from "@/lib/movieLinks";

type Tab = "movie" | "episode";

export default function AdminPanel() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("movie");

  const [tmdbId, setTmdbId] = useState("");
  const [directVideo, setDirectVideo] = useState("");
  const [vegamovies, setVegamovies] = useState("");
  const [fzmovies, setFzmovies] = useState("");
  const [xprime, setXprime] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const [epTmdbId, setEpTmdbId] = useState("");
  const [epSeason, setEpSeason] = useState("");
  const [epEpisode, setEpEpisode] = useState("");
  const [epDirectVideo, setEpDirectVideo] = useState("");
  const [epSaving, setEpSaving] = useState(false);
  const [epLoading, setEpLoading] = useState(false);

  const handleMovieLoad = async () => {
    const id = parseInt(tmdbId.trim(), 10);
    if (isNaN(id) || id <= 0) {
      Alert.alert("Error", "Pehle valid TMDB ID enter karo.");
      return;
    }
    setLoading(true);
    const links = await fetchMovieLinks(id);
    setLoading(false);
    if (links) {
      setDirectVideo(links.directVideo ?? "");
      setVegamovies(links.vegamovies ?? "");
      setFzmovies(links.fzmovies ?? "");
      setXprime(links.xprime ?? "");
      Alert.alert("Loaded ✓", `TMDB ID ${id} ke links load ho gaye.`);
    } else {
      setDirectVideo(""); setVegamovies(""); setFzmovies(""); setXprime("");
      Alert.alert("Not Found", `TMDB ID ${id} ke liye koi links nahi mile.`);
    }
  };

  const handleMovieSave = async () => {
    const id = parseInt(tmdbId.trim(), 10);
    if (isNaN(id) || id <= 0) {
      Alert.alert("Error", "Valid TMDB ID enter karo.");
      return;
    }
    if (!directVideo.trim() && !vegamovies.trim() && !fzmovies.trim() && !xprime.trim()) {
      Alert.alert("Error", "Kam se kam ek link zaroor daalo.");
      return;
    }
    setSaving(true);
    try {
      const links: MovieLinks = {};
      if (directVideo.trim()) links.directVideo = directVideo.trim();
      if (vegamovies.trim()) links.vegamovies = vegamovies.trim();
      if (fzmovies.trim()) links.fzmovies = fzmovies.trim();
      if (xprime.trim()) links.xprime = xprime.trim();
      await saveMovieLinks(id, links);
      Alert.alert("Saved! ✓", `TMDB ID ${id} ke links Firebase mein save ho gaye.`);
    } catch (err: any) {
      Alert.alert("Error", `Save nahi ho paya: ${err?.message ?? "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEpisodeLoad = async () => {
    const id = parseInt(epTmdbId.trim(), 10);
    const s = parseInt(epSeason.trim(), 10);
    const e = parseInt(epEpisode.trim(), 10);
    if (isNaN(id) || isNaN(s) || isNaN(e)) {
      Alert.alert("Error", "TMDB ID, Season aur Episode sahi se daalo.");
      return;
    }
    setEpLoading(true);
    const link = await fetchEpisodeLink(id, s, e);
    setEpLoading(false);
    if (link) {
      setEpDirectVideo(link.directVideo ?? "");
      Alert.alert("Loaded ✓", `S${s}E${e} ka link load ho gaya.`);
    } else {
      setEpDirectVideo("");
      Alert.alert("Not Found", `S${s}E${e} ke liye koi link nahi mila. Naaya link add karo.`);
    }
  };

  const handleEpisodeSave = async () => {
    const id = parseInt(epTmdbId.trim(), 10);
    const s = parseInt(epSeason.trim(), 10);
    const e = parseInt(epEpisode.trim(), 10);
    if (isNaN(id) || isNaN(s) || isNaN(e)) {
      Alert.alert("Error", "TMDB ID, Season aur Episode sahi se daalo.");
      return;
    }
    if (!epDirectVideo.trim()) {
      Alert.alert("Error", "Direct Video URL daalna zaroori hai.");
      return;
    }
    setEpSaving(true);
    try {
      await saveEpisodeLink(id, s, e, epDirectVideo.trim());
      Alert.alert("Saved! ✓", `S${s}E${e} ka link Firebase mein save ho gaya.`);
    } catch (err: any) {
      Alert.alert("Error", `Save nahi ho paya: ${err?.message ?? "Unknown error"}`);
    } finally {
      setEpSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Admin Panel</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.subtitle}>Firebase Realtime Database · Video Links Manager</Text>

        {/* Tab Switcher */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, tab === "movie" && styles.tabBtnActive]}
            onPress={() => setTab("movie")}
          >
            <Ionicons name="film-outline" size={15} color={tab === "movie" ? "#000" : "#888"} />
            <Text style={[styles.tabText, tab === "movie" && styles.tabTextActive]}>Movie</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, tab === "episode" && styles.tabBtnActive]}
            onPress={() => setTab("episode")}
          >
            <Ionicons name="tv-outline" size={15} color={tab === "episode" ? "#000" : "#888"} />
            <Text style={[styles.tabText, tab === "episode" && styles.tabTextActive]}>Web Series Episode</Text>
          </Pressable>
        </View>

        {tab === "movie" ? (
          <>
            {/* TMDB ID */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>TMDB ID</Text>
              <Text style={styles.hint}>Movie ka TMDB ID daalo (e.g. 299536 for Infinity War)</Text>
              <View style={styles.rowInput}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={tmdbId}
                  onChangeText={setTmdbId}
                  placeholder="e.g. 299536"
                  placeholderTextColor="#444"
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
                <Pressable onPress={handleMovieLoad} style={[styles.loadBtn, loading && { opacity: 0.6 }]} disabled={loading}>
                  {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.loadBtnText}>Load</Text>}
                </Pressable>
              </View>
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>🎬 Direct Video URL (Player mein seedha chalega)</Text>

            {/* Direct Video */}
            <View style={styles.fieldGroup}>
              <View style={styles.siteLabelRow}>
                <View style={[styles.siteDot, { backgroundColor: "#E50914" }]} />
                <Text style={styles.label}>Direct Video URL</Text>
                <View style={styles.priorityBadge}><Text style={styles.priorityText}>PRIMARY</Text></View>
              </View>
              <Text style={styles.hint}>Hubdrive/Katdrive/V-Cloud se final .mp4 link — yahi directly player mein chalega</Text>
              <TextInput
                style={[styles.input, styles.inputHighlight]}
                value={directVideo}
                onChangeText={setDirectVideo}
                placeholder="https://....mp4  ya  https://drive.google.com/..."
                placeholderTextColor="#555"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>📥 Download Site Links (Secondary)</Text>

            <View style={styles.fieldGroup}>
              <View style={styles.siteLabelRow}>
                <View style={[styles.siteDot, { backgroundColor: "#22c55e" }]} />
                <Text style={styles.label}>VegaMovies</Text>
              </View>
              <TextInput
                style={styles.input}
                value={vegamovies}
                onChangeText={setVegamovies}
                placeholder="https://vegamovies...."
                placeholderTextColor="#444"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.siteLabelRow}>
                <View style={[styles.siteDot, { backgroundColor: "#3b82f6" }]} />
                <Text style={styles.label}>FZMovies</Text>
              </View>
              <TextInput
                style={styles.input}
                value={fzmovies}
                onChangeText={setFzmovies}
                placeholder="https://fzmovies...."
                placeholderTextColor="#444"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.siteLabelRow}>
                <View style={[styles.siteDot, { backgroundColor: "#f59e0b" }]} />
                <Text style={styles.label}>XPrime</Text>
              </View>
              <TextInput
                style={styles.input}
                value={xprime}
                onChangeText={setXprime}
                placeholder="https://xprime...."
                placeholderTextColor="#444"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Pressable
              onPress={handleMovieSave}
              disabled={saving}
              style={({ pressed }) => [styles.saveBtn, (pressed || saving) && { opacity: 0.8 }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="cloud-upload-outline" size={20} color="#fff" /><Text style={styles.saveBtnText}>Firebase mein Save Karo</Text></>
              }
            </Pressable>

            <Pressable
              onPress={() => { setTmdbId(""); setDirectVideo(""); setVegamovies(""); setFzmovies(""); setXprime(""); }}
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.clearBtnText}>Clear All Fields</Text>
            </Pressable>

            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={18} color="#737373" />
              <Text style={styles.infoText}>
                Firebase path: <Text style={styles.infoCode}>movies/[TMDB_ID]</Text>{"\n"}
                Direct Video URL → player mein seedha play hoga{"\n"}
                Download links → movie page pe chips mein dikhenge
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* Episode Tab */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Series TMDB ID</Text>
              <Text style={styles.hint}>Web series ka TMDB ID daalo (e.g. 1396 for Breaking Bad)</Text>
              <TextInput
                style={styles.input}
                value={epTmdbId}
                onChangeText={setEpTmdbId}
                placeholder="e.g. 1396"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                returnKeyType="next"
              />
            </View>

            <View style={styles.rowInput}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Season</Text>
                <TextInput
                  style={styles.input}
                  value={epSeason}
                  onChangeText={setEpSeason}
                  placeholder="1"
                  placeholderTextColor="#444"
                  keyboardType="number-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Episode</Text>
                <TextInput
                  style={styles.input}
                  value={epEpisode}
                  onChangeText={setEpEpisode}
                  placeholder="1"
                  placeholderTextColor="#444"
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
              <Pressable
                onPress={handleEpisodeLoad}
                style={[styles.loadBtn, { alignSelf: "flex-end", marginBottom: 18 }, epLoading && { opacity: 0.6 }]}
                disabled={epLoading}
              >
                {epLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.loadBtnText}>Load</Text>}
              </Pressable>
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>🎬 Episode ka Direct Video URL</Text>

            <View style={styles.fieldGroup}>
              <View style={styles.siteLabelRow}>
                <View style={[styles.siteDot, { backgroundColor: "#E50914" }]} />
                <Text style={styles.label}>Direct Video URL</Text>
                <View style={styles.priorityBadge}><Text style={styles.priorityText}>PRIMARY</Text></View>
              </View>
              <Text style={styles.hint}>Hubdrive/Katdrive/V-Cloud se final streamable link paste karo</Text>
              <TextInput
                style={[styles.input, styles.inputHighlight]}
                value={epDirectVideo}
                onChangeText={setEpDirectVideo}
                placeholder="https://....mp4  ya  direct stream link"
                placeholderTextColor="#555"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
            </View>

            <Pressable
              onPress={handleEpisodeSave}
              disabled={epSaving}
              style={({ pressed }) => [styles.saveBtn, (pressed || epSaving) && { opacity: 0.8 }]}
            >
              {epSaving
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="cloud-upload-outline" size={20} color="#fff" /><Text style={styles.saveBtnText}>Episode Link Save Karo</Text></>
              }
            </Pressable>

            <Pressable
              onPress={() => { setEpTmdbId(""); setEpSeason(""); setEpEpisode(""); setEpDirectVideo(""); }}
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.clearBtnText}>Clear All Fields</Text>
            </Pressable>

            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={18} color="#737373" />
              <Text style={styles.infoText}>
                Firebase path: <Text style={styles.infoCode}>episodes/[TMDB_ID]/S1E2</Text>{"\n"}
                Ek baar link save karo, fir app mein episode click karte hi{"\n"}
                seedha woh video play hoga — koi embed nahi.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
    borderRadius: 20, backgroundColor: "#1a1a1a",
  },
  headerTitle: {
    fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: "#555",
    textAlign: "center", marginBottom: 20,
  },
  tabRow: {
    flexDirection: "row", gap: 10, marginBottom: 24,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 10,
    backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a",
  },
  tabBtnActive: {
    backgroundColor: "#E50914", borderColor: "#E50914",
  },
  tabText: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#888",
  },
  tabTextActive: {
    color: "#fff",
  },
  fieldGroup: { marginBottom: 18 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#d4d4d4", marginBottom: 4 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#555", marginBottom: 8 },
  rowInput: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    backgroundColor: "#1a1a1a", borderRadius: 10,
    borderWidth: 1, borderColor: "#2a2a2a",
    color: "#fff", fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 14, paddingVertical: 13,
  },
  inputHighlight: {
    borderColor: "#E50914", minHeight: 54,
  },
  loadBtn: {
    backgroundColor: "#2a2a2a", borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 13,
    alignItems: "center", justifyContent: "center", minWidth: 70,
  },
  loadBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1, backgroundColor: "#1f1f1f", marginVertical: 20 },
  sectionTitle: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#888",
    marginBottom: 14,
  },
  siteLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  siteDot: { width: 8, height: 8, borderRadius: 4 },
  priorityBadge: {
    backgroundColor: "#E50914", borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  priorityText: {
    color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5,
  },
  saveBtn: {
    backgroundColor: "#E50914", borderRadius: 12,
    paddingVertical: 15, flexDirection: "row",
    alignItems: "center", justifyContent: "center",
    gap: 10, marginTop: 10, marginBottom: 12,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  clearBtn: {
    borderRadius: 12, paddingVertical: 13,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#1a1a1a", marginBottom: 24,
  },
  clearBtnText: { color: "#555", fontSize: 14, fontFamily: "Inter_500Medium" },
  infoCard: {
    backgroundColor: "#111", borderRadius: 12, borderWidth: 1, borderColor: "#222",
    padding: 16, flexDirection: "row", gap: 10, alignItems: "flex-start",
  },
  infoText: {
    color: "#555", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 20, flex: 1,
  },
  infoCode: { color: "#737373", fontFamily: "Inter_500Medium" },
});
