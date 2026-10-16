import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from "react-native";

const { width: W, height: H } = Dimensions.get("window");

export default function LoadingScreen() {
  // Keep the branded artwork visible from the first frame. Starting at zero
  // made the splash look like a blank black screen in fast Expo/web launches.
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const logoScale  = useRef(new Animated.Value(0.96)).current;
  const barWidth   = useRef(new Animated.Value(0)).current;
  const barOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(barOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(barWidth, {
          toValue: W * 0.52,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.logoWrap,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <Image
          source={require("@/assets/images/splash.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      <Animated.View style={[styles.barTrack, { opacity: barOpacity }]}>
        <Animated.View style={[styles.barFill, { width: barWidth }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    width: W * 0.72,
    height: W * 0.72,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  barTrack: {
    width: W * 0.52,
    height: 3,
    backgroundColor: "#222",
    borderRadius: 2,
    overflow: "hidden",
    position: "absolute",
    bottom: "10%",
  },
  barFill: {
    height: 3,
    backgroundColor: "#E50914",
    borderRadius: 2,
  },
});
