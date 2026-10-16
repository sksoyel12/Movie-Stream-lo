import { Feather, Ionicons } from "@expo/vector-icons";
import { firebaseAuth } from "@/lib/firebase";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE } from "@/lib/apiBase";

// Web-only: hidden file input ref type
type WebFileInput = HTMLInputElement | null;

const CHAT_URL = API_BASE ? `${API_BASE}/chat` : null;

const FIREBASE_PROJECT_ID = "movie-original";
const FIREBASE_BUCKET = "movie-original.firebasestorage.app";
const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? "AIzaSyACikplYKRKiUffInNTZRy4Rp3EEHw_b3g";

interface Attachment {
  localUri: string;
  downloadUrl: string;
  type: "image" | "video" | "file";
  name: string;
  mimeType: string;
}

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  attachment?: Attachment;
}

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

async function uploadToStorage(
  uri: string,
  mimeType: string,
  filename: string,
  webFile?: File,
): Promise<string> {
  const userId = firebaseAuth.currentUser?.uid ?? "anonymous";
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `support_attachments/${userId}/${Date.now()}_${safeName}`;
  const encodedPath = encodeURIComponent(storagePath);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_BUCKET}/o?uploadType=media&name=${encodedPath}&key=${FIREBASE_API_KEY}`;

  let authHeader: Record<string, string> = {};
  try {
    const token = await firebaseAuth.currentUser?.getIdToken();
    if (token) authHeader = { Authorization: `Bearer ${token}` };
  } catch {}

  let responseJson: { downloadTokens?: string };

  if (Platform.OS === "web" && webFile) {
    // Web: use fetch with Blob directly
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": mimeType, ...authHeader },
      body: webFile,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    responseJson = await res.json() as { downloadTokens?: string };
  } else {
    // Native: use expo-file-system
    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": mimeType, ...authHeader },
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Upload failed: ${result.status}`);
    }
    responseJson = JSON.parse(result.body) as { downloadTokens?: string };
  }

  const dlToken = responseJson.downloadTokens ?? "";
  return `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_BUCKET}/o/${encodedPath}?alt=media${dlToken ? `&token=${dlToken}` : ""}`;
}

async function saveAttachmentTicket(
  userId: string | null,
  downloadUrl: string,
  fileName: string,
  fileType: string,
): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/support_tickets?key=${FIREBASE_API_KEY}`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        userId: { stringValue: userId ?? "anonymous" },
        message: { stringValue: `Attachment sent: ${fileName}` },
        attachmentUrl: { stringValue: downloadUrl },
        attachmentType: { stringValue: fileType },
        timestamp: { timestampValue: new Date().toISOString() },
        status: { stringValue: "pending" },
      },
    }),
  });
}

const SUPPORT_EMAIL = "wftis.aryux07@gmail.com";
const WHATSAPP_CHANNEL = "https://whatsapp.com/channel/0029VbDWXSE6RGJ9qR1sw83N";
const WHATSAPP_CHAT = "https://api.whatsapp.com/send?phone=917098245847";

const WELCOME: Message = {
  id: "welcome",
  role: "model",
  text: "Namaste! Main S Movie Original Support Bot hoon. Kisi bhi language mein baat kar sakte hain — Hindi, English, Urdu ya koi bhi. App se related koi bhi issue ho toh seedha hamare team se bhi contact kar sakte hain neeche diye links se! 👇",
};

// Web Speech API type shim
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionEvent = { results: { [i: number]: { [j: number]: { transcript: string } }; length: number } };

function createSpeechRecognition(): SpeechRecognitionInstance | null {
  if (Platform.OS !== "web") return null;
  const SpeechRecognitionCtor =
    (window as unknown as Record<string, unknown>).SpeechRecognition as (new () => SpeechRecognitionInstance) | undefined ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition as (new () => SpeechRecognitionInstance) | undefined;
  if (!SpeechRecognitionCtor) return null;
  return new SpeechRecognitionCtor();
}

export default function AIChatbotModal({ visible, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  // Web-only hidden file input
  const webFileInputRef = useRef<WebFileInput>(null);
  // Voice
  const voiceRef = useRef<SpeechRecognitionInstance | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation loop while listening
  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  const stopVoice = useCallback(() => {
    voiceRef.current?.stop();
    voiceRef.current = null;
    setIsListening(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      stopVoice();
      return;
    }

    if (Platform.OS !== "web") {
      Alert.alert(
        "Voice Input",
        "Voice input is available on the web version of the app. Please use the web app to use voice input.",
        [{ text: "OK" }]
      );
      return;
    }

    const recognition = createSpeechRecognition();
    if (!recognition) {
      Alert.alert(
        "Not Supported",
        "Your browser does not support voice input. Please try Chrome or Edge.",
        [{ text: "OK" }]
      );
      return;
    }

    recognition.lang = ""; // auto-detect language
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInputText(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      voiceRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      voiceRef.current = null;
    };

    voiceRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, stopVoice]);

  const prevMsgCountRef = useRef(1);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // Only scroll to bottom when a NEW message is added, not on initial render
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: `user_${Date.now()}`, role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setLoading(true);
    scrollToBottom();

    try {
      if (!CHAT_URL) throw new Error("Chat proxy URL not configured");

      const history: GeminiContent[] = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

      const userId = firebaseAuth.currentUser?.uid ?? null;

      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, message: text, userId }),
      });

      const data = (await res.json()) as {
        reply?: string;
        error?: string;
        ticketSaved?: boolean;
      };

      const reply =
        data.reply ??
        "Sir, abhi response mein thodi dikkat aa rahi hai. Thodi der mein dobara try karein.";

      setMessages((prev) => [
        ...prev,
        { id: `model_${Date.now()}`, role: "model", text: reply },
      ]);
      scrollToBottom();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "model",
          text: "Sir, abhi network mein thodi dikkat aa rahi hai. Thodi der mein dobara try karein, ya apna issue yahan likhen — hum note kar lete hain.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [inputText, loading, messages, scrollToBottom]);

  const handleFileUpload = useCallback(
    async (
      uri: string,
      mimeType: string,
      name: string,
      type: "image" | "video" | "file",
      webFile?: File,
    ) => {
      setUploading(true);
      try {
        const downloadUrl = await uploadToStorage(uri, mimeType, name, webFile);
        const userId = firebaseAuth.currentUser?.uid ?? null;
        await saveAttachmentTicket(userId, downloadUrl, name, type);

        const attachMsg: Message = {
          id: `attach_${Date.now()}`,
          role: "user",
          text: type === "file" ? name : "",
          attachment: { localUri: uri, downloadUrl, type, name, mimeType },
        };
        setMessages((prev) => [...prev, attachMsg]);
        scrollToBottom();

        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: `ack_${Date.now()}`,
              role: "model",
              text: "Sir, aapka attachment receive ho gaya hai. Hamari team jald hi review karegi aur aapko update degi.",
            },
          ]);
          scrollToBottom();
        }, 400);
      } catch {
        Alert.alert(
          "Upload nahi hua",
          "File upload mein problem aayi. Dobara try karein Sir.",
          [{ text: "Theek hai" }],
        );
      } finally {
        setUploading(false);
      }
    },
    [scrollToBottom],
  );

  // Web: handle file selected from hidden <input type="file">
  const handleWebFileSelected = useCallback(
    async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      // Reset so same file can be selected again
      input.value = "";

      const mime = file.type || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      const isVideo = mime.startsWith("video/");
      const type: "image" | "video" | "file" = isImage ? "image" : isVideo ? "video" : "file";
      const objectUrl = URL.createObjectURL(file);

      await handleFileUpload(objectUrl, mime, file.name, type, file);
      URL.revokeObjectURL(objectUrl);
    },
    [handleFileUpload],
  );

  const pickAttachment = useCallback(async () => {
    if (uploading || loading) return;

    if (Platform.OS === "web") {
      // Web: create/reuse hidden file input and trigger click
      if (!webFileInputRef.current) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*,video/*,.pdf,.doc,.docx,.txt";
        input.style.display = "none";
        input.addEventListener("change", handleWebFileSelected);
        document.body.appendChild(input);
        (webFileInputRef as React.MutableRefObject<WebFileInput>).current = input;
      }
      webFileInputRef.current!.click();
      return;
    }

    // Native: use Alert + ImagePicker / DocumentPicker
    Alert.alert(
      "Attachment bhejein",
      "Kya bhejana chahte hain Aap?",
      [
        {
          text: "Photo / Video (Gallery)",
          onPress: async () => {
            const perm =
              await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(
                "Permission chahiye",
                "Gallery access ke liye Settings mein allow karein.",
              );
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images", "videos"],
              quality: 0.85,
              allowsEditing: false,
              videoMaxDuration: 120,
            });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              const isVideo = asset.type === "video";
              const mime = asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg");
              const name =
                asset.fileName ??
                `${isVideo ? "video" : "photo"}_${Date.now()}.${isVideo ? "mp4" : "jpg"}`;
              await handleFileUpload(
                asset.uri,
                mime,
                name,
                isVideo ? "video" : "image",
              );
            }
          },
        },
        {
          text: "Document / PDF / File",
          onPress: async () => {
            const result = await DocumentPicker.getDocumentAsync({
              type: "*/*",
              copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              await handleFileUpload(
                asset.uri,
                asset.mimeType ?? "application/octet-stream",
                asset.name,
                "file",
              );
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  }, [uploading, loading, handleFileUpload, handleWebFileSelected]);

  const handleClose = useCallback(() => {
    stopVoice();
    setMessages([WELCOME]);
    prevMsgCountRef.current = 1;
    setInputText("");
    // Cleanup web file input on close
    if (Platform.OS === "web" && webFileInputRef.current) {
      webFileInputRef.current.remove();
      (webFileInputRef as React.MutableRefObject<WebFileInput>).current = null;
    }
    onClose();
  }, [onClose, stopVoice]);

  const copyMessage = useCallback(async (message: Message) => {
    if (!message.text) return;
    await Clipboard.setStringAsync(message.text);
    setCopiedMessageId(message.id);
    setTimeout(() => {
      setCopiedMessageId((currentId) =>
        currentId === message.id ? null : currentId,
      );
    }, 1600);
  }, []);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    const att = item.attachment;
    const canCopy = !att && Boolean(item.text);
    const isCopied = copiedMessageId === item.id;

    return (
      <View
        style={[
          styles.msgRow,
          isUser ? styles.msgRowUser : styles.msgRowBot,
        ]}
      >
        {!isUser && (
          <View style={styles.botAvatar}>
            <Text style={styles.botAvatarText}>S</Text>
          </View>
        )}
        <View>
          <View
            style={[
              styles.bubble,
              isUser ? styles.bubbleUser : styles.bubbleBot,
              att?.type === "image" && styles.bubbleImageless,
            ]}
          >
            {att ? (
              att.type === "image" ? (
                <Image
                  source={{ uri: att.localUri }}
                  style={styles.attachImage}
                  resizeMode="cover"
                />
              ) : att.type === "video" ? (
                <View style={styles.filePill}>
                  <Ionicons name="videocam" size={20} color="#fff" />
                  <Text
                    style={[styles.bubbleText, styles.bubbleTextUser]}
                    numberOfLines={2}
                  >
                    {att.name}
                  </Text>
                </View>
              ) : (
                <View style={styles.filePill}>
                  <Ionicons
                    name="document-text"
                    size={20}
                    color={isUser ? "#fff" : "#bbb"}
                  />
                  <Text
                    style={[
                      styles.bubbleText,
                      isUser ? styles.bubbleTextUser : styles.bubbleTextBot,
                    ]}
                    numberOfLines={2}
                  >
                    {att.name}
                  </Text>
                </View>
              )
            ) : (
              <Text
                style={[
                  styles.bubbleText,
                  isUser ? styles.bubbleTextUser : styles.bubbleTextBot,
                ]}
              >
                {item.text}
              </Text>
            )}
          </View>
          {canCopy && (
            <Pressable
              accessibilityLabel={isCopied ? "Copied" : "Copy message"}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => copyMessage(item)}
              style={({ pressed }) => [
                styles.copyMessageBtn,
                isUser && styles.copyMessageBtnUser,
                pressed && { opacity: 0.65 },
              ]}
            >
              <Feather
                name={isCopied ? "check" : "copy"}
                size={12}
                color={isCopied ? "#22c55e" : isUser ? "#777" : "#666"}
              />
              <Text
                style={[
                  styles.copyMessageText,
                  isCopied && styles.copyMessageTextCopied,
                ]}
              >
                {isCopied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }, [copiedMessageId, copyMessage]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.overlayBg} onPress={handleClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.sheetWrapper}
        >
          <View style={styles.sheet}>
            <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
              <View style={styles.handle} />

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.headerIcon}>
                    <Text style={styles.headerIconText}>S</Text>
                  </View>
                  <View>
                    <Text style={styles.headerTitle}>Support Bot</Text>
                    <View style={styles.onlineRow}>
                      <View style={styles.onlineDot} />
                      <Text style={styles.onlineText}>Powered by Gemini AI</Text>
                    </View>
                  </View>
                </View>
                <Pressable
                  onPress={handleClose}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.closeBtn,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Feather name="x" size={20} color="#aaa" />
                </Pressable>
              </View>

              {/* Messages */}
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.messageList}
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                ListFooterComponent={
                  <>
                    {(loading || uploading) && (
                      <View style={styles.typingRow}>
                        <View style={styles.botAvatar}>
                          <Text style={styles.botAvatarText}>S</Text>
                        </View>
                        <View style={styles.typingBubble}>
                          <ActivityIndicator size="small" color="#E50914" />
                          <Text style={styles.typingText}>
                            {uploading ? "Uploading…" : "Typing…"}
                          </Text>
                        </View>
                      </View>
                    )}
                    {messages.length === 1 && (
                      <View style={styles.categoriesBlock}>

                        {/* ── Contact Us Cards ─────────────────────── */}
                        <Text style={styles.categoriesTitle}>Seedha Contact Karein:</Text>
                        <View style={styles.contactGrid}>

                          {/* Email */}
                          <Pressable
                            style={({ pressed }) => [styles.contactCard, pressed && { opacity: 0.75 }]}
                            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=S Movie Original App Issue`)}
                          >
                            <Text style={styles.contactIcon}>📧</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.contactLabel}>Email Support</Text>
                              <Text style={styles.contactSub} numberOfLines={1}>{SUPPORT_EMAIL}</Text>
                            </View>
                            <Feather name="external-link" size={14} color="#555" />
                          </Pressable>

                          {/* WhatsApp Channel */}
                          <Pressable
                            style={({ pressed }) => [styles.contactCard, styles.contactCardWa, pressed && { opacity: 0.75 }]}
                            onPress={() => Linking.openURL(WHATSAPP_CHANNEL)}
                          >
                            <Text style={styles.contactIcon}>📢</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.contactLabel}>WhatsApp Channel</Text>
                              <Text style={styles.contactSub}>Updates & News</Text>
                            </View>
                            <Feather name="external-link" size={14} color="#555" />
                          </Pressable>

                          {/* WhatsApp Chat */}
                          <Pressable
                            style={({ pressed }) => [styles.contactCard, styles.contactCardWa, pressed && { opacity: 0.75 }]}
                            onPress={() => Linking.openURL(WHATSAPP_CHAT)}
                          >
                            <Text style={styles.contactIcon}>💬</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.contactLabel}>WhatsApp Chat</Text>
                              <Text style={styles.contactSub}>Direct support (chat only)</Text>
                            </View>
                            <Feather name="external-link" size={14} color="#555" />
                          </Pressable>

                          {/* Send Issue via Email */}
                          <Pressable
                            style={({ pressed }) => [styles.contactCard, styles.contactCardEmail, pressed && { opacity: 0.75 }]}
                            onPress={() => {
                              const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
                              const body = lastUserMsg
                                ? encodeURIComponent(`Mera issue:\n\n${lastUserMsg.text}\n\n---\nSent from S Movie Original App`)
                                : encodeURIComponent("S Movie Original App se issue report kar raha hoon.");
                              Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=S Movie Original Issue Report&body=${body}`);
                            }}
                          >
                            <Text style={styles.contactIcon}>🚀</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.contactLabel, { color: "#E50914" }]}>Issue Email Pe Bhejo</Text>
                              <Text style={styles.contactSub}>Apna issue directly team ko bhejo</Text>
                            </View>
                            <Feather name="send" size={14} color="#E50914" />
                          </Pressable>
                        </View>

                        {/* ── Topic Categories ─────────────────────── */}
                        <Text style={[styles.categoriesTitle, { marginTop: 20 }]}>Ya Bot Se Poochho:</Text>
                        <View style={styles.categoriesGrid}>
                          {[
                            { icon: "🎬", label: "Movies & Shows" },
                            { icon: "🔬", label: "Science" },
                            { icon: "📖", label: "History" },
                            { icon: "🏏", label: "Sports" },
                            { icon: "💻", label: "Technology" },
                            { icon: "🌍", label: "Geography" },
                            { icon: "💊", label: "Health" },
                            { icon: "🧮", label: "Mathematics" },
                            { icon: "🚀", label: "Space" },
                            { icon: "🍕", label: "Food & Travel" },
                            { icon: "💰", label: "Finance" },
                            { icon: "🎵", label: "Music" },
                            { icon: "📰", label: "News" },
                            { icon: "🤖", label: "AI & Coding" },
                            { icon: "⚖️", label: "Law" },
                            { icon: "🌐", label: "Languages" },
                            { icon: "📲", label: "App Support" },
                            { icon: "🧠", label: "General Knowledge" },
                          ].map((item) => (
                            <Pressable
                              key={item.label}
                              style={({ pressed }) => [styles.categoryChip, pressed && { opacity: 0.7 }]}
                              onPress={() => setInputText(item.label + " ke baare mein batao")}
                            >
                              <Text style={styles.categoryChipIcon}>{item.icon}</Text>
                              <Text style={styles.categoryChipText}>{item.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                }
              />

              {/* Input bar */}
              <View style={styles.inputBar}>
                {/* Attachment button */}
                <Pressable
                  onPress={pickAttachment}
                  disabled={uploading || loading}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.attachBtn,
                    (uploading || loading) && { opacity: 0.4 },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#888" />
                  ) : (
                    <Ionicons name="add" size={22} color="#888" />
                  )}
                </Pressable>

                <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Ask me anything…"
                  placeholderTextColor="#555"
                  multiline
                  maxLength={500}
                  returnKeyType="send"
                  blurOnSubmit={false}
                  onSubmitEditing={sendMessage}
                />

                {inputText.trim() || loading ? (
                  <Pressable
                    onPress={sendMessage}
                    disabled={loading || uploading || !inputText.trim()}
                    style={({ pressed }) => [
                      styles.sendBtn,
                      (!inputText.trim() || loading || uploading) &&
                        styles.sendBtnDisabled,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="send" size={18} color="#fff" />
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={toggleVoice}
                    disabled={uploading}
                    style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                  >
                    <Animated.View
                      style={[
                        styles.micBtn,
                        isListening && styles.micBtnActive,
                        { transform: [{ scale: pulseAnim }] },
                      ]}
                    >
                      <Ionicons
                        name={isListening ? "stop" : "mic"}
                        size={20}
                        color="#fff"
                      />
                    </Animated.View>
                  </Pressable>
                )}
              </View>
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  overlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  sheetWrapper: { justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0d0d0d",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "#1e1e1e",
    maxHeight: "88%",
    minHeight: 420,
  },
  safeArea: { flex: 1 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#2a2a2a",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1e1e1e",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e",
  },
  onlineText: {
    color: "#525252",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  closeBtn: { padding: 6 },

  messageList: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 8,
  },
  msgRow: { flexDirection: "row", marginBottom: 12, maxWidth: "85%" },
  msgRowUser: { alignSelf: "flex-end", justifyContent: "flex-end" },
  msgRowBot: { alignSelf: "flex-start", gap: 8 },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    flexShrink: 0,
  },
  botAvatarText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 9,
    maxWidth: "100%",
  },
  bubbleImageless: { padding: 0, overflow: "hidden" },
  bubbleUser: { backgroundColor: "#E50914", borderBottomRightRadius: 4 },
  bubbleBot: {
    backgroundColor: "#1a1a1a",
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextUser: { color: "#fff", fontFamily: "Inter_400Regular" },
  bubbleTextBot: { color: "#e5e5e5", fontFamily: "Inter_400Regular" },
  copyMessageBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginTop: 2,
  },
  copyMessageBtnUser: { alignSelf: "flex-end" },
  copyMessageText: {
    color: "#666",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  copyMessageTextCopied: { color: "#22c55e" },

  attachImage: { width: 200, height: 160, borderRadius: 14 },
  filePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 220,
    flexShrink: 1,
  },

  typingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  typingText: { color: "#555", fontSize: 13, fontFamily: "Inter_400Regular" },

  categoriesBlock: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  categoriesTitle: {
    color: "#555",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  contactGrid: {
    gap: 8,
    marginBottom: 4,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#141414",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  contactCardWa: {
    borderColor: "#1e3a1e",
    backgroundColor: "#0d1f0d",
  },
  contactCardEmail: {
    borderColor: "#3a1212",
    backgroundColor: "#1a0a0a",
  },
  contactIcon: { fontSize: 20 },
  contactLabel: {
    color: "#e5e5e5",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  contactSub: {
    color: "#555",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },

  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1a1a1a",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2e2e2e",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  categoryChipIcon: { fontSize: 13 },
  categoryChipText: { color: "#aaa", fontSize: 12, fontFamily: "Inter_500Medium" },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1e1e1e",
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1a1a1a",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2e2e2e",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginBottom: 1,
  },
  input: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
    lineHeight: 20,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: "#2a2a2a" },
  micBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1a1a1a",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3a3a3a",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  micBtnActive: {
    backgroundColor: "#E50914",
    borderColor: "#E50914",
  },
});
