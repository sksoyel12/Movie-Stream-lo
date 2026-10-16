import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  sourceUrl: string;
  size: string;
  date: string;
  uploader: string;
}

const { height: SCREEN_H } = Dimensions.get("window");

export default function ResourceDetailsModal({
  visible,
  onClose,
  title,
  sourceUrl,
  size,
  date,
  uploader,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={24} color="#737373" />
            </Pressable>
          </View>

          <View style={styles.content}>
            <Text style={styles.urlText} numberOfLines={2}>
              {sourceUrl}
            </Text>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Source : </Text>
              <Text style={styles.valueBlue}>{uploader} etc.</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Size : </Text>
              <Text style={styles.value}>{size}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Date : </Text>
              <Text style={styles.value}>{date}</Text>
            </View>

            <Text style={styles.footerText}>
              The Source is uploaded by {uploader} etc.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  container: {
    backgroundColor: "#1c1c1e",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 40,
    maxHeight: SCREEN_H * 0.5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    flex: 1,
    marginRight: 10,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
  },
  urlText: {
    color: "#a3a3a3",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  label: {
    color: "#a3a3a3",
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  value: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  valueBlue: {
    color: "#0ea5e9",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  footerText: {
    color: "#a3a3a3",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginTop: 20,
  },
});
