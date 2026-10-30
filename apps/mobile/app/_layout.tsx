import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from "@expo-google-fonts/instrument-sans";
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
} from "@expo-google-fonts/newsreader";
import { useFonts } from "expo-font";
import { AppProviders } from "@/providers/app-providers";
import { useLumenSession } from "@/providers/session-provider";

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useLumenSession();
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    Newsreader_400Regular,
    Newsreader_500Medium,
  });
  const paired = status === "paired";
  const ready = status !== "loading" && fontsLoaded;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Protected guard={paired}>
        <Stack.Screen name="operar" />
      </Stack.Protected>
      <Stack.Protected guard={!paired}>
        <Stack.Screen name="conectar" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
