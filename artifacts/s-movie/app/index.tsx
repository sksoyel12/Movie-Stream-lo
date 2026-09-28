import { Redirect } from "expo-router";

export default function Index() {
  // Use the official cinematic boot splash before entering the home tabs.
  return <Redirect href="/onboarding?mode=boot" />;
}
