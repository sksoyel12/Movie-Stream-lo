import {
  CloudDownload,
  Flame,
  House,
  Search,
  UserRound,
} from "lucide-react-native";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from "react-native";

import { useDownloads } from "@/contexts/DownloadContext";

function NetflixTabIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  return <View style={tabIconStyles.wrap}>{children}</View>;
}

function HomeIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  return (
    <NetflixTabIcon>
      <House size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
    </NetflixTabIcon>
  );
}

function NewHotIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  return (
    <NetflixTabIcon>
      <Flame size={24} color={color} strokeWidth={focused ? 2.4 : 2} />
    </NetflixTabIcon>
  );
}

function DownloadsIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  const { downloadingCount } = useDownloads();
  return (
    <NetflixTabIcon>
      <View>
        <CloudDownload size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
        {downloadingCount > 0 && (
          <View style={tabIconStyles.badge}>
            <Text style={tabIconStyles.badgeText}>{downloadingCount}</Text>
          </View>
        )}
      </View>
    </NetflixTabIcon>
  );
}

function SearchIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  return (
    <NetflixTabIcon>
      <Search size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
    </NetflixTabIcon>
  );
}

function ProfileIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  return (
    <NetflixTabIcon>
      <UserRound size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
    </NetflixTabIcon>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: "#E50914",
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    lineHeight: 14,
  },
});

const visibleTabNames = new Set(["index", "new", "search", "profile"]);

function MovieTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const visibleRoutes = state.routes.filter((route) =>
    visibleTabNames.has(route.name),
  );

  return (
    <View style={tabBarStyles.container}>
      <BlurView
        intensity={35}
        tint="dark"
        style={[StyleSheet.absoluteFill, tabBarStyles.blur]}
      />
      {visibleRoutes.map((route) => {
        const options = descriptors[route.key].options;
        const focused = state.routes[state.index]?.key === route.key;
        const color = focused ? "#ffffff" : "#999999";
        const label =
          typeof options.tabBarLabel === "string"
            ? options.tabBarLabel
            : options.title ?? route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: "tabLongPress",
            target: route.key,
          });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            accessibilityState={{ selected: focused }}
            testID={options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={({ pressed }) => [
              tabBarStyles.button,
              pressed && tabBarStyles.pressedButton,
            ]}
          >
            <View
              style={[
                tabBarStyles.item,
                focused && tabBarStyles.activeItem,
              ]}
            >
              {options.tabBarIcon?.({ focused, color, size: 24 })}
              <Text
                numberOfLines={1}
                style={[tabBarStyles.label, { color }]}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    marginHorizontal: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#1f1f1f",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 9999,
    overflow: "hidden",
    zIndex: 999,
    elevation: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  blur: {
    borderRadius: 9999,
  },
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  pressedButton: {
    opacity: 0.75,
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  activeItem: {
    backgroundColor: "#323232",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.2,
    marginTop: 1,
  },
});

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <MovieTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="downloads"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ color, focused }) => <HomeIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="new"
        options={{
          title: "New & Hot",
          tabBarLabel: "New & Hot",
          tabBarIcon: ({ color, focused }) => <NewHotIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clips"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarLabel: "Search",
          tabBarIcon: ({ color, focused }) => <SearchIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "My SMO",
          tabBarLabel: "My SMO",
          tabBarIcon: ({ color, focused }) => <ProfileIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen name="games" options={{ href: null }} />
      <Tabs.Screen name="originals" options={{ href: null }} />
    </Tabs>
  );
}
